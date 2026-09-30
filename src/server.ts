// Kiku — paste a link, a file, or the words themselves; listen anywhere on the network.
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  fromFile,
  fromHtml,
  fromText,
  fromUrl,
  splitIntoParts,
  URL_RE,
  type Extracted,
} from "./extract.ts";
import { cleanMarkdownLinks } from "./hygiene.ts";
import { Accounts, PRESETS, isAccount, type Account } from "./mail/accounts.ts";
import { stripMailChrome } from "./mail/sanitize.ts";
import { MailStore, syncAll, type Letter } from "./mail/sync.ts";
import {
  ensureTerminal,
  markdownToParagraphs,
  slugify,
  wordCount,
} from "./clean.ts";
import {
  DEFAULT_VOICE,
  durationSeconds,
  encodeMp3,
  isVoice,
  speak,
  VOICES,
} from "./tts.ts";
import { Library, kindOf, newId, type Item } from "./library.ts";
import {
  JobsStore,
  label,
  toStored,
  type Input,
  type Job,
  type Mode,
} from "./jobs.ts";
import { check, freeBytes, FREE_FLOOR_BYTES } from "./preflight.ts";
import { chooseModel, installed } from "./ollama.ts";
import { toSets, type Sets } from "./analyze.ts";
import { loadTemplate, render, toVenn } from "./artifact.ts";
import {
  ARTIFACTS_DIR,
  AUDIO_DIR,
  reconcile,
  resolveExportDir,
  type Pair,
  type Sweep,
} from "./export.ts";
import { buildFeed, formatDuration } from "./feed.ts";
import {
  Podcasts,
  fetchXml,
  hashId,
  looksLikeShow,
  parseFeed,
  type Episode,
  type Podcast,
} from "./podcasts.ts";
import {
  TextFeeds,
  parseArticleFeed,
  mapLimit,
  opmlUrls,
  sourceOf,
  type InboxItem,
  type TextFeed,
} from "./textfeeds.ts";
import { page, readPage } from "./ui.ts";
import { isLoopback, listenHost } from "./config.ts";

const PORT = Number(process.env.KIKU_PORT ?? 4747);
// Which interface to answer on: loopback unless KIKU_HOST says otherwise, so a fresh install
// is reachable from this machine and nothing else. KIKU_HOST=0.0.0.0 opens it to a home
// network you trust (the phone reads /feed.xml over Wi-Fi); on any other network leave it
// alone and reach the page over the tailnet: `tailscale serve --bg 4747` already proxies it.
const HOST = listenHost();
const HOME = process.env.KIKU_HOME ?? path.join(os.homedir(), "Kiku");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COVER = path.join(ROOT, "assets", "cover.png");
const PUBLIC_PORT = Number(process.env.KIKU_PUBLIC_PORT ?? 4748);
const TOKEN_FILE = path.join(HOME, "public-token");

const runFile = promisify(execFile);
const lib = new Library(HOME);
const podcasts = new Podcasts(HOME);
const textFeeds = new TextFeeds(HOME);
const accounts = new Accounts(HOME);
const mail = new MailStore(HOME);
const jobsStore = new JobsStore(HOME);
// Live jobs carry their input (a file job holds the bytes). Jobs restored from disk are
// already reduced to their stored shape; they are kept apart so the two cannot be confused.
const jobs: Job[] = [];
let restored: ReturnType<typeof toStored>[] = [];
let pumping = false;

function publicJob(j: Job) {
  return toStored(j);
}

function allJobs() {
  return [...jobs.map(publicJob), ...restored].slice(0, 100);
}

function touch(j: Job) {
  j.updatedAt = new Date().toISOString();
  jobsStore.saveSoon(allJobs());
}

function enqueue(
  input: Input,
  voice: string,
  speed: number,
  mode: Mode,
  sets?: Sets,
): Job {
  const job: Job = {
    id: newId(),
    status: "queued",
    mode,
    sets,
    title:
      input.kind === "text" ? (input.title ?? "Pasted text") : label(input),
    detail: "waiting",
    progress: 0,
    seconds: 0,
    itemIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    voice,
    speed,
    input,
  };
  jobs.unshift(job);
  while (jobs.length > 100) jobs.pop();
  touch(job);
  void pump();
  return job;
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const job = [...jobs].reverse().find((j) => j.status === "queued");
      if (!job) break;
      await process1(job).catch((e: unknown) => {
        job.status = "error";
        job.error = e instanceof Error ? e.message : String(e);
        job.detail = "failed";
        touch(job);
        console.error(`[kiku] job ${job.id} failed:`, job.error);
      });
    }
  } finally {
    pumping = false;
  }
}

async function extractFor(input: Input): Promise<Extracted> {
  const ex = await extractRaw(input);
  // Every link in every document passes through hygiene once, whatever door it came in by.
  return { ...ex, markdown: cleanMarkdownLinks(ex.markdown) };
}

async function extractRaw(input: Input): Promise<Extracted> {
  if (input.kind === "url") return fromUrl(input.url);
  if (input.kind === "file") return fromFile(input.name, input.buf);
  if (input.kind === "mail") {
    // The letter is already cleaned HTML on disk; nothing is fetched. The host below is a
    // placeholder the extractor needs for relative links and is never spoken or shown.
    const html = await fsp.readFile(mail.pathOf(input.file), "utf8");
    const ex = await fromHtml(
      `<!doctype html><html><head><title>${input.title.replace(/[<&]/g, " ")}</title></head><body><article>${html}</article></body></html>`,
      "https://mail.invalid/" + input.file,
    );
    return {
      ...ex,
      title: input.title,
      author: input.from,
      site: undefined,
      sourceUrl: undefined,
      sourceType: "file",
      markdown: dropLeadingTitle(stripMailChrome(ex.markdown), input.title),
    };
  }
  return fromText(input.text, input.title);
}

/** A letter's body usually opens with its own subject as a heading; the intro already says it. */
function dropLeadingTitle(md: string, title: string): string {
  const norm = (s: string) =>
    s
      .replace(/^#+\s*/, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .toLowerCase();
  const blocks = md.split(/\n{2,}/);
  return blocks.length > 1 && norm(blocks[0]) === norm(title)
    ? blocks.slice(1).join("\n\n")
    : md;
}

/**
 * The `read` half: the same extraction and the same cleaning as a reading, and then nothing
 * spoken. The paragraphs go to `text/<id>.txt` and the page shows them at `/read/:id`.
 */
async function read(job: Job, ex: Extracted) {
  const paragraphs = markdownToParagraphs(ex.markdown);
  if (paragraphs.length === 0) throw new Error("Nothing readable was found.");
  const words = wordCount(paragraphs.join(" "));
  const id = newId();
  const fileName = `${id}.txt`;
  await fsp.writeFile(
    path.join(lib.textDir, fileName),
    paragraphs.join("\n") + "\n",
  );
  const item: Item = {
    id,
    kind: "text",
    title: ex.title,
    author: ex.author,
    site: ex.site,
    sourceUrl: ex.sourceUrl,
    sourceType: ex.sourceType,
    file: fileName,
    bytes: Buffer.byteLength(paragraphs.join("\n")),
    words,
    createdAt: new Date().toISOString(),
  };
  await lib.add(item);
  job.itemIds.push(id);
  console.log(`[kiku] cleaned to read: ${item.title} (${words} words)`);
  job.status = "done";
  job.progress = 1;
  job.detail = "ready to read";
  touch(job);
}

/**
 * The `see` half: the same extraction, then a local model reads the document into sets and
 * the venn template draws them. One file, no network in it. Ollama is asked for the model and
 * released before this returns, so on a small machine the speech step never shares memory with it.
 */
async function see(job: Job, ex: Extracted) {
  const models = await installed().catch(() => null);
  if (!models)
    throw new Error(
      "Ollama is not running, and drawing needs it. Start it with: brew services start ollama",
    );
  const choice = chooseModel(models);
  if (!choice.ok) throw new Error(`${choice.reason}. Fix: ${choice.fix}`);

  const sets: Sets = job.sets ?? 3;
  const words = wordCount(ex.markdown);
  if (words < 40) throw new Error("Too little to draw: under forty words.");
  job.status = "thinking";
  job.detail = `${choice.model} is reading ${words.toLocaleString()} words`;
  touch(job);
  const { spec, repaired, trimmed } = await toSets(
    ex.markdown,
    ex.title,
    sets,
    choice.model,
  );

  job.status = "drawing";
  job.detail = [
    `${sets} sets`,
    repaired ? "after one correction" : "",
    trimmed ? "from the opening, outline and close — it was long" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  touch(job);
  const title = spec.title.trim() || ex.title;
  const id = newId();
  const fileName = `${id}-${slugify(title)}.html`;
  const createdAt = new Date().toISOString();
  const html = render(loadTemplate(), toVenn(spec), {
    title,
    sourceUrl: ex.sourceUrl,
    author: ex.author,
    model: choice.model,
    createdAt,
  });
  const out = path.join(lib.artifactsDir, fileName);
  await fsp.writeFile(out, html);

  const item: Item = {
    id,
    kind: "artifact",
    artifactKind: "venn",
    sets,
    model: choice.model,
    title,
    author: ex.author,
    site: ex.site,
    sourceUrl: ex.sourceUrl,
    sourceType: ex.sourceType,
    file: fileName,
    bytes: Buffer.byteLength(html),
    words,
    createdAt,
  };
  await lib.add(item);
  job.itemIds.push(id);
  void exportItems([item]);
  console.log(
    `[kiku] drawn: ${title} (${choice.model}${repaired ? ", repaired" : ""}${trimmed ? ", trimmed" : ""})`,
  );
  job.status = "done";
  job.progress = 1;
  job.detail = "drawn";
  touch(job);
}

async function process1(job: Job) {
  job.status = "extracting";
  job.detail = "fetching and cleaning";
  touch(job);
  const ex = await extractFor(job.input);
  job.title = ex.title;
  if (job.mode === "see") return see(job, ex);
  if (job.mode === "read") return read(job, ex);
  const parts = splitIntoParts(ex);
  touch(job);

  for (const [i, part] of parts.entries()) {
    const body = markdownToParagraphs(part.markdown);
    if (body.length === 0) throw new Error("Nothing readable was found.");
    const intro = [
      ensureTerminal(part.title),
      ex.author ? ensureTerminal(`By ${ex.author}`) : "",
      ex.sourceType === "url" && ex.site
        ? ensureTerminal(`From ${ex.site}`)
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    const paragraphs = [intro, ...body];
    const words = wordCount(paragraphs.join(" "));
    const id = newId();
    const slug = slugify(part.title);
    const textPath = path.join(lib.textDir, `${id}.txt`);
    const wavPath = path.join(os.tmpdir(), `kiku-${id}.wav`);
    const fileName = `${id}-${slug}.mp3`;
    const mp3Path = path.join(lib.audioDir, fileName);
    await fsp.writeFile(textPath, paragraphs.join("\n") + "\n");

    job.status = "reading";
    job.detail =
      parts.length > 1
        ? `part ${i + 1} of ${parts.length} · ${words.toLocaleString()} words`
        : `${words.toLocaleString()} words`;
    touch(job);
    await speak(textPath, wavPath, job.voice, job.speed, (p) => {
      job.progress = (i + p.done / p.total) / parts.length;
      job.seconds = p.seconds;
      job.detail =
        (parts.length > 1 ? `part ${i + 1}/${parts.length} · ` : "") +
        `${p.done}/${p.total} paragraphs · ${formatDuration(Math.round(p.seconds))} so far`;
      touch(job);
    });

    job.status = "encoding";
    job.detail = "encoding mp3";
    touch(job);
    await encodeMp3(
      wavPath,
      mp3Path,
      {
        title: part.title,
        artist: ex.author ?? ex.site ?? "Kiku",
        album: "Kiku",
        comment: ex.sourceUrl,
        date: (ex.published ?? new Date().toISOString()).slice(0, 4),
        track: parts.length > 1 ? i + 1 : undefined,
      },
      fs.existsSync(COVER) ? COVER : undefined,
    );
    fsp.unlink(wavPath).catch(() => {});

    const item: Item = {
      id,
      title: part.title,
      author: ex.author,
      site: ex.site,
      sourceUrl: ex.sourceUrl,
      sourceType: ex.sourceType,
      file: fileName,
      bytes: (await fsp.stat(mp3Path)).size,
      seconds: await durationSeconds(mp3Path),
      words,
      voice: job.voice,
      speed: job.speed,
      createdAt: new Date().toISOString(),
    };
    await lib.add(item);
    job.itemIds.push(id);
    void exportItems([item]);
    console.log(
      `[kiku] ready: ${item.title} (${formatDuration(item.seconds ?? 0)})`,
    );
  }
  job.status = "done";
  job.progress = 1;
  job.detail = parts.length > 1 ? `${parts.length} parts ready` : "ready";
  touch(job);
}

// ---------- Proton Drive copies (an archive the phone can reach; never read back) ----------

function exportPairs(dir: string, items: Item[]): Pair[] {
  // A text item is the page's own reading view; it is not a file anyone keeps.
  return items
    .filter((it) => kindOf(it) !== "text")
    .map((it) => ({
      id: it.id,
      src: lib.pathOf(it),
      dest: path.join(
        dir,
        kindOf(it) === "artifact" ? ARTIFACTS_DIR : AUDIO_DIR,
        it.file,
      ),
    }));
}

let exporting = false;
/**
 * Copy what is not yet there. Resolves the folder every time, so signing into Proton Drive
 * after kiku started is enough. Never throws: a reading is done when it is in ~/Kiku.
 */
async function exportItems(items: Item[]): Promise<Sweep | null> {
  const dir = resolveExportDir();
  if (!dir || exporting) return null;
  exporting = true;
  try {
    const sweep = await reconcile(exportPairs(dir, items), (l) =>
      console.log(`[kiku] ${l}`),
    );
    const now = new Date().toISOString();
    for (const id of [...sweep.copied, ...sweep.present]) {
      const it = lib.get(id);
      if (it && !it.exportedAt) await lib.add({ ...it, exportedAt: now });
    }
    return sweep;
  } finally {
    exporting = false;
  }
}

// ---------- text feeds (subscribe to a blog/newsletter; new posts land in the inbox) ----------

async function subscribeFeed(feedUrl: string, xml?: string): Promise<TextFeed> {
  const already = textFeeds.findFeed(feedUrl);
  if (already) return already;
  const { title, siteUrl, articles } = parseArticleFeed(
    xml ?? (await fetchXml(feedUrl)),
    40,
  );
  const feed: TextFeed = {
    id: newId(),
    title,
    feedUrl,
    siteUrl,
    addedAt: new Date().toISOString(),
    // A feed starts caught-up: only posts published after subscribing reach the inbox.
    seen: articles.map((a) => a.guid),
  };
  await textFeeds.addFeed(feed);
  return feed;
}

let pollingFeeds = false;
async function pollTextFeeds(): Promise<void> {
  if (pollingFeeds) return;
  pollingFeeds = true;
  try {
    await mapLimit(textFeeds.listFeeds(), 6, async (feed) => {
      try {
        const { articles } = parseArticleFeed(await fetchXml(feed.feedUrl), 40);
        await textFeeds.applyPoll(feed.id, articles);
      } catch (e) {
        await textFeeds.applyPoll(
          feed.id,
          [],
          e instanceof Error ? e.message : String(e),
        );
      }
    });
  } finally {
    pollingFeeds = false;
  }
}

// ---------- shows (a new episode is an inbox item; Listen plays the publisher's file) ----------

async function subscribeShow(feedUrl: string, xml?: string): Promise<Podcast> {
  const already = podcasts.find(feedUrl);
  if (already) return already;
  const parsed = parseFeed(xml ?? (await fetchXml(feedUrl)), 20);
  if (parsed.episodes.length === 0)
    throw new Error("That feed has no episodes with audio.");
  const pod: Podcast = {
    id: newId(),
    title: parsed.title,
    feedUrl,
    artworkUrl: parsed.artworkUrl,
    addedAt: new Date().toISOString(),
    // A show starts caught up: only episodes published after subscribing reach the inbox.
    seen: parsed.episodes.map((e) => e.id),
  };
  await podcasts.add(pod);
  return pod;
}

function episodeItem(show: Podcast, ep: Episode): InboxItem {
  return {
    id: hashId("inbox", show.id + ep.id),
    source: "show",
    feedId: show.id,
    feedTitle: show.title,
    title: ep.title,
    link: "",
    pubDate: ep.pubDate,
    summary: ep.description || undefined,
    enclosureUrl: ep.enclosureUrl,
    seconds: ep.seconds || undefined,
    artworkUrl: show.artworkUrl,
  };
}

let pollingShows = false;
async function pollShows(): Promise<void> {
  if (pollingShows) return;
  pollingShows = true;
  try {
    await mapLimit(podcasts.list(), 6, async (show) => {
      try {
        const { episodes } = parseFeed(await fetchXml(show.feedUrl), 20);
        const fresh = await podcasts.applyPoll(show.id, episodes);
        await textFeeds.addToInbox(fresh.map((ep) => episodeItem(show, ep)));
      } catch (e) {
        await podcasts.applyPoll(
          show.id,
          [],
          e instanceof Error ? e.message : String(e),
        );
      }
    });
  } finally {
    pollingShows = false;
  }
}

// ---------- mail (newsletters pulled from the mailbox; the paid Substack path) ----------

function letterItem(letter: Letter): InboxItem {
  return {
    id: hashId("inbox", letter.id),
    source: "mail",
    feedId: "mail:" + letter.account,
    feedTitle: letter.from,
    title: letter.subject,
    link: "",
    pubDate: letter.date,
    mailFile: letter.file,
    from: letter.from,
  };
}

let syncingMail = false;
let mailErrors: Record<string, string | undefined> = {};
async function syncMail(): Promise<void> {
  if (syncingMail || accounts.all().length === 0) return;
  syncingMail = true;
  try {
    const results = await syncAll(accounts.all(), mail, (l) =>
      console.log(`[kiku] ${l}`),
    );
    for (const r of results) {
      mailErrors[r.account] = r.error;
      console.log(
        r.error
          ? `[kiku] mail ${r.account}: ${r.error}`
          : r.caughtUp
            ? `[kiku] mail ${r.account}/${r.folder}: caught up — ${r.caughtUp} newsletters already there were marked seen; new ones from now on`
            : `[kiku] mail ${r.account}/${r.folder}: ${r.letters.length} new, ${r.scanned} scanned`,
      );
      await textFeeds.addToInbox(r.letters.map(letterItem));
    }
  } finally {
    syncingMail = false;
  }
}

/** Every source, on the one timer. Each kind fails on its own and never holds up the others. */
async function pollAll(): Promise<void> {
  await Promise.all([pollTextFeeds(), pollShows(), syncMail()]);
}

/**
 * One URL, whichever kind it turns out to be: a feed with enclosures is a show, any other feed
 * is a text feed. Used by the setup page and by an OPML import, where nobody labelled them.
 */
async function subscribeAny(
  url: string,
): Promise<{ kind: "show"; show: Podcast } | { kind: "feed"; feed: TextFeed }> {
  const haveShow = podcasts.find(url);
  if (haveShow) return { kind: "show", show: haveShow };
  const haveFeed = textFeeds.findFeed(url);
  if (haveFeed) return { kind: "feed", feed: haveFeed };
  const xml = await fetchXml(url);
  if (looksLikeShow(xml))
    return { kind: "show", show: await subscribeShow(url, xml) };
  return { kind: "feed", feed: await subscribeFeed(url, xml) };
}

function sourceCount(): number {
  return (
    textFeeds.listFeeds().length +
    podcasts.list().length +
    accounts.list().length
  );
}

// ---------- network identity ----------

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (/^(utun|awdl|llw|bridge|lo)/.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push(a.address);
    }
  }
  return out;
}

let tailnetOrigin: string | null = null;

/**
 * Origins that reach this page: the tailnet HTTPS name when Tailscale is up, then this machine
 * (loopback) or, when the page answers on the network, its LAN name and addresses. A LAN name
 * is only listed when something is listening there, so a loopback install never advertises
 * an address that would refuse the phone.
 */
function hostList(): string[] {
  const name = os.hostname().toLowerCase();
  const own = isLoopback(HOST)
    ? [`http://localhost:${PORT}`]
    : [name.endsWith(".local") ? name : `${name}.local`, ...lanAddresses()].map(
        (h) => `http://${h}:${PORT}`,
      );
  const all = tailnetOrigin ? [tailnetOrigin, ...own] : own;
  return [...new Set(all)];
}

/** Drawing needs a local model. Without Ollama and a model that fits, the page hides `see`. */
async function canSee(): Promise<boolean> {
  const models = await installed(800).catch(() => null);
  return models !== null && chooseModel(models).ok;
}

async function detectTailnet(): Promise<void> {
  try {
    const { stdout } = await runFile("tailscale", ["status", "--json"], {
      timeout: 4000,
    });
    const st = JSON.parse(stdout);
    const dns = String(st?.Self?.DNSName ?? "").replace(/\.$/, "");
    if (st?.BackendState === "Running" && dns) {
      const { stdout: serve } = await runFile(
        "tailscale",
        ["serve", "status"],
        { timeout: 4000 },
      ).catch(() => ({ stdout: "" }));
      tailnetOrigin = serve.includes(`https://${dns}`)
        ? `https://${dns}`
        : serve.includes(`http://${dns}`)
          ? `http://${dns}`
          : null;
    } else tailnetOrigin = null;
  } catch {
    tailnetOrigin = null;
  }
}

/** First non-empty candidate; Shortcuts may send an empty string or a list of strings. */
function firstText(...cands: unknown[]): string {
  for (const c of cands) {
    const v = Array.isArray(c)
      ? c.filter((x) => typeof x === "string").join("\n")
      : c;
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}
// ---------- http ----------

const app = new Hono();

app.use("*", async (c, next) => {
  await next();
  const p = c.req.path;
  if (
    (p === "/api/jobs" && c.req.method === "GET") ||
    p.startsWith("/assets/") ||
    p === "/api/library"
  )
    return;
  console.log(
    `[kiku] ${c.req.method} ${p} ${c.res.status} · ${(c.req.header("user-agent") ?? "").slice(0, 70)}`,
  );
});

app.get("/manifest.webmanifest", (c) => {
  c.header("content-type", "application/manifest+json");
  return c.body(
    JSON.stringify({
      name: "Kiku",
      short_name: "Kiku",
      start_url: "/",
      display: "standalone",
      background_color: "#F7F6F3",
      theme_color: "#F7F6F3",
      icons: [{ src: "/cover.png", sizes: "1400x1400", type: "image/png" }],
    }),
  );
});

function baseOf(c: {
  req: { header: (n: string) => string | undefined };
}): string {
  const host =
    c.req.header("x-forwarded-host") ??
    c.req.header("host") ??
    `localhost:${PORT}`;
  const proto = c.req.header("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

app.get("/", async (c) =>
  c.html(
    page({
      voices: VOICES,
      defaultVoice: DEFAULT_VOICE,
      hosts: hostList(),
      // With nothing subscribed the page is the setup page. `?setup=1` shows it again any time.
      setup: sourceCount() === 0 || c.req.query("setup") === "1",
      see: await canSee(),
    }),
  ),
);

// A cleaned reading as a page: the text of any item that has one, in the house type.
app.get("/read/:id", async (c) => {
  const id = path.basename(c.req.param("id"));
  const item = lib.get(id);
  const txt = await fsp
    .readFile(path.join(lib.textDir, `${id}.txt`), "utf8")
    .catch(() => null);
  if (!item || txt === null) return c.notFound();
  return c.html(
    readPage({
      title: item.title,
      author: item.author,
      site: item.site,
      sourceUrl: item.sourceUrl,
      paragraphs: txt.split("\n").filter((l) => l.trim()),
      words: item.words,
    }),
  );
});

// The full readiness report, not a heartbeat. The page reads it to show what is missing;
// bin/doctor reads it the same way with the slow checks turned on.
app.get("/health", async (c) => {
  const report = await check({
    deep: c.req.query("deep") === "1",
    home: HOME,
    mailHosts: accounts.all().map((a) => ({ host: a.host, port: a.port })),
  });
  return c.json({
    ...report,
    items: lib.list().length,
    active: jobs.filter((j) => !["done", "error"].includes(j.status)).length,
    exportDir: resolveExportDir(),
    sources: sourceCount(),
  });
});

app.post("/api/export/reconcile", async (c) => {
  if (!resolveExportDir())
    return c.json({ error: "No Proton Drive folder on this machine." }, 409);
  const sweep = await exportItems(lib.list());
  if (!sweep) return c.json({ error: "A sweep is already running." }, 409);
  return c.json(sweep);
});

function asMode(raw: unknown): Mode {
  return raw === "see" ? "see" : raw === "read" ? "read" : "listen";
}

function asSets(raw: unknown): Sets {
  return Number(raw) === 5 ? 5 : 3;
}

/** A long reading writes a few hundred MB before it is done. Refuse to begin one on a full disk. */
async function roomToWork(): Promise<string | null> {
  const free = await freeBytes(HOME).catch(() => null);
  if (free === null || free >= FREE_FLOOR_BYTES) return null;
  return `Only ${(free / 1e9).toFixed(1)}GB free on ${HOME}; kiku needs ${FREE_FLOOR_BYTES / 1e9}GB to start a reading.`;
}

app.post("/api/jobs", async (c) => {
  const ct = c.req.header("content-type") ?? "";
  const inputs: Input[] = [];
  let voice = DEFAULT_VOICE;
  let speed = 1;
  let mode: Mode = "listen";
  let sets: Sets = 3;
  let title: string | undefined;

  const takeText = (raw: unknown) => {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) return;
    const lines = s
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 0 && lines.every((l) => URL_RE.test(l))) {
      for (const l of lines) inputs.push({ kind: "url", url: l });
    } else {
      inputs.push({ kind: "text", text: s, title });
    }
  };

  if (ct.includes("application/json")) {
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (typeof body.voice === "string") voice = body.voice;
    if (body.speed !== undefined) speed = Number(body.speed);
    if (typeof body.title === "string") title = body.title;
    mode = asMode(body.mode);
    sets = asSets(body.sets);
    takeText(firstText(body.url, body.input, body.text));
  } else if (
    ct.includes("multipart/form-data") ||
    ct.includes("application/x-www-form-urlencoded")
  ) {
    const body = await c.req.parseBody({ all: true });
    if (typeof body.voice === "string") voice = body.voice;
    if (typeof body.speed === "string" && body.speed)
      speed = Number(body.speed);
    if (typeof body.title === "string" && body.title) title = body.title;
    mode = asMode(body.mode);
    sets = asSets(body.sets);
    const files = ([] as unknown[]).concat(body.file ?? []);
    for (const f of files) {
      if (f instanceof File && f.size > 0)
        inputs.push({
          kind: "file",
          name: f.name,
          buf: Buffer.from(await f.arrayBuffer()),
        });
    }
    takeText(firstText(body.input, body.url, body.text));
  } else {
    takeText(await c.req.text());
  }

  if (!isVoice(voice)) voice = DEFAULT_VOICE;
  if (!Number.isFinite(speed) || speed < 0.7 || speed > 1.6) speed = 1;
  if (inputs.length === 0)
    return c.json({ error: "Give me a link, a file, or some text." }, 400);
  const full = await roomToWork();
  if (full) return c.json({ error: full }, 507);

  const created = inputs.map((inp) => enqueue(inp, voice, speed, mode, sets));
  return c.json(
    {
      id: created[0].id,
      ids: created.map((j) => j.id),
      jobs: created.map(publicJob),
    },
    202,
  );
});

app.get("/api/jobs", (c) => c.json(allJobs().slice(0, 30)));

app.get("/api/jobs/:id", (c) => {
  const j = allJobs().find((x) => x.id === c.req.param("id"));
  return j ? c.json(j) : c.json({ error: "No such job." }, 404);
});

// A job that was interrupted keeps what it needs to be tried once more. A file job cannot
// be: its bytes were never written to disk, so it says so instead of pretending.
app.post("/api/jobs/:id/again", async (c) => {
  const j = allJobs().find((x) => x.id === c.req.param("id"));
  if (!j) return c.json({ error: "No such job." }, 404);
  if (!j.again)
    return c.json(
      { error: "That one was a file. Submit the file again." },
      400,
    );
  const full = await roomToWork();
  if (full) return c.json({ error: full }, 507);
  restored = restored.filter((x) => x.id !== j.id);
  const job = enqueue(j.again, j.voice, j.speed, j.mode, j.sets);
  return c.json(publicJob(job), 202);
});

// Only a job restored from disk can be dismissed; a live one is either running or will fade.
app.delete("/api/jobs/:id", async (c) => {
  const id = c.req.param("id");
  const before = restored.length;
  restored = restored.filter((x) => x.id !== id);
  if (restored.length === before) return c.json({ error: "No such job." }, 404);
  await jobsStore.write(allJobs());
  return c.json({ ok: true });
});

// ---------- playback positions (so the phone, the iPad and the Mac resume the same spot) ----------
const POS_FILE = path.join(HOME, "positions.json");
let positions: Record<string, { seconds: number; updatedAt: string }> = {};
async function loadPositions() {
  try {
    positions = JSON.parse(await fsp.readFile(POS_FILE, "utf8"));
  } catch {
    positions = {};
  }
}
let posTimer: NodeJS.Timeout | null = null;
function savePositionsSoon() {
  if (posTimer) return;
  posTimer = setTimeout(() => {
    posTimer = null;
    fsp.writeFile(POS_FILE, JSON.stringify(positions)).catch(() => {});
  }, 1500);
}

app.get("/api/positions", (c) => c.json(positions));
app.put("/api/position/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { seconds?: unknown };
  const seconds = Number(body.seconds);
  if (!Number.isFinite(seconds) || seconds < 0)
    return c.json({ error: "seconds?" }, 400);
  positions[id] = {
    seconds: Math.floor(seconds),
    updatedAt: new Date().toISOString(),
  };
  savePositionsSoon();
  return c.json({ ok: true });
});

app.get("/api/library", (c) =>
  c.json({ base: baseOf(c), items: lib.list(), positions }),
);

app.delete("/api/library/:id", async (c) => {
  const ok = await lib.remove(c.req.param("id"));
  if (ok) {
    delete positions[c.req.param("id")];
    savePositionsSoon();
  }
  return ok ? c.json({ ok: true }) : c.json({ error: "No such item." }, 404);
});

app.get("/feed.xml", (c) => {
  c.header("content-type", "application/rss+xml; charset=utf-8");
  c.header("cache-control", "no-cache");
  return c.body(buildFeed(lib.list(), baseOf(c)));
});

// ---------- real podcasts (subscribe by feed URL, play the enclosure directly) ----------

app.post("/api/podcasts", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { feedUrl?: unknown };
  const feedUrl = typeof body.feedUrl === "string" ? body.feedUrl.trim() : "";
  if (!/^https?:\/\//i.test(feedUrl))
    return c.json({ error: "Give me a podcast RSS feed URL." }, 400);

  const already = podcasts.find(feedUrl);
  if (already) return c.json(already);
  try {
    return c.json(await subscribeShow(feedUrl), 201);
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "Couldn't read that feed." },
      400,
    );
  }
});

app.get("/api/podcasts", (c) => c.json(podcasts.list()));

app.delete("/api/podcasts/:id", async (c) => {
  const id = c.req.param("id");
  const ok = await podcasts.remove(id);
  if (ok) await textFeeds.removeBySource(id);
  return ok ? c.json({ ok: true }) : c.json({ error: "No such show." }, 404);
});

app.get("/api/podcasts/:id/episodes", async (c) => {
  const show = podcasts.get(c.req.param("id"));
  if (!show) return c.json({ error: "No such show." }, 404);
  try {
    const { episodes } = parseFeed(await fetchXml(show.feedUrl), 20);
    return c.json({ show, episodes });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "Couldn't read that feed." },
      502,
    );
  }
});

// ---------- text feeds + inbox (subscribe to a blog; new posts wait to be read aloud) ----------

app.post("/api/feeds", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    feedUrl?: unknown;
  };
  const feedUrl = typeof body.feedUrl === "string" ? body.feedUrl.trim() : "";
  if (!/^https?:\/\//i.test(feedUrl))
    return c.json({ error: "Give me a feed URL." }, 400);
  try {
    return c.json(await subscribeFeed(feedUrl), 201);
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "Couldn't read that feed." },
      400,
    );
  }
});

app.get("/api/feeds", (c) => c.json(textFeeds.listFeeds()));

app.delete("/api/feeds/:id", async (c) => {
  const ok = await textFeeds.removeFeed(c.req.param("id"));
  return ok ? c.json({ ok: true }) : c.json({ error: "No such feed." }, 404);
});

// Check every source now: text feeds, shows and mail. The name is older than the shows and mail.
app.post("/api/feeds/poll", async (c) => {
  void pollAll();
  return c.json({ ok: true });
});

// Bulk-subscribe: a list of URLs, or an OPML file's text, e.g. from RSS Guard or any reader.
// Each URL becomes a show or a text feed by what it contains. Already-subscribed ones are skipped.
app.post("/api/feeds/import", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    feeds?: unknown;
    opml?: unknown;
    kind?: unknown; // "feed" | "show" to say what they all are; otherwise each is looked at
  };
  const forced =
    body.kind === "feed" || body.kind === "show" ? body.kind : null;
  const listed = (Array.isArray(body.feeds) ? body.feeds : [])
    .map((f) =>
      f && typeof f === "object" ? (f as { feedUrl?: unknown }).feedUrl : f,
    )
    .filter(
      (u): u is string => typeof u === "string" && /^https?:\/\//i.test(u),
    );
  const fromOpml = typeof body.opml === "string" ? opmlUrls(body.opml) : [];
  const urls = [...new Set([...listed, ...fromOpml])];
  const results = await mapLimit(urls, 8, async (feedUrl) => {
    if (textFeeds.findFeed(feedUrl) || podcasts.find(feedUrl))
      return { feedUrl, status: "skipped" as const };
    try {
      const r =
        forced === "show"
          ? { kind: "show" as const, show: await subscribeShow(feedUrl) }
          : forced === "feed"
            ? { kind: "feed" as const, feed: await subscribeFeed(feedUrl) }
            : await subscribeAny(feedUrl);
      return {
        feedUrl,
        status: "added" as const,
        kind: r.kind,
        title: r.kind === "show" ? r.show.title : r.feed.title,
      };
    } catch (e) {
      return {
        feedUrl,
        status: "failed" as const,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
  return c.json({
    added: results.filter((r) => r.status === "added").length,
    shows: results.filter((r) => r.status === "added" && r.kind === "show")
      .length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed"),
  });
});

// ---------- sources, all three kinds in one place (the setup page and the Sources section) ----------

app.get("/api/sources", (c) =>
  c.json({
    feeds: textFeeds.listFeeds(),
    shows: podcasts.list(),
    mail: accounts.list().map((a) => ({
      ...a,
      lastError: mailErrors[a.name],
      lastSynced: mail.cursor(a.name, a.folders?.[0] ?? "INBOX")?.lastSynced,
    })),
    presets: PRESETS,
  }),
);

// { kind: "auto" | "feed" | "show", url } or { kind: "mail", ...account }
app.post("/api/sources", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const kind = body.kind;
  try {
    if (kind === "mail") {
      const preset =
        typeof body.preset === "string" ? (PRESETS[body.preset] ?? {}) : {};
      const account = {
        ...preset,
        name: body.name,
        host: body.host ?? preset.host,
        port: body.port !== undefined ? Number(body.port) : preset.port,
        secure:
          body.secure !== undefined ? body.secure === true : preset.secure,
        user: body.user,
        pass: body.pass,
        folders: Array.isArray(body.folders)
          ? body.folders.filter((f): f is string => typeof f === "string")
          : undefined,
        allowInsecureTls:
          body.allowInsecureTls !== undefined
            ? body.allowInsecureTls === true
            : preset.allowInsecureTls,
      };
      if (!isAccount(account))
        return c.json(
          { error: "A mailbox needs a name, host, port, user and password." },
          400,
        );
      await accounts.add(account as Account);
      void syncMail();
      return c.json(
        {
          kind: "mail",
          account: accounts.list().find((a) => a.name === account.name),
        },
        201,
      );
    }
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!/^https?:\/\//i.test(url))
      return c.json({ error: "Give me a feed URL." }, 400);
    if (kind === "show")
      return c.json({ kind: "show", show: await subscribeShow(url) }, 201);
    if (kind === "feed")
      return c.json({ kind: "feed", feed: await subscribeFeed(url) }, 201);
    return c.json(await subscribeAny(url), 201);
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "Couldn't add that." },
      400,
    );
  }
});

app.delete("/api/sources/mail/:name", async (c) => {
  const name = c.req.param("name");
  const ok = await accounts.remove(name);
  if (!ok) return c.json({ error: "No such mailbox." }, 404);
  await mail.forget(name);
  await textFeeds.removeBySource("mail:" + name);
  delete mailErrors[name];
  return c.json({ ok: true });
});

app.post("/api/mail/sync", async (c) => {
  if (accounts.all().length === 0)
    return c.json({ error: "No mailbox is set up." }, 409);
  void syncMail();
  return c.json({ ok: true });
});

// ---------- the inbox and its four verbs ----------

app.get("/api/inbox", (c) =>
  c.json(textFeeds.listInbox().map((it) => ({ ...it, source: sourceOf(it) }))),
);

/** What the pipeline is given for an inbox item; null for a show, which has audio already. */
function inputFor(item: InboxItem): Input | null {
  switch (sourceOf(item)) {
    case "show":
      return null;
    case "mail":
      return {
        kind: "mail",
        file: item.mailFile ?? "",
        title: item.title,
        from: item.from,
      };
    default:
      return { kind: "url", url: item.link };
  }
}

// Listen: a feed or a letter is read aloud through the pipeline; an episode plays as it is.
app.post("/api/inbox/:id/listen", async (c) => {
  const item = await textFeeds.removeFromInbox(c.req.param("id"));
  if (!item) return c.json({ error: "No such item." }, 404);
  const input = inputFor(item);
  if (!input)
    return c.json({
      play: {
        id: item.id,
        file: item.enclosureUrl,
        title: item.title,
        by: item.feedTitle,
        art: item.artworkUrl ?? "",
      },
    });
  const full = await roomToWork();
  if (full) {
    await textFeeds.addToInbox([item]);
    return c.json({ error: full }, 507);
  }
  const job = enqueue(input, DEFAULT_VOICE, 1, "listen");
  return c.json(publicJob(job), 202);
});

// See: drawn as sets. Not for an episode; there is no text to draw from.
app.post("/api/inbox/:id/see", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { sets?: unknown };
  const item = textFeeds.listInbox().find((i) => i.id === c.req.param("id"));
  if (!item) return c.json({ error: "No such item." }, 404);
  const input = inputFor(item);
  if (!input)
    return c.json({ error: "An episode has no text to draw from." }, 400);
  await textFeeds.removeFromInbox(item.id);
  const job = enqueue(input, DEFAULT_VOICE, 1, "see", asSets(body.sets));
  return c.json(publicJob(job), 202);
});

// Read: cleaned and kept as text, to read on the page. An episode gives its show notes.
app.post("/api/inbox/:id/read", async (c) => {
  const item = await textFeeds.removeFromInbox(c.req.param("id"));
  if (!item) return c.json({ error: "No such item." }, 404);
  const input: Input = inputFor(item) ?? {
    kind: "text",
    text: item.summary || item.title,
    title: item.title,
  };
  const job = enqueue(input, DEFAULT_VOICE, 1, "read");
  return c.json(publicJob(job), 202);
});

app.post("/api/inbox/:id/dismiss", async (c) => {
  const item = await textFeeds.removeFromInbox(c.req.param("id"));
  return item ? c.json({ ok: true }) : c.json({ error: "No such item." }, 404);
});

const ASSET_TYPES: Record<string, string> = {
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
};
app.get("/assets/*", async (c) => {
  const rel = c.req.path.replace(/^\/assets\//, "");
  const file = path.join(ROOT, "assets", path.normalize(rel));
  if (!file.startsWith(path.join(ROOT, "assets"))) return c.notFound();
  const type = ASSET_TYPES[path.extname(file).toLowerCase()];
  const buf = type ? await fsp.readFile(file).catch(() => null) : null;
  if (!buf) return c.notFound();
  c.header("content-type", type);
  c.header("cache-control", "public, max-age=604800");
  return c.body(buf);
});

app.get("/cover.png", async (c) => {
  const buf = await fsp.readFile(COVER).catch(() => null);
  if (!buf) return c.notFound();
  c.header("content-type", "image/png");
  c.header("cache-control", "public, max-age=86400");
  return c.body(buf);
});

app.get("/text/:id", async (c) => {
  const id = path.basename(c.req.param("id")).replace(/\.txt$/, "");
  const txt = await fsp
    .readFile(path.join(lib.textDir, `${id}.txt`), "utf8")
    .catch(() => null);
  if (txt === null) return c.notFound();
  c.header("content-type", "text/plain; charset=utf-8");
  return c.body(txt);
});

type Ctx = {
  req: { method: string; header: (n: string) => string | undefined };
  notFound: () => Response | Promise<Response>;
};

async function serveAudio(c: Ctx, name: string): Promise<Response> {
  const file = path.join(lib.audioDir, path.basename(name));
  const stat = await fsp.stat(file).catch(() => null);
  if (!stat || !stat.isFile()) return c.notFound();
  const headers: Record<string, string> = {
    "content-type": "audio/mpeg",
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
    "last-modified": stat.mtime.toUTCString(),
  };
  const isHead = c.req.method === "HEAD";
  const range = c.req.header("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? Number(m[1]) : 0;
    let end = m && m[2] ? Number(m[2]) : stat.size - 1;
    if (m && !m[1] && m[2]) {
      start = Math.max(0, stat.size - Number(m[2]));
      end = stat.size - 1;
    }
    if (start >= stat.size || start > end) {
      return new Response(null, {
        status: 416,
        headers: { "content-range": `bytes */${stat.size}` },
      });
    }
    end = Math.min(end, stat.size - 1);
    headers["content-range"] = `bytes ${start}-${end}/${stat.size}`;
    headers["content-length"] = String(end - start + 1);
    const body = isHead
      ? null
      : (Readable.toWeb(
          fs.createReadStream(file, { start, end }),
        ) as ReadableStream);
    return new Response(body, { status: 206, headers });
  }
  headers["content-length"] = String(stat.size);
  const body = isHead
    ? null
    : (Readable.toWeb(fs.createReadStream(file)) as ReadableStream);
  return new Response(body, { status: 200, headers });
}

// A drawn artifact is one self-contained page; serve it as a page so it opens in place.
app.get("/artifacts/:file", async (c) => {
  const name = path.basename(c.req.param("file"));
  if (!name.endsWith(".html")) return c.notFound();
  const html = await fsp
    .readFile(path.join(lib.artifactsDir, name), "utf8")
    .catch(() => null);
  if (html === null) return c.notFound();
  c.header("cache-control", "private, max-age=3600");
  return c.html(html);
});

app.on(["GET", "HEAD"], "/audio/:file", (c) =>
  serveAudio(c, c.req.param("file")),
);

// ---------- public feed (for players that fetch from their own servers, e.g. Pocket Casts) ----------
// Only these routes are ever exposed by `kiku-public`; the token is the password.

async function publicToken(): Promise<string> {
  try {
    const t = (await fsp.readFile(TOKEN_FILE, "utf8")).trim();
    if (t.length >= 16) return t;
  } catch {}
  const t = crypto.randomBytes(18).toString("base64url");
  await fsp.writeFile(TOKEN_FILE, t + "\n", { mode: 0o600 });
  return t;
}

const pub = new Hono();
let TOKEN = "";

function publicBase(c: {
  req: { header: (n: string) => string | undefined };
}): string {
  const forced = process.env.KIKU_PUBLIC_BASE;
  if (forced) return forced.replace(/\/$/, "") + `/p/${TOKEN}`;
  return `${baseOf(c)}/p/${TOKEN}`;
}

pub.use("*", async (c, next) => {
  await next();
  console.log(
    `[kiku] public ${c.req.method} ${c.req.path.replace(TOKEN, "…")} ${c.res.status} · ${(c.req.header("user-agent") ?? "").slice(0, 70)}`,
  );
});

pub.get("/p/:token/feed.xml", (c) => {
  if (c.req.param("token") !== TOKEN) return c.notFound();
  c.header("content-type", "application/rss+xml; charset=utf-8");
  c.header("cache-control", "no-cache");
  return c.body(buildFeed(lib.list(), publicBase(c)));
});

pub.on(["GET", "HEAD"], "/p/:token/audio/:file", (c) => {
  if (c.req.param("token") !== TOKEN) return c.notFound();
  return serveAudio(c, c.req.param("file"));
});

pub.get("/p/:token/cover.png", async (c) => {
  if (c.req.param("token") !== TOKEN) return c.notFound();
  const buf = await fsp.readFile(COVER).catch(() => null);
  if (!buf) return c.notFound();
  c.header("content-type", "image/png");
  c.header("cache-control", "public, max-age=86400");
  return c.body(buf);
});

pub.get("/p/:token/", (c) =>
  c.req.param("token") === TOKEN
    ? c.text("Kiku private feed. Add feed.xml to your podcast app.")
    : c.notFound(),
);
pub.notFound((c) => c.text("Not found", 404));

await lib.init();
await podcasts.init();
await textFeeds.init();
await accounts.init();
await mail.init();
restored = await jobsStore.load();
void exportItems(lib.list());
setInterval(() => void exportItems(lib.list()), 15 * 60 * 1000);
for (const j of restored)
  if (j.detail === "interrupted")
    console.log(`[kiku] interrupted before restart: ${j.title}`);
await loadPositions();
await detectTailnet();
TOKEN = await publicToken();
serve({ fetch: pub.fetch, port: PUBLIC_PORT, hostname: "127.0.0.1" });
setInterval(() => void detectTailnet(), 5 * 60 * 1000);
void pollAll();
setInterval(() => void pollAll(), 30 * 60 * 1000);
serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  console.log(
    `[kiku] listening on ${hostList().join("  ")}  (library: ${HOME})`,
  );
});
