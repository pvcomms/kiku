// Pull newsletters out of a mailbox over IMAP into ~/Kiku/mail/, one cleaned HTML file each,
// and hand the new ones to the inbox. Two passes per chunk: headers first, so nothing but the
// newsletters is ever fetched in full; then the source of the matches. State is one JSON file:
// a UID cursor per account and folder, and the message ids already taken.
import fs from "node:fs/promises";
import path from "node:path";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import type { Account } from "./accounts.ts";
import {
  fromAddress,
  headerDate,
  headerLooksLikeNewsletter,
  headerMessageId,
  isSelf,
} from "./detect.ts";
import { cleanHtml } from "./sanitize.ts";
import { hashId } from "../podcasts.ts";

/**
 * A rolling window, applied on every pass and not only the first. Proton Bridge backfills a
 * fresh local mailbox for weeks, handing out new UIDs for years-old mail; without this the
 * cursor would ingest the whole archive. The inbox starts from now, the way a new feed does.
 */
export const WINDOW_DAYS = 30;
const FETCH_CHUNK = 250;
const SEEN_CAP = 20_000; // message ids are ~60 bytes; a busy mailbox sees 5,000 letters a month

export type Letter = {
  id: string;
  messageId: string;
  account: string;
  subject: string;
  from: string; // display name, or the address
  fromAddress: string;
  date: string; // ISO
  file: string; // basename inside the mail dir
};

type Cursor = {
  uidValidity: number;
  lastUid: number;
  lastSynced?: string;
  lastError?: string;
};
type State = { cursors: Record<string, Cursor>; seen: string[] };

export class MailStore {
  readonly dir: string;
  private file: string;
  private state: State = { cursors: {}, seen: [] };
  private chain: Promise<unknown> = Promise.resolve();

  constructor(home: string) {
    this.dir = path.join(home, "mail");
    this.file = path.join(home, "mail.json");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, "utf8"));
      this.state = {
        cursors:
          parsed?.cursors && typeof parsed.cursors === "object"
            ? parsed.cursors
            : {},
        seen: Array.isArray(parsed?.seen) ? parsed.seen : [],
      };
    } catch {
      this.state = { cursors: {}, seen: [] };
    }
  }

  cursor(account: string, folder: string): Cursor | undefined {
    return this.state.cursors[`${account}/${folder}`];
  }

  setCursor(account: string, folder: string, c: Cursor): Promise<void> {
    return this.mutate((s) => {
      s.cursors[`${account}/${folder}`] = c;
    });
  }

  hasSeen(messageId: string): boolean {
    return this.state.seen.includes(messageId);
  }

  markSeen(messageIds: string[]): Promise<void> {
    return this.mutate((s) => {
      const set = new Set(s.seen);
      for (const m of messageIds) set.add(m);
      s.seen = [...set].slice(-SEEN_CAP);
    });
  }

  /** Removing an account forgets its cursor; its letters on disk stay until the library says otherwise. */
  forget(account: string): Promise<void> {
    return this.mutate((s) => {
      for (const k of Object.keys(s.cursors))
        if (k.startsWith(account + "/")) delete s.cursors[k];
    });
  }

  pathOf(file: string): string {
    return path.join(this.dir, path.basename(file));
  }

  private mutate(fn: (s: State) => void): Promise<void> {
    const next = this.chain.then(async () => {
      fn(this.state);
      const tmp = this.file + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(this.state, null, 2));
      await fs.rename(tmp, this.file);
    });
    this.chain = next.catch(() => {});
    return next;
  }
}

/** A parsed message as a letter, without touching the disk. Exported so a test needs no server. */
export function letterFrom(
  parsed: ParsedMail,
  account: string,
  fallbackId: string,
): { letter: Letter; html: string } {
  const messageId = parsed.messageId ?? fallbackId;
  const id = hashId("mail", messageId);
  const from = parsed.from?.value?.[0];
  const address = (from?.address ?? "unknown").toLowerCase();
  const raw =
    typeof parsed.html === "string" && parsed.html.trim()
      ? parsed.html
      : (parsed.textAsHtml ?? `<p>${escapeText(parsed.text ?? "")}</p>`);
  return {
    letter: {
      id,
      messageId,
      account,
      subject: parsed.subject?.trim() || "(no subject)",
      from: from?.name?.trim() || address,
      fromAddress: address,
      date: (parsed.date ?? new Date()).toISOString(),
      file: `${id}.html`,
    },
    html: cleanHtml(raw),
  };
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

export type SyncResult = {
  account: string;
  folder: string;
  scanned: number;
  letters: Letter[];
  /** Newsletters already in the mailbox on the first pass, marked seen and never fetched. */
  caughtUp: number;
  error?: string;
};

export async function syncFolder(
  account: Account,
  folder: string,
  store: MailStore,
  log: (line: string) => void = () => {},
): Promise<SyncResult> {
  const result: SyncResult = {
    account: account.name,
    folder,
    scanned: 0,
    letters: [],
    caughtUp: 0,
  };
  const caughtUp: string[] = [];
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: { user: account.user, pass: account.pass },
    logger: false,
    tls: account.allowInsecureTls ? { rejectUnauthorized: false } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const mailbox =
        typeof client.mailbox === "object" ? client.mailbox : null;
      const uidValidity = Number(mailbox?.uidValidity ?? 0);
      const prev = store.cursor(account.name, folder);
      const lastUid =
        prev && prev.uidValidity === uidValidity ? prev.lastUid : 0;
      const cutoffMs = Date.now() - WINDOW_DAYS * 86_400_000;
      // The first pass over a mailbox starts it caught up, the way a new feed or show does:
      // what is already there is marked seen and nothing is fetched. Only what arrives from
      // now on reaches the inbox. The window bounds how far back that first pass looks.
      const catchingUp = lastUid === 0;

      let uids: number[];
      if (lastUid === 0) {
        uids =
          (await client.search({ since: new Date(cutoffMs) }, { uid: true })) ||
          [];
      } else {
        uids = (
          (await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })) ||
          []
        ).filter((u) => u > lastUid);
      }
      uids.sort((a, b) => a - b);

      for (let i = 0; i < uids.length; i += FETCH_CHUNK) {
        const chunk = uids.slice(i, i + FETCH_CHUNK);
        const matches: number[] = [];
        for await (const msg of client.fetch(
          chunk.join(","),
          { uid: true, headers: true },
          { uid: true },
        )) {
          result.scanned++;
          const headerText = msg.headers?.toString("utf8") ?? "";
          const sent = headerDate(headerText);
          if (sent !== null && sent < cutoffMs) continue;
          if (!headerLooksLikeNewsletter(headerText)) continue;
          if (isSelf(fromAddress(headerText), account.user)) continue;
          const mid = headerMessageId(headerText);
          if (mid && store.hasSeen(mid)) continue;
          if (catchingUp) {
            if (mid) caughtUp.push(mid);
            continue;
          }
          matches.push(msg.uid);
        }
        if (caughtUp.length) {
          await store.markSeen(caughtUp);
          result.caughtUp += caughtUp.length;
          caughtUp.length = 0;
        }

        const taken: string[] = [];
        for (const uid of matches) {
          try {
            const msg = await client.fetchOne(
              String(uid),
              { source: true, uid: true },
              { uid: true },
            );
            if (!msg || !msg.source) continue;
            const parsed = await simpleParser(msg.source);
            const { letter, html } = letterFrom(
              parsed,
              account.name,
              `${account.name}:${folder}:${uidValidity}:${uid}`,
            );
            if (store.hasSeen(letter.messageId)) continue;
            await fs.writeFile(store.pathOf(letter.file), html);
            result.letters.push(letter);
            taken.push(letter.messageId);
          } catch (e) {
            // One unparsable message must not sink the folder; a dead connection does, via the outer catch.
            if (!client.usable) throw e;
            log(
              `mail: skipped ${account.name} uid ${uid}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
        await store.markSeen(taken);
        // Checkpoint per chunk: a dropped connection resumes here, not from the start of the window.
        await store.setCursor(account.name, folder, {
          uidValidity,
          lastUid: chunk[chunk.length - 1],
          lastSynced: new Date().toISOString(),
        });
      }

      await store.setCursor(account.name, folder, {
        uidValidity,
        lastUid: uids.length > 0 ? uids[uids.length - 1] : lastUid,
        lastSynced: new Date().toISOString(),
      });
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    const prev = store.cursor(account.name, folder);
    await store.setCursor(account.name, folder, {
      uidValidity: prev?.uidValidity ?? 0,
      lastUid: prev?.lastUid ?? 0,
      lastSynced: prev?.lastSynced,
      lastError: result.error,
    });
    try {
      client.close();
    } catch {
      /* already closed */
    }
  }
  return result;
}

export async function syncAll(
  accounts: Account[],
  store: MailStore,
  log: (line: string) => void = () => {},
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const account of accounts)
    for (const folder of account.folders?.length ? account.folders : ["INBOX"])
      results.push(await syncFolder(account, folder, store, log));
  return results;
}
