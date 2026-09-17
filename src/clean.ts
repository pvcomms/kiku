// Markdown / plain text -> speakable paragraphs (one string per paragraph).

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  middot: "·",
  bull: "•",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m);
}

const SPOKEN: Array<[RegExp, string]> = [
  [/\be\.g\.,?\s*/gi, "for example, "],
  [/\bi\.e\.,?\s*/gi, "that is, "],
  [/\bvs\.?\s+(?=[a-z])/gi, "versus "],
  [/\bcf\.\s*/gi, "compare "],
  [/\bet al\./gi, "and others"],
  [/\s&\s/g, " and "],
  [/\bw\/\s*/g, "with "],
];

export function wordCount(s: string): number {
  return (s.match(/\S+/g) ?? []).length;
}

/** Strip markdown and HTML down to plain prose. Every non-empty line becomes a paragraph. */
export function markdownToParagraphs(md: string): string[] {
  let s = md.replace(/\r\n?/g, "\n");

  // Code and comments: not worth hearing.
  s = s.replace(/```[\s\S]*?```/g, "\n").replace(/~~~[\s\S]*?~~~/g, "\n");
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // Residual HTML.
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(
    /<\/?(p|div|h[1-6]|li|ul|ol|blockquote|section|article|figure|figcaption|table|thead|tbody|tr|td|th|pre|aside|header|footer|nav)\b[^>]*>/gi,
    "\n",
  );
  s = s.replace(/<[^>]+>/g, "");

  // Images out, links to their text, reference definitions out.
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1");
  s = s.replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, "");

  // Footnote markers and bracketed citations.
  s = s.replace(/\[\^[^\]]+\]/g, "");
  s = s.replace(/\[\d{1,3}\]/g, "");
  s = s.replace(/^\s*\^\d+.*$/gm, "");
  s = s.replace(/https?:\/\/\S+/g, "");

  // Tables, rules, block prefixes.
  s = s.replace(/^\s*\|.*\|\s*$/gm, "");
  s = s.replace(/^\s*[-*_]{3,}\s*$/gm, "");
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  s = s.replace(/^\s{0,3}>\s?/gm, "");
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  s = s.replace(/^\s*\d+[.)]\s+/gm, "");

  // Inline markers.
  s = s.replace(/`([^`\n]*)`/g, "$1");
  s = s.replace(/(\*\*|__)(.+?)\1/g, "$2");
  s = s.replace(
    /(^|[\s(])[*_](?=\S)(.+?)(?<=\S)[*_](?=[\s).,;:!?]|$)/gm,
    "$1$2",
  );
  s = s.replace(/\\([*_`#>\[\]()~-])/g, "$1");
  s = s.replace(/(?<![A-Za-z0-9])[*_]{1,3}(?![A-Za-z0-9])/g, "");

  s = decodeEntities(s);
  for (const [re, to] of SPOKEN) s = s.replace(re, to);

  // Whitespace and paragraphing.
  s = s.replace(/[ \t ]+/g, " ");
  const lines = s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const paragraphs: string[] = [];
  for (const line of lines) {
    if (/^[\W_]+$/.test(line)) continue; // punctuation-only debris
    for (const piece of splitLong(line)) paragraphs.push(ensureTerminal(piece));
  }
  return paragraphs;
}

/** Kokoro handles long English paragraphs, but keep each unit bounded so progress stays granular. */
function splitLong(line: string, max = 1400): string[] {
  if (line.length <= max) return [line];
  const sentences = line.match(/[^.!?]+[.!?]+["’”)]*\s*|[^.!?]+$/g) ?? [line];
  const out: string[] = [];
  let cur = "";
  for (const sen of sentences) {
    if ((cur + sen).length > max && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += sen;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function ensureTerminal(p: string): string {
  return /[.!?…:;"’”)\]]$/.test(p) ? p : p + ".";
}

export function titleFromMarkdown(md: string): string | undefined {
  const h = md.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m);
  if (h) return cleanInline(h[1]);
  const first = md
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!first) return undefined;
  const t = cleanInline(first);
  return t.length > 90 ? t.slice(0, 87).replace(/\s+\S*$/, "") + "…" : t;
}

export function cleanInline(s: string): string {
  return decodeEntities(
    s
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`#>]+/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}
