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
  fromText,
  fromUrl,
  splitIntoParts,
  URL_RE,
  type Extracted,
} from "./extract.ts";
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
import { Library, newId, type Item } from "./library.ts";
import { buildFeed, formatDuration } from "./feed.ts";
import { Podcasts, fetchXml, parseFeed, type Podcast } from "./podcasts.ts";
import { page } from "./ui.ts";

const PORT = Number(process.env.KIKU_PORT ?? 4747);
const HOME = process.env.KIKU_HOME ?? path.join(os.homedir(), "Kiku");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COVER = path.join(ROOT, "assets", "cover.png");
const PUBLIC_PORT = Number(process.env.KIKU_PUBLIC_PORT ?? 4748);
const TOKEN_FILE = path.join(HOME, "public-token");

type Input =
  | { kind: "url"; url: string }
  | { kind: "text"; text: string; title?: string }
  | { kind: "file"; name: string; buf: Buffer };

type Job = {
  id: string;
  status: "queued" | "extracting" | "reading" | "encoding" | "done" | "error";
  title: string;
  detail: string;
  progress: number;
  seconds: number;
  error?: string;
  itemIds: string[];
  createdAt: string;
  updatedAt: string;
  voice: string;
  speed: number;
  input: Input;
};

const runFile = promisify(execFile);
const lib = new Library(HOME);
const podcasts = new Podcasts(HOME);
const jobs: Job[] = [];
let pumping = false;

function publicJob(j: Job) {
  const { input, ...rest } = j;
  const label =
    input.kind === "url"
      ? input.url
      : input.kind === "file"
        ? input.name
        : "pasted text";
  return { ...rest, input: label };
}

function touch(j: Job) {
  j.updatedAt = new Date().toISOString();
}

function enqueue(input: Input, voice: string, speed: number): Job {
  const job: Job = {
    id: newId(),
    status: "queued",
    title:
      input.kind === "url"
        ? input.url
        : input.kind === "file"
          ? input.name
          : (input.title ?? "Pasted text"),
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
  if (input.kind === "url") return fromUrl(input.url);
  if (input.kind === "file") return fromFile(input.name, input.buf);
  return fromText(input.text, input.title);
}

async function process1(job: Job) {
  job.status = "extracting";
  job.detail = "fetching and cleaning";
  touch(job);
  const ex = await extractFor(job.input);
  job.title = ex.title;
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
    console.log(
      `[kiku] ready: ${item.title} (${formatDuration(item.seconds)})`,
    );
  }
  job.status = "done";
  job.progress = 1;
  job.detail = parts.length > 1 ? `${parts.length} parts ready` : "ready";
  touch(job);
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

/** Origins the phone can use: LAN name, LAN IP, and the tailnet HTTPS name when Tailscale is up. */
function hostList(): string[] {
  const name = os.hostname().toLowerCase();
  const lan = [
    name.endsWith(".local") ? name : `${name}.local`,
    ...lanAddresses(),
  ].map((h) => `http://${h}:${PORT}`);
  const all = tailnetOrigin ? [tailnetOrigin, ...lan] : lan;
  return [...new Set(all)];
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

app.get("/", (c) =>
  c.html(
    page({ voices: VOICES, defaultVoice: DEFAULT_VOICE, hosts: hostList() }),
  ),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    items: lib.list().length,
    active: jobs.filter((j) => !["done", "error"].includes(j.status)).length,
  }),
);

app.post("/api/jobs", async (c) => {
  const ct = c.req.header("content-type") ?? "";
  const inputs: Input[] = [];
  let voice = DEFAULT_VOICE;
  let speed = 1;
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

  const created = inputs.map((inp) => enqueue(inp, voice, speed));
  return c.json(
    {
      id: created[0].id,
      ids: created.map((j) => j.id),
      jobs: created.map(publicJob),
    },
    202,
  );
});

app.get("/api/jobs", (c) => c.json(jobs.slice(0, 30).map(publicJob)));

app.get("/api/jobs/:id", (c) => {
  const j = jobs.find((x) => x.id === c.req.param("id"));
  return j ? c.json(publicJob(j)) : c.json({ error: "No such job." }, 404);
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

  let parsed;
  try {
    parsed = parseFeed(await fetchXml(feedUrl), 1);
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "Couldn't read that feed." },
      400,
    );
  }
  const pod: Podcast = {
    id: newId(),
    title: parsed.title,
    feedUrl,
    artworkUrl: parsed.artworkUrl,
    addedAt: new Date().toISOString(),
  };
  await podcasts.add(pod);
  return c.json(pod, 201);
});

app.get("/api/podcasts", (c) => c.json(podcasts.list()));

app.delete("/api/podcasts/:id", async (c) => {
  const ok = await podcasts.remove(c.req.param("id"));
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
await loadPositions();
await detectTailnet();
TOKEN = await publicToken();
serve({ fetch: pub.fetch, port: PUBLIC_PORT, hostname: "127.0.0.1" });
setInterval(() => void detectTailnet(), 5 * 60 * 1000);
serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, () => {
  console.log(
    `[kiku] listening on ${hostList().join("  ")}  (library: ${HOME})`,
  );
});
