import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  COLORS,
  escapeHtml,
  loadTemplate,
  MARKER_COLOR,
  render,
  TEMPLATE,
  toVenn,
} from "../src/artifact.ts";
import type { SetSpec } from "../src/analyze.ts";

const spec: SetSpec = {
  title: "Life after work",
  domains: [
    { label: " work ", desc: " paid. " },
    { label: "play", desc: "unpaid." },
    { label: "rest", desc: "unasked." },
  ],
  pairs: [
    { a: 1, b: 0, name: "The Craft", desc: "paid play." },
    { a: 0, b: 2, name: "the weekend", desc: "rest to return." },
    { a: 2, b: 1, name: "the hobby", desc: "nothing riding." },
  ],
  triple: { name: "The Good Life", desc: "rare." },
  marker: { label: "here" },
  offrec: { label: "the work nobody counts" },
};

test("toVenn maps indices to ids, keys pairs sorted, and takes colours from the template's palette", () => {
  const v = toVenn(spec);
  assert.equal(v.layout, "3");
  assert.deepEqual(Object.keys(v.config.domains), ["d0", "d1", "d2"]);
  assert.deepEqual(v.config.domains.d0, {
    label: "WORK",
    color: COLORS[0],
    desc: "paid.",
  });
  assert.deepEqual(Object.keys(v.config.pairs), ["d0,d1", "d0,d2", "d1,d2"]);
  assert.equal(
    v.config.pairs["d0,d1"].name,
    "the craft",
    "pair 1,0 landed under d0,d1, lowercased",
  );
  assert.equal(v.config.pairs["d1,d2"].name, "the hobby");
  assert.equal(v.config.triple.name, "the good life");
  assert.deepEqual(v.config.marker, {
    enabled: true,
    label: "here",
    color: MARKER_COLOR,
  });
  assert.deepEqual(v.config.offrec, {
    enabled: true,
    label: "the work nobody counts",
  });
  assert.equal((v.config.physics as { driftBase: number }).driftBase, 30);
});

test("toVenn for five sets keeps the template's seven pairs and its physics", () => {
  const five: SetSpec = {
    ...spec,
    domains: [0, 1, 2, 3, 4].map((i) => ({ label: `s${i}`, desc: `d${i}` })),
    pairs: [
      [0, 1],
      [0, 3],
      [0, 2],
      [1, 2],
      [1, 4],
      [2, 3],
      [2, 4],
    ].map(([a, b]) => ({ a, b, name: `${a}${b}`, desc: "." })),
  };
  const v = toVenn(five);
  assert.equal(v.layout, "5");
  assert.equal(Object.keys(v.config.pairs).length, 7);
  assert.equal(v.config.domains.d4.color, COLORS[4]);
  assert.equal((v.config.physics as { driftBase: number }).driftBase, 34);
});

test("toVenn refuses a spec with a pair missing rather than drawing a hole", () => {
  assert.throws(
    () => toVenn({ ...spec, pairs: spec.pairs.slice(0, 2) }),
    /pair 1,2 is missing/,
  );
});

const TINY = `<!doctype html><html><head><title>Template</title></head><body><div class="brand">Template</div></body></html>`;
const meta = {
  title: `Life <after> "work"`,
  sourceUrl: "https://example.com/x",
  author: "A. Writer",
  model: "qwen2.5:7b",
  createdAt: "2026-09-20T00:00:00.000Z",
};

test("render writes the title, a provenance comment and the boot hook, escaping what came from the model", () => {
  const html = render(TINY, toVenn(spec), meta);
  assert.ok(
    html.includes(`<title>Life &lt;after&gt; &quot;work&quot;</title>`),
  );
  assert.ok(
    html.includes(
      '<!-- kiku · Life <after> "work" · A. Writer · https://example.com/x · drawn by qwen2.5:7b · 2026-09-20T00:00:00.000Z -->',
    ),
  );
  assert.ok(
    html.includes(`<script>window.KIKU_ARTIFACT = {"layout":"3","config":`),
  );
  assert.equal(
    html.indexOf("</head>") > html.indexOf("window.KIKU_ARTIFACT"),
    true,
  );

  const sneaky = toVenn({
    ...spec,
    offrec: { label: "</script><script>alert(1)</script>" },
  });
  const out = render(TINY, sneaky, meta);
  assert.equal(
    out.includes("</script><script>alert"),
    false,
    "a closing tag from the model cannot end the hook",
  );
  assert.ok(out.includes("\\u003c/script>"));
});

test("render fails loudly on a template whose anchors have moved", () => {
  assert.throws(
    () => render("<html><head></head></html>", toVenn(spec), meta),
    /has 0 of <title>/,
  );
  assert.throws(
    () => render(TINY + TINY, toVenn(spec), meta),
    /has 2 of <title>/,
  );
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("the vendored template exists, requests nothing, and carries the hook", () => {
  assert.ok(fs.existsSync(TEMPLATE), "run: node bin/vendor-venn.mjs");
  const t = loadTemplate();
  assert.equal(t.includes("fonts.googleapis.com"), false);
  assert.equal(t.includes("fonts.gstatic.com"), false);
  assert.equal(
    /<link[^>]*href\s*=\s*["']https?:/.test(t),
    false,
    "no stylesheet or preconnect leaves the page",
  );
  assert.equal(/<script[^>]*src\s*=\s*["']https?:/.test(t), false);
  assert.equal(
    /url\(\s*["']?https?:/.test(t),
    false,
    "no CSS url() leaves the page",
  );
  assert.ok(t.includes("window.KIKU_ARTIFACT"));
  assert.ok(t.includes('font-family: "Newsreader"'));
  assert.ok(t.includes('font-family: "IBM Plex Mono"'));
  const out = render(t, toVenn(spec), meta);
  assert.equal((out.match(/<title>/g) ?? []).length, 1);
  assert.ok(
    out.includes(
      `<div class="brand">Life &lt;after&gt; &quot;work&quot;</div>`,
    ),
    "the brand line is the document's title",
  );
  assert.equal(out.includes("customizable template"), false);
  assert.ok(
    out.length > 100_000,
    "the fonts are inlined, so the file is self-contained and sizeable",
  );
});
