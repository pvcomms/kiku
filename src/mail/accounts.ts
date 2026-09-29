// The mailboxes newsletters are pulled from. One file, `~/Kiku/accounts.json`, mode 600, never
// inside the repo, never shown back with its passwords. Proton goes through the Bridge app on
// 127.0.0.1 (self-signed certificate, hence `allowInsecureTls` for that host only); Gmail takes
// an app password; any plain IMAP server works the same way.
import fs from "node:fs/promises";
import path from "node:path";

export type Account = {
  name: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  folders?: string[];
  /** Proton Mail Bridge presents a self-signed local certificate. Only honoured for loopback. */
  allowInsecureTls?: boolean;
};

/** An account as the page sees it: everything but the password. */
export type PublicAccount = Omit<Account, "pass">;

export class Accounts {
  private file: string;
  private items: Account[] = [];
  private chain: Promise<unknown> = Promise.resolve();

  constructor(home: string) {
    this.file = path.join(home, "accounts.json");
  }

  async init(): Promise<void> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, "utf8"));
      const list: unknown = Array.isArray(raw) ? raw : raw?.accounts;
      this.items = Array.isArray(list) ? list.filter(isAccount) : [];
    } catch {
      this.items = [];
    }
  }

  list(): PublicAccount[] {
    return this.items.map(({ pass: _pass, ...rest }) => rest);
  }

  /** With passwords. For the sync only. */
  all(): Account[] {
    return [...this.items];
  }

  get(name: string): Account | undefined {
    return this.items.find((a) => a.name === name);
  }

  add(account: Account): Promise<void> {
    const clean: Account = {
      ...account,
      allowInsecureTls:
        account.allowInsecureTls === true && isLoopback(account.host),
    };
    return this.mutate(() => {
      this.items = this.items.filter((a) => a.name !== clean.name);
      this.items.push(clean);
    });
  }

  async remove(name: string): Promise<boolean> {
    if (!this.get(name)) return false;
    await this.mutate(() => {
      this.items = this.items.filter((a) => a.name !== name);
    });
    return true;
  }

  private mutate(fn: () => void): Promise<void> {
    const next = this.chain.then(async () => {
      fn();
      const tmp = this.file + ".tmp";
      await fs.writeFile(
        tmp,
        JSON.stringify({ accounts: this.items }, null, 2),
        {
          mode: 0o600,
        },
      );
      await fs.rename(tmp, this.file);
      await fs.chmod(this.file, 0o600).catch(() => {});
    });
    this.chain = next.catch(() => {});
    return next;
  }
}

export function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function isAccount(a: unknown): a is Account {
  if (typeof a !== "object" || a === null) return false;
  const o = a as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    o.name.trim() !== "" &&
    typeof o.host === "string" &&
    typeof o.port === "number" &&
    typeof o.user === "string" &&
    typeof o.pass === "string" &&
    !o.pass.startsWith("PASTE")
  );
}

/** Ready-made settings for the two mailboxes people mostly have. */
export const PRESETS: Record<string, Partial<Account>> = {
  proton: {
    host: "127.0.0.1",
    port: 1143,
    secure: false,
    allowInsecureTls: true,
  },
  gmail: { host: "imap.gmail.com", port: 993, secure: true },
};
