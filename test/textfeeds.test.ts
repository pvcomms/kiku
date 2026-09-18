import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  TextFeeds,
  parseArticleFeed,
  mapLimit,
  type TextFeed,
} from "../src/textfeeds.ts";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Interconnects</title>
  <link>https://www.interconnects.ai</link>
  <item>
    <title><![CDATA[Open Models & the Reading List]]></title>
    <link>https://www.interconnects.ai/p/open-models</link>
    <guid isPermaLink="false">interconnects-open-models</guid>
    <pubDate>Fri, 11 Sep 2026 14:00:00 GMT</pubDate>
    <description>&lt;p&gt;A roundup of &amp; open weights.&lt;/p&gt;</description>
  </item>
  <item>
    <title>Older Post</title>
    <link>https://www.interconnects.ai/p/older</link>
    <guid>interconnects-older</guid>
    <pubDate>Wed, 09 Sep 2026 14:00:00 GMT</pubDate>
    <description>Some older text.</description>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Minding Our Way</title>
  <link rel="alternate" href="https://mindingourway.com"/>
  <entry>
    <title>On Caring</title>
    <link rel="alternate" href="https://mindingourway.com/on-caring"/>
    <id>tag:mindingourway.com,2019:on-caring</id>
    <published>2019-12-21T00:00:00Z</published>
    <summary>A short essay.</summary>
  </entry>
</feed>`;

test("parseArticleFeed reads RSS 2.0 items, newest first as given, decoding entities and CDATA", () => {
  const { title, siteUrl, articles } = parseArticleFeed(RSS);
  assert.equal(title, "Interconnects");
  assert.equal(siteUrl, "https://www.interconnects.ai");
  assert.equal(articles.length, 2);
  assert.equal(articles[0].title, "Open Models & the Reading List");
  assert.equal(articles[0].guid, "interconnects-open-models");
  assert.equal(articles[0].link, "https://www.interconnects.ai/p/open-models");
  assert.equal(
    articles[0].pubDate,
    new Date("2026-09-11T14:00:00Z").toISOString(),
  );
  assert.ok(articles[0].summary?.includes("A roundup of & open weights."));
});

test("parseArticleFeed reads Atom entries via rel=alternate link", () => {
  const { title, articles } = parseArticleFeed(ATOM);
  assert.equal(title, "Minding Our Way");
  assert.equal(articles.length, 1);
  assert.equal(articles[0].link, "https://mindingourway.com/on-caring");
  assert.equal(articles[0].guid, "tag:mindingourway.com,2019:on-caring");
  assert.equal(
    articles[0].pubDate,
    new Date("2019-12-21T00:00:00Z").toISOString(),
  );
});

test("parseArticleFeed respects the limit", () => {
  const { articles } = parseArticleFeed(RSS, 1);
  assert.equal(articles.length, 1);
});

test("mapLimit preserves result order under concurrency", async () => {
  const out = await mapLimit([5, 1, 4, 2, 3], 2, async (n) => {
    await new Promise((r) => setTimeout(r, n));
    return n * 10;
  });
  assert.deepEqual(out, [50, 10, 40, 20, 30]);
});

async function withTempHome(fn: (home: string) => Promise<void>) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kiku-textfeeds-"));
  try {
    await fn(home);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

test("TextFeeds.applyPoll only surfaces genuinely new articles into the inbox", () =>
  withTempHome(async (home) => {
    const store = new TextFeeds(home);
    await store.init();
    const feed: TextFeed = {
      id: "f1",
      title: "Test Feed",
      feedUrl: "https://example.com/feed",
      addedAt: new Date().toISOString(),
      seen: ["already-seen"],
    };
    await store.addFeed(feed);

    const added = await store.applyPoll("f1", [
      {
        guid: "already-seen",
        title: "Old",
        link: "https://x/old",
        pubDate: new Date().toISOString(),
      },
      {
        guid: "brand-new",
        title: "New",
        link: "https://x/new",
        pubDate: new Date().toISOString(),
      },
    ]);
    assert.equal(added.length, 1);
    assert.equal(added[0].title, "New");
    assert.equal(store.listInbox().length, 1);

    // Polling again with the same items adds nothing further.
    const addedAgain = await store.applyPoll("f1", [
      {
        guid: "brand-new",
        title: "New",
        link: "https://x/new",
        pubDate: new Date().toISOString(),
      },
    ]);
    assert.equal(addedAgain.length, 0);
    assert.equal(store.listInbox().length, 1);
  }));

test("removeFeed also clears its pending inbox items", () =>
  withTempHome(async (home) => {
    const store = new TextFeeds(home);
    await store.init();
    await store.addFeed({
      id: "f1",
      title: "Test Feed",
      feedUrl: "https://example.com/feed",
      addedAt: new Date().toISOString(),
      seen: [],
    });
    await store.applyPoll("f1", [
      {
        guid: "a",
        title: "A",
        link: "https://x/a",
        pubDate: new Date().toISOString(),
      },
    ]);
    assert.equal(store.listInbox().length, 1);
    await store.removeFeed("f1");
    assert.equal(store.listInbox().length, 0);
    assert.equal(store.listFeeds().length, 0);
  }));

test("state survives a reload from disk", () =>
  withTempHome(async (home) => {
    const store = new TextFeeds(home);
    await store.init();
    await store.addFeed({
      id: "f1",
      title: "Test Feed",
      feedUrl: "https://example.com/feed",
      addedAt: new Date().toISOString(),
      seen: [],
    });
    await store.applyPoll("f1", [
      {
        guid: "a",
        title: "A",
        link: "https://x/a",
        pubDate: new Date().toISOString(),
      },
    ]);

    const reloaded = new TextFeeds(home);
    await reloaded.init();
    assert.equal(reloaded.listFeeds().length, 1);
    assert.equal(reloaded.listInbox().length, 1);
  }));
