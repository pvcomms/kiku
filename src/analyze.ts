// A document → the sets it is made of. The model is asked for the smallest thing that can
// become a diagram: labels, one-line descriptions, and names for the places where sets meet.
// Indices, not ids; no colours, no geometry, no physics — everything a small model could get
// wrong is a thing it is never asked for. src/artifact.ts turns the answer into the diagram.
import { chatJson, type Message } from "./ollama.ts";

export type Sets = 3 | 5;
export type Domain = { label: string; desc: string };
export type PairSpec = { a: number; b: number; name: string; desc: string };
export type SetSpec = {
  title: string;
  domains: Domain[];
  pairs: PairSpec[];
  triple: { name: string; desc: string };
  marker: { label: string };
  offrec: { label: string };
};

/**
 * The pairs each layout can draw, in the template's own order. Three circles show all three
 * meetings; five circles cannot show all ten, and the template is honest about which seven
 * it draws. The triple is always the first three sets.
 */
export const PAIRS: Record<Sets, [number, number][]> = {
  3: [
    [0, 1],
    [0, 2],
    [1, 2],
  ],
  5: [
    [0, 1],
    [0, 3],
    [0, 2],
    [1, 2],
    [1, 4],
    [2, 3],
    [2, 4],
  ],
};

/** What Ollama constrains the answer to. Counts and lengths are checked afterwards in validate(). */
export const SCHEMA = {
  type: "object",
  required: ["title", "domains", "pairs", "triple", "marker", "offrec"],
  properties: {
    title: { type: "string" },
    domains: {
      type: "array",
      items: {
        type: "object",
        required: ["label", "desc"],
        properties: { label: { type: "string" }, desc: { type: "string" } },
      },
    },
    pairs: {
      type: "array",
      items: {
        type: "object",
        required: ["a", "b", "name", "desc"],
        properties: {
          a: { type: "integer" },
          b: { type: "integer" },
          name: { type: "string" },
          desc: { type: "string" },
        },
      },
    },
    triple: {
      type: "object",
      required: ["name", "desc"],
      properties: { name: { type: "string" }, desc: { type: "string" } },
    },
    marker: {
      type: "object",
      required: ["label"],
      properties: { label: { type: "string" } },
    },
    offrec: {
      type: "object",
      required: ["label"],
      properties: { label: { type: "string" } },
    },
  },
};

const LIMITS = {
  title: 90,
  label: 40,
  desc: 200,
  name: 60,
  marker: 40,
  offrec: 90,
};

/** Every way an answer can be wrong, in words the model can act on. Empty means it is right. */
export function validate(spec: unknown, sets: Sets): string[] {
  const p: string[] = [];
  if (!spec || typeof spec !== "object") return ["not an object"];
  const s = spec as Record<string, unknown>;

  const str = (v: unknown, what: string, max: number) => {
    if (typeof v !== "string" || !v.trim()) p.push(`${what} is empty`);
    else if (v.length > max) p.push(`${what} is over ${max} characters`);
  };

  str(s.title, "title", LIMITS.title);

  const domains = Array.isArray(s.domains) ? s.domains : [];
  if (domains.length !== sets)
    p.push(`domains has ${domains.length} entries, needs exactly ${sets}`);
  domains.forEach((d: Record<string, unknown>, i: number) => {
    str(d?.label, `domains[${i}].label`, LIMITS.label);
    str(d?.desc, `domains[${i}].desc`, LIMITS.desc);
  });

  const want = PAIRS[sets].map(([a, b]) => `${a},${b}`);
  const pairs = Array.isArray(s.pairs) ? s.pairs : [];
  const seen = new Set<string>();
  pairs.forEach((q: Record<string, unknown>, i: number) => {
    const a = Number(q?.a);
    const b = Number(q?.b);
    const key = `${Math.min(a, b)},${Math.max(a, b)}`;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b)
      p.push(`pairs[${i}] has bad indices ${JSON.stringify([q?.a, q?.b])}`);
    else if (!want.includes(key))
      p.push(`pairs[${i}] is ${key}, which this layout does not draw`);
    else if (seen.has(key)) p.push(`pairs[${i}] repeats ${key}`);
    seen.add(key);
    str(q?.name, `pairs[${i}].name`, LIMITS.name);
    str(q?.desc, `pairs[${i}].desc`, LIMITS.desc);
  });
  for (const key of want) if (!seen.has(key)) p.push(`pair ${key} is missing`);

  const triple = (s.triple ?? {}) as Record<string, unknown>;
  str(triple.name, "triple.name", LIMITS.name);
  str(triple.desc, "triple.desc", LIMITS.desc);
  str(
    (s.marker as Record<string, unknown>)?.label,
    "marker.label",
    LIMITS.marker,
  );
  str(
    (s.offrec as Record<string, unknown>)?.label,
    "offrec.label",
    LIMITS.offrec,
  );
  return p;
}

/** Roughly what fits in a 32k context beside the prompt and the answer. */
export const MAX_WORDS = 16_000;

/**
 * The whole document when it fits; otherwise its headings, its opening and its close. A model
 * that has read the argument's frame, start and end draws it better than one handed a random
 * middle slice, and the job says when this happened rather than pretending.
 */
export function excerpt(
  markdown: string,
  maxWords = MAX_WORDS,
): { text: string; trimmed: boolean } {
  const words = markdown.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return { text: markdown, trimmed: false };
  const headings = markdown
    .split("\n")
    .filter((l) => /^#{1,3}\s/.test(l))
    .slice(0, 80);
  const head = words.slice(0, Math.floor(maxWords * 0.7)).join(" ");
  const tail = words.slice(-Math.floor(maxWords * 0.25)).join(" ");
  const text = [
    headings.length ? `Outline:\n${headings.join("\n")}` : "",
    head,
    "[…]",
    tail,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { text, trimmed: true };
}

export function systemPrompt(sets: Sets): string {
  const pairs = PAIRS[sets].map(([a, b]) => `(${a},${b})`).join(" ");
  return [
    `You draw a document as a diagram of ${sets} overlapping sets. Read it as its author would, and answer in the author's own vocabulary. Never invent facts.`,
    "",
    `- domains: exactly ${sets} sets, in order of importance. label: a noun phrase of one to three words. desc: one sentence under 120 characters saying what the set is in this document.`,
    `- pairs: exactly these index pairs, in this order: ${pairs}. Indices count domains from 0. name: two to four lowercase words for what exists only where both sets hold — a practice, a tension, a place. desc: one sentence under 120 characters.`,
    "- triple: what sits where sets 0, 1 and 2 all meet. name: two to four lowercase words. desc: one sentence.",
    "- marker: where the author stands in the diagram. label: one to three words.",
    "- offrec: the set the document circles but never draws — the thing it leaves unsaid. label: three to ten words.",
    "- title: the document's title, shortened to under 80 characters.",
    "",
    "Return only the JSON object.",
  ].join("\n");
}

export type Analysis = { spec: SetSpec; repaired: boolean; trimmed: boolean };
export type Call = typeof chatJson;

/**
 * One call, and one repair when the answer is wrong in a way validate() can name. No third
 * attempt: a model that cannot draw a document after being told what was wrong is not going
 * to, and the error lists the problems instead.
 */
export async function toSets(
  markdown: string,
  title: string,
  sets: Sets,
  model: string,
  call: Call = chatJson,
): Promise<Analysis> {
  const { text, trimmed } = excerpt(markdown);
  const messages: Message[] = [
    { role: "system", content: systemPrompt(sets) },
    { role: "user", content: `Title: ${title}\n\n${text}` },
  ];
  let { raw, parsed } = await call(model, messages, SCHEMA);
  let problems = validate(parsed, sets);
  if (problems.length === 0)
    return { spec: parsed as SetSpec, repaired: false, trimmed };

  messages.push(
    { role: "assistant", content: raw },
    {
      role: "user",
      content: `That answer has problems:\n- ${problems.join("\n- ")}\n\nReturn the whole object again with every one of them fixed.`,
    },
  );
  ({ raw, parsed } = await call(model, messages, SCHEMA));
  problems = validate(parsed, sets);
  if (problems.length > 0)
    throw new Error(
      `${model} could not draw this after one correction: ${problems.slice(0, 4).join("; ")}${problems.length > 4 ? ` (+${problems.length - 4} more)` : ""}`,
    );
  return { spec: parsed as SetSpec, repaired: true, trimmed };
}
