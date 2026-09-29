import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Podcasts, looksLikeShow, parseFeed, type Episode } from "../src/podcasts.ts";

const ep = (id: string, n: number): Episode => ({
  id,
  title: "Episode " + n,
  pubDate: `2026-09-${String(n).padStart(2, "0")}T00:00:00.000Z`,
  enclosureUrl: `https://x/${id}.mp3`,
  type: "audio/mpeg",
  length: 1,
  seconds: 60,
  description: "",
});

test("a show starts caught up and then surfaces only new episodes", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kiku-pods-"));
  const pods = new Podcasts(home);
  await pods.init();
  // Subscribed before episodes went to the inbox: no `seen` at all.
  await pods.add({ id: "s1", title: "S", feedUrl: "https://x/feed", addedAt: "2026-09-01T00:00:00.000Z" });
  const first = await pods.applyPoll("s1", [ep("a", 1), ep("b", 2)]);
  assert.deepEqual(first, []);
  const second = await pods.applyPoll("s1", [ep("c", 3), ep("a", 1), ep("b", 2)]);
  assert.deepEqual(second.map((e) => e.id), ["c"]);
  const third = await pods.applyPoll("s1", [ep("c", 3)], "Feed returned 503");
  assert.deepEqual(third, []);
  assert.equal(pods.get("s1")?.lastError, "Feed returned 503");
  const again = new Podcasts(home);
  await again.init();
  assert.deepEqual(again.get("s1")?.seen, ["a", "b", "c"]);
});

test("parseFeed reads enclosures and durations", () => {
  const xml = `<rss><channel><title>S</title><item><title>E</title><enclosure url="https://x/e.mp3" type="audio/mpeg" length="10"/><itunes:duration>1:02:03</itunes:duration><guid>g</guid></item></channel></rss>`;
  const { episodes } = parseFeed(xml);
  assert.equal(episodes[0].enclosureUrl, "https://x/e.mp3");
  assert.equal(episodes[0].seconds, 3723);
});

test("looksLikeShow: audio on every item is not enough when the items are posts", () => {
  const post = (n: number) => `<item><title>P${n}</title><enclosure url="https://x/${n}.mp3" type="audio/mpeg" length="1"/><content:encoded><![CDATA[<p>${"word ".repeat(1500)}</p>]]></content:encoded></item>`;
  const episode = (n: number) => `<item><title>E${n}</title><enclosure url="https://x/${n}.mp3" type="audio/mpeg" length="1"/><description>${"note ".repeat(120)}</description></item>`;
  const wrap = (items: string) => `<rss><channel><title>T</title>${items}</channel></rss>`;
  assert.equal(looksLikeShow(wrap([1, 2, 3].map(post).join(""))), false);
  assert.equal(looksLikeShow(wrap([1, 2, 3].map(episode).join(""))), true);
  assert.equal(looksLikeShow(wrap(`<item><title>text only</title><link>https://x/a</link></item>` + episode(1))), false);
  assert.equal(looksLikeShow(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>a</title></entry></feed>`), false);
});
