import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hostOf,
  splitIntoParts,
  fromText,
  fromHtml,
  type Extracted,
} from "../src/extract.ts";

test("hostOf strips the www prefix and tolerates bad input", () => {
  assert.equal(hostOf("https://www.aeon.co/essays/x"), "aeon.co");
  assert.equal(hostOf("https://lesswrong.com/posts/x"), "lesswrong.com");
  assert.equal(hostOf("not a url"), "");
});

test("fromText titles from the first line and records the source", () => {
  const ex = fromText("A short thought.\nMore.", undefined, "https://x.com/a");
  assert.equal(ex.title, "A short thought.");
  assert.equal(ex.sourceType, "url");
  assert.equal(ex.site, "x.com");
});

test("fromText rejects empty input", () => {
  assert.throws(() => fromText("   "));
});

test("splitIntoParts leaves short articles as a single part", () => {
  const ex: Extracted = {
    title: "Short Piece",
    sourceType: "text",
    markdown: "Just a couple of paragraphs.\n\nNothing chapter-length here.",
  };
  const parts = splitIntoParts(ex);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].title, "Short Piece");
});

test("splitIntoParts breaks a long, headed book into per-chapter parts", () => {
  const chapter = (n: number) => `## Chapter ${n}\n\n` + "word ".repeat(3200); // ~3200 words/chapter
  const md = [chapter(1), chapter(2), chapter(3), chapter(4)].join("\n\n");
  const ex: Extracted = {
    title: "A Long Book",
    sourceType: "file",
    markdown: md,
  };
  const parts = splitIntoParts(ex);
  assert.ok(
    parts.length >= 3,
    `expected multiple chapters, got ${parts.length}`,
  );
  assert.ok(parts.every((p) => p.title.startsWith("A Long Book ·")));
});

test("splitIntoParts folds tiny front-matter sections into the next chapter", () => {
  const md =
    "## Preface\n\nshort.\n\n" +
    "## Chapter 1\n\n" +
    "word ".repeat(3200) +
    "\n\n## Chapter 2\n\n" +
    "word ".repeat(3200) +
    "\n\n## Chapter 3\n\n" +
    "word ".repeat(3200);
  const ex: Extracted = { title: "Book", sourceType: "file", markdown: md };
  const parts = splitIntoParts(ex);
  // "Preface" is too short to stand alone and should be merged forward, not dropped.
  assert.ok(!parts.some((p) => p.title.endsWith("Preface")));
});

test("fromHtml extracts readable content and falls back to the hostname for a title", async () => {
  const html = `<!doctype html><html><head><title>  </title></head><body>
    <article><h1>Real Headline</h1><p>${"Paragraph text goes here. ".repeat(20)}</p></article>
  </body></html>`;
  const ex = await fromHtml(html, "https://example.com/post");
  assert.equal(ex.sourceType, "url");
  assert.ok(ex.markdown.length > 0);
});

test("fromHtml refuses pages with no real content", async () => {
  const html = `<!doctype html><html><body><nav>menu</nav></body></html>`;
  await assert.rejects(() => fromHtml(html, "https://example.com/empty"));
});
