import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeEntities,
  wordCount,
  markdownToParagraphs,
  ensureTerminal,
  titleFromMarkdown,
  cleanInline,
  slugify,
} from "../src/clean.ts";

test("decodeEntities handles named, decimal, and hex entities", () => {
  assert.equal(decodeEntities("Tom &amp; Jerry"), "Tom & Jerry");
  assert.equal(decodeEntities("&#8212;"), "—");
  assert.equal(decodeEntities("&#x2014;"), "—");
  assert.equal(decodeEntities("&unknown;"), "&unknown;");
});

test("wordCount counts whitespace-separated tokens", () => {
  assert.equal(wordCount("one two  three"), 3);
  assert.equal(wordCount(""), 0);
  assert.equal(wordCount("   "), 0);
});

test("ensureTerminal only appends a period when one isn't already there", () => {
  assert.equal(ensureTerminal("done"), "done.");
  assert.equal(ensureTerminal("done."), "done.");
  assert.equal(ensureTerminal("really?"), "really?");
  assert.equal(ensureTerminal('"quoted"'), '"quoted"');
});

test("slugify is filesystem-safe and bounded", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  // NFKD decomposes "é" into "e" + a combining accent, and only the accent is
  // non-ASCII — the base letter survives.
  assert.equal(slugify("Café — Noir"), "cafe-noir");
  assert.equal(slugify(""), "untitled");
  assert.ok(slugify("x".repeat(200)).length <= 60);
});

test("cleanInline strips markdown/HTML markup down to plain text", () => {
  assert.equal(cleanInline("**bold** and _em_"), "bold and em");
  assert.equal(cleanInline("[a link](https://example.com)"), "a link");
  assert.equal(cleanInline("<b>hi</b>  there"), "hi there");
});

test("titleFromMarkdown prefers a heading, falls back to the first line", () => {
  assert.equal(titleFromMarkdown("# My Title\n\nBody text."), "My Title");
  assert.equal(
    titleFromMarkdown("Just a first line.\nMore."),
    "Just a first line.",
  );
  assert.equal(titleFromMarkdown(""), undefined);
});

test("markdownToParagraphs strips markup and code, keeps prose", () => {
  const md = [
    "# Heading",
    "",
    "Some **bold** text with a [link](https://x.com).",
    "",
    "```js",
    "this code should vanish",
    "```",
    "",
    "> a quote",
  ].join("\n");
  const paras = markdownToParagraphs(md);
  assert.ok(paras.every((p) => !p.includes("```")));
  assert.ok(paras.every((p) => !p.includes("code should vanish")));
  assert.ok(paras.some((p) => p.includes("bold text with a link")));
  // every paragraph ends with terminal punctuation
  assert.ok(paras.every((p) => /[.!?…:;"’”)\]]$/.test(p)));
});

test("markdownToParagraphs expands common abbreviations for speech", () => {
  const paras = markdownToParagraphs("Foo, e.g. bar, works well.");
  assert.ok(paras.some((p) => p.includes("for example")));
});

test("markdownToParagraphs drops punctuation-only debris lines", () => {
  const paras = markdownToParagraphs("Real sentence here.\n---\n***\n");
  assert.ok(paras.every((p) => p !== "---." && p !== "***."));
});
