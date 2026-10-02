// Notes: a second the person chose, the words playing then, and the words they said about it.
// One JSON file, written serially like the library. Each reading's notes are also rendered as a
// markdown file in notes/, for reading anywhere; those are written, never read back.
import fs from "node:fs/promises";
import path from "node:path";

/** What a note hangs on: a reading in the library, or a show's episode played from its enclosure. */
export type NoteSource = {
  id: string;
  kind: "reading" | "episode";
  title: string;
  by?: string;
  /** A file name in audio/ for a reading; the enclosure URL for an episode. */
  file: string;
  art?: string;
  sourceUrl?: string;
};

export type Note = {
  id: string;
  sourceId: string;
  /** Seconds into the audio. */
  at: number;
  /** The words playing at the mark: a reading's paragraph, or an episode's transcribed window. */
  quote?: string;
  /** The paragraph was estimated from length, because the reading predates paragraph times. */
  approx?: boolean;
  /** An episode's window is still being transcribed. */
  pending?: boolean;
  /** What the person said or typed. */
  said?: string;
  createdAt: string;
};

type State = { sources: Record<string, NoteSource>; notes: Note[] };

/** The paragraph playing at `seconds`, given each paragraph's start. Before the first is the first. */
export function indexAt(starts: number[], seconds: number): number {
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1] <= seconds) i++;
  return i;
}

/**
 * Paragraph starts from the speech step's progress lines, which report where each paragraph
 * ended. The first starts at zero; each after starts where the one before it ended.
 */
export function startsFromEnds(ends: number[]): number[] {
  return ends.length ? [0, ...ends.slice(0, -1)] : [];
}

/**
 * Paragraph starts for a reading made before times were kept: speech time shared out by length,
 * with the fixed silence the speech step puts after every paragraph. Close, not exact.
 */
export function estimateStarts(
  paragraphs: string[],
  seconds: number,
  gap = 0.45,
): number[] {
  const chars = paragraphs.map((p) => p.length);
  const total = chars.reduce((a, b) => a + b, 0);
  const perChar = total
    ? Math.max(0, seconds - gap * paragraphs.length) / total
    : 0;
  const starts: number[] = [];
  let t = 0;
  for (const n of chars) {
    starts.push(Math.round(t * 10) / 10);
    t += n * perChar + gap;
  }
  return starts;
}

/** A person marks after hearing: the paragraph that counts is the one playing this long before. */
export const LAG_SECONDS = 2;

export function clock(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = sec % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** One reading's notes as a markdown file: frontmatter, then a heading per note in time order. */
export function toMarkdown(source: NoteSource, notes: Note[]): string {
  const yaml = (s: string) => JSON.stringify(s);
  const head = ["---", `title: ${yaml(source.title)}`];
  if (source.by) head.push(`by: ${yaml(source.by)}`);
  if (source.sourceUrl) head.push(`source: ${yaml(source.sourceUrl)}`);
  head.push(`kind: ${source.kind}`, "---", "", `# ${source.title}`, "", "");
  const body = [...notes]
    .sort((a, b) => a.at - b.at)
    .map((n) => {
      const lines = [`## ${clock(n.at)}`, ""];
      if (n.quote)
        lines.push(
          ...n.quote.split("\n").map((l) => "> " + l),
          ...(n.approx ? [">", "> (the paragraph is approximate)"] : []),
          "",
        );
      if (n.said) lines.push(n.said, "");
      return lines.join("\n");
    });
  return head.join("\n") + body.join("\n");
}

export class Notes {
  readonly dir: string;
  private file: string;
  private state: State = { sources: {}, notes: [] };
  private chain: Promise<unknown> = Promise.resolve();

  constructor(home: string) {
    this.file = path.join(home, "notes.json");
    this.dir = path.join(home, "notes");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, "utf8"));
      this.state = {
        sources: parsed.sources ?? {},
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      };
    } catch {
      this.state = { sources: {}, notes: [] };
    }
  }

  all(): State {
    return this.state;
  }

  get(id: string): Note | undefined {
    return this.state.notes.find((n) => n.id === id);
  }

  source(id: string): NoteSource | undefined {
    return this.state.sources[id];
  }

  countBySource(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const n of this.state.notes)
      out[n.sourceId] = (out[n.sourceId] ?? 0) + 1;
    return out;
  }

  /** The markdown file a source's notes are rendered into. */
  fileOf(sourceId: string): string {
    return path.join(this.dir, path.basename(sourceId) + ".md");
  }

  add(source: NoteSource, note: Note): Promise<void> {
    return this.mutate(source.id, () => {
      this.state.sources[source.id] = source;
      this.state.notes.push(note);
    });
  }

  update(id: string, patch: Partial<Note>): Promise<Note | undefined> {
    const note = this.get(id);
    if (!note) return Promise.resolve(undefined);
    return this.mutate(note.sourceId, () => {
      Object.assign(note, patch);
    }).then(() => note);
  }

  remove(id: string): Promise<boolean> {
    const note = this.get(id);
    if (!note) return Promise.resolve(false);
    return this.mutate(note.sourceId, () => {
      this.state.notes = this.state.notes.filter((n) => n.id !== id);
    }).then(() => true);
  }

  /** Apply a change, write the JSON, and re-render the one source's markdown (or remove it). */
  private mutate(sourceId: string, fn: () => void): Promise<void> {
    const next = this.chain.then(async () => {
      fn();
      const own = this.state.notes.filter((n) => n.sourceId === sourceId);
      if (!own.length) delete this.state.sources[sourceId];
      const tmp = this.file + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(this.state, null, 2));
      await fs.rename(tmp, this.file);
      const md = this.fileOf(sourceId);
      const source = this.state.sources[sourceId];
      if (source) await fs.writeFile(md, toMarkdown(source, own));
      else await fs.unlink(md).catch(() => {});
    });
    this.chain = next.catch(() => {});
    return next;
  }
}
