// Text feeds: subscribe to a blog/newsletter/news RSS or Atom feed, track which
// articles have already been surfaced, and hand new ones to the inbox. Unlike
// podcasts.ts (which plays a publisher's own audio) these items have no
// enclosure — "listening" means running the link through the same
// extract → clean → Kokoro pipeline used for a pasted link.
import fs from "node:fs/promises";
import path from "node:path";
import { decodeEntities } from "./clean.ts";
import { tag, attrFrom, stripTags, hashId } from "./podcasts.ts";

export type TextFeed = {
  id: string;
  title: string;
  feedUrl: string;
  siteUrl?: string;
  addedAt: string; // ISO
  lastPolled?: string; // ISO
  lastError?: string;
  seen: string[]; // recent guids, capped — keeps rediscovered items from re-entering the inbox
};

export type InboxItem = {
  id: string;
  feedId: string;
  feedTitle: string;
  title: string;
  link: string;
  pubDate: string; // ISO
  summary?: string;
};

const SEEN_CAP = 600;
const INBOX_CAP = 500;

type Store = { feeds: TextFeed[]; inbox: InboxItem[] };

export class TextFeeds {
  private file: string;
  private store: Store = { feeds: [], inbox: [] };
  private chain: Promise<unknown> = Promise.resolve();

  constructor(home: string) {
    this.file = path.join(home, "textfeeds.json");
  }

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const parsed = JSON.parse(raw);
      this.store = {
        feeds: Array.isArray(parsed.feeds) ? parsed.feeds : [],
        inbox: Array.isArray(parsed.inbox) ? parsed.inbox : [],
      };
    } catch {
      this.store = { feeds: [], inbox: [] };
    }
  }

  listFeeds(): TextFeed[] {
    return [...this.store.feeds].sort((a, b) => a.title.localeCompare(b.title));
  }

  getFeed(id: string): TextFeed | undefined {
    return this.store.feeds.find((f) => f.id === id);
  }

  findFeed(feedUrl: string): TextFeed | undefined {
    return this.store.feeds.find((f) => f.feedUrl === feedUrl);
  }

  listInbox(): InboxItem[] {
    return [...this.store.inbox].sort((a, b) =>
      a.pubDate < b.pubDate ? 1 : -1,
    );
  }

  addFeed(feed: TextFeed): Promise<void> {
    return this.mutate((s) => {
      s.feeds = s.feeds.filter((f) => f.id !== feed.id);
      s.feeds.push(feed);
    });
  }

  async removeFeed(id: string): Promise<boolean> {
    if (!this.getFeed(id)) return false;
    await this.mutate((s) => {
      s.feeds = s.feeds.filter((f) => f.id !== id);
      s.inbox = s.inbox.filter((i) => i.feedId !== id);
    });
    return true;
  }

  async removeFromInbox(id: string): Promise<InboxItem | undefined> {
    const item = this.store.inbox.find((i) => i.id === id);
    if (!item) return undefined;
    await this.mutate((s) => {
      s.inbox = s.inbox.filter((i) => i.id !== id);
    });
    return item;
  }

  /** Record a poll result: new articles go in the inbox, everything seen updates the dedup set. */
  applyPoll(
    feedId: string,
    articles: {
      guid: string;
      title: string;
      link: string;
      pubDate: string;
      summary?: string;
    }[],
    error?: string,
  ): Promise<InboxItem[]> {
    const added: InboxItem[] = [];
    return this.mutate((s) => {
      const feed = s.feeds.find((f) => f.id === feedId);
      if (!feed) return;
      feed.lastPolled = new Date().toISOString();
      feed.lastError = error;
      const seen = new Set(feed.seen);
      for (const a of articles) {
        if (seen.has(a.guid)) continue;
        seen.add(a.guid);
        const item: InboxItem = {
          id: hashId("inbox", feedId + a.guid),
          feedId,
          feedTitle: feed.title,
          title: a.title,
          link: a.link,
          pubDate: a.pubDate,
          summary: a.summary,
        };
        added.push(item);
        s.inbox.push(item);
      }
      feed.seen = [...seen].slice(-SEEN_CAP);
      if (s.inbox.length > INBOX_CAP) {
        s.inbox.sort((a, b) => (a.pubDate < b.pubDate ? 1 : -1));
        s.inbox.length = INBOX_CAP;
      }
    }).then(() => added);
  }

  private mutate(fn: (s: Store) => void): Promise<void> {
    const next = this.chain.then(async () => {
      fn(this.store);
      const tmp = this.file + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(this.store, null, 2));
      await fs.rename(tmp, this.file);
    });
    this.chain = next.catch(() => {});
    return next;
  }
}

// ---------- inbound feed: generic RSS 2.0 / Atom article parser ----------

export type ParsedArticle = {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  summary?: string;
};

export function parseArticleFeed(
  xml: string,
  limit = 40,
): { title: string; siteUrl?: string; articles: ParsedArticle[] } {
  const isAtom =
    /<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom/i.test(xml) ||
    (!/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml));

  const firstBlock = xml.search(isAtom ? /<entry[\s>]/i : /<item[\s>]/i);
  const head = firstBlock === -1 ? xml : xml.slice(0, firstBlock);
  const title = decodeEntities(tag(head, "title") ?? "Untitled feed");
  const siteUrl = isAtom
    ? (linkHref(head, "alternate") ?? linkHref(head))
    : tag(head, "link");

  const blocks =
    xml.match(
      isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi,
    ) ?? [];
  const articles: ParsedArticle[] = [];
  for (const block of blocks) {
    const a = isAtom ? parseEntry(block) : parseItem(block);
    if (a) articles.push(a);
    if (articles.length >= limit) break;
  }
  return { title, siteUrl, articles };
}

function parseItem(block: string): ParsedArticle | null {
  const link = tag(block, "link");
  const guidRaw = tag(block, "guid");
  const guid = guidRaw || link;
  if (!guid || !link) return null;
  const title = decodeEntities(stripTags(tag(block, "title") ?? "Untitled"));
  const pubDateRaw = tag(block, "pubDate") ?? tag(block, "dc:date");
  const pubDate = isoDate(pubDateRaw);
  const summaryRaw = tag(block, "description") ?? tag(block, "content:encoded");
  const summary = summaryRaw
    ? decodeEntities(stripTags(summaryRaw)).trim().slice(0, 280)
    : undefined;
  return { guid, title, link, pubDate, summary };
}

function parseEntry(block: string): ParsedArticle | null {
  const link = linkHref(block, "alternate") ?? linkHref(block);
  const guid = tag(block, "id") || link;
  if (!guid || !link) return null;
  const title = decodeEntities(stripTags(tag(block, "title") ?? "Untitled"));
  const pubDateRaw = tag(block, "published") ?? tag(block, "updated");
  const pubDate = isoDate(pubDateRaw);
  const summaryRaw = tag(block, "summary") ?? tag(block, "content");
  const summary = summaryRaw
    ? decodeEntities(stripTags(summaryRaw)).trim().slice(0, 280)
    : undefined;
  return { guid, title, link, pubDate, summary };
}

/** Atom <link> is a self-closing tag with attributes, not text content. */
function linkHref(block: string, rel?: string): string | undefined {
  const re = /<link\b[^>]*\/?>/gi;
  let m: RegExpExecArray | null;
  let fallback: string | undefined;
  while ((m = re.exec(block))) {
    const href = attrFrom(m[0], "href");
    if (!href) continue;
    const linkRel = attrFrom(m[0], "rel");
    if (!rel && !linkRel) return href;
    if (rel && linkRel === rel) return href;
    if (!linkRel) fallback ??= href;
  }
  return fallback;
}

function isoDate(raw: string | undefined): string {
  if (raw) {
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}
