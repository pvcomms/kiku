// Real podcasts: subscribe to a show's RSS feed, list its episodes, play the
// enclosure directly. Publishers routinely point <link> at a marketing page
// (e.g. some feeds hardcode it to a promo URL on every item) — playback must
// always come from <enclosure url>, never <link>.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { decodeEntities } from "./clean.ts";

export type Podcast = {
  id: string;
  title: string;
  feedUrl: string;
  artworkUrl?: string;
  addedAt: string; // ISO
  lastPolled?: string; // ISO
  lastError?: string;
  /** The newest episode the show carried when it was last read. */
  latest?: string; // ISO
  /** Episode ids already surfaced in the inbox. Absent on shows from before episodes went there. */
  seen?: string[];
};

const SEEN_CAP = 300;

/** The newest valid date among a feed's items, or undefined when none carries one. Shared with textfeeds.ts. */
export function latestOf(items: { pubDate: string }[]): string | undefined {
  let best: string | undefined;
  for (const { pubDate } of items) {
    if (Number.isNaN(Date.parse(pubDate))) continue;
    if (!best || pubDate > best) best = pubDate;
  }
  return best;
}

export type Episode = {
  id: string;
  title: string;
  pubDate: string; // ISO
  enclosureUrl: string;
  type: string;
  length: number;
  seconds: number;
  description: string;
};

export class Podcasts {
  private file: string;
  private items: Podcast[] = [];
  private chain: Promise<unknown> = Promise.resolve();

  constructor(home: string) {
    this.file = path.join(home, "podcasts.json");
  }

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const parsed = JSON.parse(raw);
      this.items = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.items = [];
    }
  }

  list(): Podcast[] {
    return [...this.items].sort((a, b) => a.title.localeCompare(b.title));
  }

  get(id: string): Podcast | undefined {
    return this.items.find((p) => p.id === id);
  }

  find(feedUrl: string): Podcast | undefined {
    return this.items.find((p) => p.feedUrl === feedUrl);
  }

  add(pod: Podcast): Promise<void> {
    return this.mutate(() => {
      this.items = this.items.filter((p) => p.id !== pod.id);
      this.items.push(pod);
    });
  }

  async remove(id: string): Promise<boolean> {
    if (!this.get(id)) return false;
    await this.mutate(() => {
      this.items = this.items.filter((p) => p.id !== id);
    });
    return true;
  }

  /**
   * Record a poll: the episodes not seen before are returned for the inbox. A show that has no
   * `seen` yet — subscribed before episodes went to the inbox, or just now — starts caught up,
   * the way a text feed does, so its back catalogue is never dumped on the person.
   */
  applyPoll(
    showId: string,
    episodes: Episode[],
    error?: string,
  ): Promise<Episode[]> {
    const fresh: Episode[] = [];
    return this.mutate(() => {
      const show = this.items.find((p) => p.id === showId);
      if (!show) return;
      show.lastPolled = new Date().toISOString();
      show.lastError = error;
      if (error) return;
      const newest = latestOf(episodes);
      if (newest) show.latest = newest;
      const catchingUp = show.seen === undefined;
      const seen = new Set(show.seen ?? []);
      for (const ep of episodes) {
        if (seen.has(ep.id)) continue;
        seen.add(ep.id);
        if (!catchingUp) fresh.push(ep);
      }
      show.seen = [...seen].slice(-SEEN_CAP);
    }).then(() => fresh);
  }

  private mutate(fn: () => void): Promise<void> {
    const next = this.chain.then(async () => {
      fn();
      const tmp = this.file + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(this.items, null, 2));
      await fs.rename(tmp, this.file);
    });
    this.chain = next.catch(() => {});
    return next;
  }
}

// ---------- inbound feed: fetch + hand-rolled parse ----------
// Real-world podcast feeds are messy (CDATA, HTML entities, mixed quoting);
// a small targeted extractor is more predictable here than coercing an
// HTML-oriented DOM parser onto arbitrary publisher XML.

export async function fetchXml(feedUrl: string): Promise<string> {
  const res = await fetch(feedUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Kiku/1.0",
      accept: "application/rss+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Feed returned ${res.status}`);
  return res.text();
}

export function parseFeed(
  xml: string,
  limit = 20,
): { title: string; artworkUrl?: string; episodes: Episode[] } {
  const firstItem = xml.search(/<item[\s>]/i);
  const head = firstItem === -1 ? xml : xml.slice(0, firstItem);
  const title = decodeEntities(tag(head, "title") ?? "Untitled show");
  const artworkUrl =
    attrOf(head, /<itunes:image\b[^>]*>/i, "href") ??
    tag(head.replace(/<atom:link\b[^>]*\/?>/gi, ""), "url");

  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const episodes: Episode[] = [];
  for (const block of blocks) {
    const ep = parseItem(block);
    if (ep) episodes.push(ep);
    if (episodes.length >= limit) break;
  }
  return { title, artworkUrl, episodes };
}

function parseItem(block: string): Episode | null {
  const encTag = /<enclosure\b([^>]*)\/?>/i.exec(block);
  if (!encTag) return null;
  const url = attrFrom(encTag[1], "url");
  if (!url) return null;
  const type = attrFrom(encTag[1], "type") ?? "audio/mpeg";
  const length = Number(attrFrom(encTag[1], "length") ?? 0) || 0;

  const title = decodeEntities(
    stripTags(tag(block, "title") ?? "Untitled episode"),
  );
  const pubDateRaw = tag(block, "pubDate");
  const pubDate =
    pubDateRaw && !Number.isNaN(Date.parse(pubDateRaw))
      ? new Date(pubDateRaw).toISOString()
      : new Date().toISOString();
  const guid = tag(block, "guid");
  const durRaw = tag(block, "itunes:duration");
  const seconds = durRaw ? parseDuration(durRaw) : 0;
  const descRaw =
    tag(block, "description") ?? tag(block, "itunes:summary") ?? "";
  const description = decodeEntities(stripTags(descRaw)).trim();

  return {
    id: hashId("ep", guid || url),
    title,
    pubDate,
    enclosureUrl: url,
    type,
    length,
    seconds,
    description,
  };
}

/**
 * Whether a feed is a show rather than writing that happens to carry audio. Enclosures alone
 * do not say: Substack attaches a voiceover to every post of a text publication. A show's
 * items are mostly audio and their text is show notes, a few hundred words at most; a post's
 * body is the post. The person can always say otherwise on the page.
 */
export function looksLikeShow(xml: string): boolean {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  if (blocks.length === 0) return false;
  const withAudio = blocks.filter((b) => /<enclosure\b/i.test(b)).length;
  if (withAudio * 2 <= blocks.length) return false;
  const words = blocks
    .slice(0, 20)
    .map((b) => {
      const body =
        tag(b, "content:encoded") ??
        tag(b, "description") ??
        tag(b, "itunes:summary") ??
        "";
      return stripTags(decodeEntities(body)).split(/\s+/).filter(Boolean)
        .length;
    })
    .sort((a, b) => a - b);
  const median = words[Math.floor(words.length / 2)] ?? 0;
  return median < SHOW_NOTES_MAX_WORDS;
}

/** Show notes run to a couple of hundred words; a post runs to thousands. */
const SHOW_NOTES_MAX_WORDS = 400;

export function tag(s: string, name: string): string | undefined {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i");
  const m = re.exec(s);
  if (!m) return undefined;
  const v = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(v);
  return cdata ? cdata[1].trim() : v;
}

function attrOf(s: string, tagRe: RegExp, attr: string): string | undefined {
  const m = tagRe.exec(s);
  return m ? attrFrom(m[0], attr) : undefined;
}

export function attrFrom(attrs: string, name: string): string | undefined {
  const re = new RegExp(
    `${name}\\s*=\\s*"([^"]*)"|${name}\\s*=\\s*'([^']*)'`,
    "i",
  );
  const m = re.exec(attrs);
  if (!m) return undefined;
  return decodeEntities(m[1] ?? m[2] ?? "");
}

export function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDuration(s: string): number {
  const parts = s.trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

export function hashId(prefix: string, s: string): string {
  return (
    prefix +
    "-" +
    crypto.createHash("sha1").update(s).digest("hex").slice(0, 16)
  );
}
