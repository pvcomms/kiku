// What a job is, and how it survives the process dying halfway through one.
//
// The queue itself stays in server.ts. This module owns the shape and the file, because a job
// that was reading a book when the laptop shut the lid should not come back as silence: it
// comes back as an error that says what it was and offers to start again.
import fsp from "node:fs/promises";
import path from "node:path";

export type Input =
  | { kind: "url"; url: string }
  | { kind: "text"; text: string; title?: string }
  | { kind: "file"; name: string; buf: Buffer };

/** What the reading turns into. `listen` speaks it; `see` draws it. */
export type Mode = "listen" | "see";

export type JobStatus =
  | "queued"
  | "extracting"
  | "reading"
  | "thinking"
  | "drawing"
  | "encoding"
  | "done"
  | "error";

export type Job = {
  id: string;
  status: JobStatus;
  mode: Mode;
  title: string;
  detail: string;
  progress: number;
  seconds: number;
  error?: string;
  itemIds: string[];
  createdAt: string;
  updatedAt: string;
  voice: string;
  speed: number;
  input: Input;
};

/** A job as it goes over the wire and onto disk: the input reduced to a label, plus enough to try again. */
export type StoredJob = Omit<Job, "input"> & {
  input: string;
  again?:
    | { kind: "url"; url: string }
    | { kind: "text"; text: string; title?: string };
};

/** Pasted text is kept for a retry only while it is small enough not to bloat the file. */
const MAX_REPLAY_CHARS = 20_000;

export function label(input: Input): string {
  if (input.kind === "url") return input.url;
  if (input.kind === "file") return input.name;
  return "pasted text";
}

export function toStored(job: Job): StoredJob {
  const { input, ...rest } = job;
  const stored: StoredJob = { ...rest, input: label(input) };
  if (input.kind === "url") stored.again = { kind: "url", url: input.url };
  else if (input.kind === "text" && input.text.length <= MAX_REPLAY_CHARS)
    stored.again = { kind: "text", text: input.text, title: input.title };
  return stored;
}

const RUNNING: JobStatus[] = [
  "queued",
  "extracting",
  "reading",
  "thinking",
  "drawing",
  "encoding",
];

/**
 * A job that was still running when the file was last written did not finish, because nothing
 * writes this file after the process is gone. Say so rather than leaving a progress bar that
 * will never move.
 */
export function markInterrupted(stored: StoredJob[]): StoredJob[] {
  return stored.map((j) =>
    RUNNING.includes(j.status)
      ? {
          ...j,
          status: "error" as const,
          detail: "interrupted",
          error:
            j.again === undefined
              ? "Interrupted before it finished. Submit the file again."
              : "Interrupted before it finished.",
        }
      : j,
  );
}

export class JobsStore {
  private file: string;
  private timer: NodeJS.Timeout | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private pending: StoredJob[] = [];

  constructor(home: string) {
    this.file = path.join(home, "jobs.json");
  }

  async load(): Promise<StoredJob[]> {
    try {
      const parsed = JSON.parse(await fsp.readFile(this.file, "utf8"));
      return markInterrupted(Array.isArray(parsed) ? parsed : []);
    } catch {
      return [];
    }
  }

  /** Debounced: a job in progress touches itself on every paragraph. */
  saveSoon(jobs: StoredJob[]): void {
    this.pending = jobs;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.write(this.pending);
    }, 1500);
  }

  /** Serial, like the library, so two writes can never interleave into a corrupt file. */
  write(jobs: StoredJob[]): Promise<void> {
    const next = this.chain.then(async () => {
      const tmp = this.file + ".tmp";
      await fsp.writeFile(tmp, JSON.stringify(jobs, null, 2));
      await fsp.rename(tmp, this.file);
    });
    this.chain = next.catch(() => {});
    return next;
  }
}
