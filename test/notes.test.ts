import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Notes,
  clock,
  estimateStarts,
  indexAt,
  startsFromEnds,
  toMarkdown,
  type NoteSource,
} from "../src/notes.ts";

test("indexAt: the paragraph playing at a second, clamped at both ends", () => {
  const starts = [0, 4.2, 9.8, 15];
  assert.equal(indexAt(starts, -3), 0);
  assert.equal(indexAt(starts, 0), 0);
  assert.equal(indexAt(starts, 4.1), 0);
  assert.equal(indexAt(starts, 4.2), 1, "a paragraph begins at its own start");
  assert.equal(indexAt(starts, 12), 2);
  assert.equal(indexAt(starts, 999), 3);
  assert.equal(indexAt([], 5), 0);
});

test("startsFromEnds: each paragraph starts where the one before it ended", () => {
  assert.deepEqual(startsFromEnds([4.2, 9.8, 15, 22.1]), [0, 4.2, 9.8, 15]);
  assert.deepEqual(startsFromEnds([]), []);
});

test("estimateStarts: speech shared out by length, a fixed gap after each paragraph", () => {
  // 10 + 30 + 60 characters over 100 s, gap 0 → starts at 0, 10, 40.
  const starts = estimateStarts(["a".repeat(10), "b".repeat(30), "c".repeat(60)], 100, 0);
  assert.deepEqual(starts, [0, 10, 40]);
  // With a gap, the gaps are taken out first and then added back after each paragraph.
  const gapped = estimateStarts(["a".repeat(10), "b".repeat(10)], 22, 1);
  assert.deepEqual(gapped, [0, 11]);
  assert.deepEqual(estimateStarts([], 50), []);
});

test("clock: minutes and seconds, hours when there are any", () => {
  assert.equal(clock(0), "0:00");
  assert.equal(clock(95.4), "1:35");
  assert.equal(clock(3725), "1:02:05");
});

const reading: NoteSource = {
  id: "abc",
  kind: "reading",
  title: "On Lighthouses",
  by: "A. Keeper · aeon.co",
  file: "abc-on-lighthouses.mp3",
  sourceUrl: "https://aeon.co/essays/lighthouses",
};

test("toMarkdown: frontmatter, then each note in time order with its quote and words", () => {
  const md = toMarkdown(reading, [
    { id: "2", sourceId: "abc", at: 300, quote: "The second letter.", said: "Ask about this.", createdAt: "x" },
    { id: "1", sourceId: "abc", at: 65, quote: "A keeper wrote.", approx: true, createdAt: "x" },
  ]);
  assert.match(md, /^---\ntitle: "On Lighthouses"\nby: "A\. Keeper · aeon\.co"\nsource: "https:\/\/aeon\.co\/essays\/lighthouses"\nkind: reading\n---\n\n# On Lighthouses\n\n/);
  assert.ok(md.indexOf("## 1:05") < md.indexOf("## 5:00"), "time order, not creation order");
  assert.match(md, /## 1:05\n\n> A keeper wrote\.\n>\n> \(the paragraph is approximate\)\n/);
  assert.match(md, /## 5:00\n\n> The second letter\.\n\nAsk about this\.\n/);
});

test("Notes: written serially, rendered to markdown, and the file goes with the last note", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kiku-notes-"));
  const notes = new Notes(home);
  await notes.init();
  await Promise.all([
    notes.add(reading, { id: "n1", sourceId: "abc", at: 10, createdAt: "a" }),
    notes.add(reading, { id: "n2", sourceId: "abc", at: 20, createdAt: "b" }),
  ]);
  assert.equal(notes.countBySource().abc, 2);
  await notes.update("n1", { said: "spoken words" });
  const md = fs.readFileSync(notes.fileOf("abc"), "utf8");
  assert.match(md, /## 0:10\n\nspoken words\n/);

  const again = new Notes(home);
  await again.init();
  assert.equal(again.get("n1")?.said, "spoken words", "survives a restart");

  assert.equal(await notes.remove("n1"), true);
  assert.equal(await notes.remove("n2"), true);
  assert.equal(await notes.remove("n2"), false);
  assert.equal(fs.existsSync(notes.fileOf("abc")), false);
  assert.equal(notes.source("abc"), undefined);
});
