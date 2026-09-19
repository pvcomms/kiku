#!/usr/bin/env node
// vendor-venn — copy the interactive venn template into assets/venn.html, patched so that it
// asks the network for nothing and reads window.KIKU_ARTIFACT for its config.
//
// Two edits, each on an anchor that must match exactly the expected number of times. Any
// other count means the template has moved under us, and this exits 1 rather than writing a
// page that half works. The result is generated: never edit assets/venn.html by hand.
//   node bin/vendor-venn.mjs                        from ~/Code/interactive-venn-template
//   node bin/vendor-venn.mjs /path/to/index.html    from a given copy
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FONTS = path.join(ROOT, "assets", "fonts");
const src =
  process.argv[2] ??
  path.join(
    process.env.HOME ?? "",
    "Code",
    "interactive-venn-template",
    "index.html",
  );

const fail = (msg) => {
  console.error(`vendor-venn: ${msg}`);
  process.exit(1);
};

let html;
try {
  html = fs.readFileSync(src, "utf8");
} catch {
  fail(`cannot read ${src}`);
}

// 1. Fonts. The three Google Fonts <link>s (two preconnects, one stylesheet) become one inline
//    @font-face block carrying the same faces from assets/fonts, base64, so the page is one file.
const LINK = /<link[^>]*fonts\.g(?:oogleapis|static)\.com[^>]*>/gs;
const links = html.match(LINK) ?? [];
if (links.length !== 3)
  fail(`Google Fonts <link>s: found ${links.length}, expected exactly 3`);
const face = (family, file, weight, style) => {
  const b64 = fs.readFileSync(path.join(FONTS, file)).toString("base64");
  return `      @font-face { font-family: "${family}"; font-style: ${style}; font-weight: ${weight}; font-display: swap; src: url(data:font/woff2;base64,${b64}) format("woff2"); }`;
};
const fonts = [
  "<style>",
  face("Newsreader", "newsreader-300.woff2", 300, "normal"),
  face("Newsreader", "newsreader-300-italic.woff2", 300, "italic"),
  face("IBM Plex Mono", "ibm-plex-mono-400.woff2", 400, "normal"),
  face("IBM Plex Mono", "ibm-plex-mono-500.woff2", 500, "normal"),
  "    </style>",
].join("\n");
let seen = 0;
html = html.replace(LINK, () => (seen++ === 0 ? fonts : ""));
for (const family of ["Newsreader", "IBM Plex Mono"])
  if (!html.includes(`"${family}"`))
    fail(
      `the template no longer uses ${family}; the inlined faces would be dead weight`,
    );

// 2. The boot hook, immediately after the template makes its state, so a generated artifact
//    opens showing its own diagram and the customise panel still edits that config.
const STATE =
  /(var state = \{\s*layout: "5",\s*configs: \{ 3: clone\(DEFAULTS\["3"\]\), 5: clone\(DEFAULTS\["5"\]\) \},\s*\};)/g;
const states = html.match(STATE) ?? [];
if (states.length !== 1)
  fail(`the state initialiser: found ${states.length}, expected exactly 1`);
html = html.replace(
  STATE,
  `$1
        // kiku: a generated artifact carries its config here; see src/artifact.ts.
        if (window.KIKU_ARTIFACT) {
          state.layout = String(window.KIKU_ARTIFACT.layout);
          state.configs[state.layout] = window.KIKU_ARTIFACT.config;
        }`,
);

// 3. Nothing may leave the page on its own. A URL a person can click is fine; a URL the page
//    fetches — a stylesheet, a script, an image, a CSS url(), a fetch — is not.
const REQUEST =
  /(?:<link[^>]*href\s*=\s*["']|<(?:script|img|iframe|source|video|audio)[^>]*src\s*=\s*["']|url\(\s*["']?|fetch\(\s*["']|@import\s+(?:url\()?["']?)\s*https?:\/\//g;
const requests = html.match(REQUEST) ?? [];
if (requests.length)
  fail(
    `the vendored page would still request the network ${requests.length} time(s)`,
  );

let sha = "unknown";
try {
  sha = execFileSync(
    "git",
    ["-C", path.dirname(src), "rev-parse", "--short", "HEAD"],
    {
      encoding: "utf8",
    },
  ).trim();
} catch {}

fs.writeFileSync(path.join(ROOT, "assets", "venn.html"), html);
fs.writeFileSync(
  path.join(ROOT, "assets", "venn.source.txt"),
  [
    `interactive-venn-template ${sha}`,
    `vendored ${new Date().toISOString()} from ${src}`,
    "patched: Google Fonts links → inline @font-face (Newsreader 300/300i, IBM Plex Mono 400/500, OFL, from assets/fonts); window.KIKU_ARTIFACT hook after the state initialiser",
    "",
  ].join("\n"),
);
console.log(
  `assets/venn.html ${Math.round(html.length / 1024)}KB, from interactive-venn-template ${sha}`,
);
