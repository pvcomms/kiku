// The sets a document is made of → one self-contained HTML file: the interactive venn
// template with its config written in. Opens from file://, on a plane, on the iPad; nothing in
// it asks the network for anything. The template itself is assets/venn.html, vendored and
// patched by bin/vendor-venn.mjs — never edited by hand.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAIRS, type Sets, type SetSpec } from "./analyze.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATE = path.join(ROOT, "assets", "venn.html");

/** The template's own palette, in its own domain order, and its marker colour. */
export const COLORS = ["#b48ede", "#6fa8dc", "#7fb069", "#e3c567", "#d98aa8"];
export const MARKER_COLOR = "#e07a6b";

/** The template's own defaults per layout; nothing here is chosen by the model. */
const PHYSICS: Record<Sets, object> = {
  3: {
    driftBase: 30,
    driftMax: 120,
    cursorReach: 100,
    cursorForce: 200,
    flood: 11,
    bloom: true,
  },
  5: {
    driftBase: 34,
    driftMax: 130,
    cursorReach: 100,
    cursorForce: 220,
    flood: 11,
    bloom: true,
  },
};

export type VennPayload = {
  layout: "3" | "5";
  config: {
    domains: Record<string, { label: string; color: string; desc: string }>;
    pairs: Record<string, { name: string; desc: string }>;
    triple: { name: string; desc: string };
    marker: { enabled: boolean; label: string; color: string };
    offrec: { enabled: boolean; label: string };
    physics: object;
  };
};

/** A validated spec → exactly the `{layout, config}` the template imports. */
export function toVenn(spec: SetSpec): VennPayload {
  const sets = spec.domains.length as Sets;
  const domains: VennPayload["config"]["domains"] = {};
  spec.domains.forEach((d, i) => {
    domains[`d${i}`] = {
      label: d.label.trim().toUpperCase(),
      color: COLORS[i],
      desc: d.desc.trim(),
    };
  });
  const byKey = new Map(
    spec.pairs.map((p) => [
      `${Math.min(p.a, p.b)},${Math.max(p.a, p.b)}`,
      { name: p.name.trim().toLowerCase(), desc: p.desc.trim() },
    ]),
  );
  const pairs: VennPayload["config"]["pairs"] = {};
  for (const [a, b] of PAIRS[sets]) {
    const hit = byKey.get(`${a},${b}`);
    if (!hit) throw new Error(`pair ${a},${b} is missing — validate first`);
    pairs[`d${a},d${b}`] = hit;
  }
  return {
    layout: String(sets) as "3" | "5",
    config: {
      domains,
      pairs,
      triple: {
        name: spec.triple.name.trim().toLowerCase(),
        desc: spec.triple.desc.trim(),
      },
      marker: {
        enabled: true,
        label: spec.marker.label.trim(),
        color: MARKER_COLOR,
      },
      offrec: { enabled: true, label: spec.offrec.label.trim() },
      physics: PHYSICS[sets],
    },
  };
}

export type Provenance = {
  title: string;
  sourceUrl?: string;
  author?: string;
  model: string;
  createdAt: string;
};

/**
 * Write the config into the template. Three edits, each on an anchor that must occur exactly
 * once, so a template that has drifted fails here rather than producing a page that half
 * works: the title, a provenance comment, and the `window.KIKU_ARTIFACT` boot hook before
 * `</head>`, which the vendored template reads when it builds its state.
 */
export function render(
  template: string,
  payload: VennPayload,
  meta: Provenance,
): string {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const title = escapeHtml(meta.title);
  const who = [meta.author, meta.sourceUrl].filter(Boolean).join(" · ");
  const note = `kiku · ${meta.title}${who ? ` · ${who}` : ""} · drawn by ${meta.model} · ${meta.createdAt}`;
  const hook = [
    `<!-- ${note.replace(/--/g, "- -")} -->`,
    `<script>window.KIKU_ARTIFACT = ${json};</script>`,
  ].join("\n    ");

  let out = replaceOnce(
    template,
    /<title>[^<]*<\/title>/,
    `<title>${title}</title>`,
    "<title>",
  );
  out = replaceOnce(out, /<\/head>/, `${hook}\n  </head>`, "</head>");
  // The template's brand line becomes the document's title, so the page says what it is of.
  out = replaceOnce(
    out,
    /<div class="brand">[^<]*<\/div>/,
    `<div class="brand">${title}</div>`,
    '<div class="brand">',
  );
  return out;
}

function replaceOnce(s: string, re: RegExp, by: string, what: string): string {
  const n = s.match(new RegExp(re.source, "g"))?.length ?? 0;
  if (n !== 1)
    throw new Error(
      `assets/venn.html has ${n} of ${what}, expected exactly 1 — re-run bin/vendor-venn.mjs`,
    );
  return s.replace(re, () => by);
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );
}

export function loadTemplate(file = TEMPLATE): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    throw new Error(
      "assets/venn.html is missing — run: node bin/vendor-venn.mjs",
    );
  }
}
