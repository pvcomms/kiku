// The library: one JSON file plus the audio and artifacts folders. Written serially so
// concurrent jobs never clobber it.
import fs from "node:fs/promises";
import path from "node:path";

/** What a reading became. Absent on entries from before there was a choice, which were all audio. */
export type Kind = "audio" | "artifact";

export type Item = {
  id: string;
  kind?: Kind;
  title: string;
  author?: string;
  site?: string;
  sourceUrl?: string;
  sourceType: "url" | "file" | "text";
  file: string; // basename inside audio/ or artifacts/, by kind
  bytes: number;
  words: number;
  createdAt: string; // ISO
  exportedAt?: string; // ISO; when a copy was confirmed in the Proton Drive folder
  // audio
  seconds?: number;
  voice?: string;
  speed?: number;
  // artifact
  artifactKind?: "venn";
  sets?: 3 | 5;
  model?: string; // the local model that read it
};

export function kindOf(item: Item): Kind {
  return item.kind ?? "audio";
}

export class Library {
  readonly home: string;
  readonly audioDir: string;
  readonly artifactsDir: string;
  readonly textDir: string;
  private file: string;
  private items: Item[] = [];
  private chain: Promise<unknown> = Promise.resolve();

  constructor(home: string) {
    this.home = home;
    this.audioDir = path.join(home, "audio");
    this.artifactsDir = path.join(home, "artifacts");
    this.textDir = path.join(home, "text");
    this.file = path.join(home, "library.json");
  }

  /** Where an item's file lives, by kind. */
  pathOf(item: Item): string {
    const dir = kindOf(item) === "artifact" ? this.artifactsDir : this.audioDir;
    return path.join(dir, item.file);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.audioDir, { recursive: true });
    await fs.mkdir(this.artifactsDir, { recursive: true });
    await fs.mkdir(this.textDir, { recursive: true });
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const parsed = JSON.parse(raw);
      this.items = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.items = [];
    }
  }

  list(): Item[] {
    return [...this.items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  get(id: string): Item | undefined {
    return this.items.find((i) => i.id === id);
  }

  add(item: Item): Promise<void> {
    return this.mutate(() => {
      this.items = this.items.filter((i) => i.id !== item.id);
      this.items.push(item);
    });
  }

  async remove(id: string): Promise<boolean> {
    const item = this.get(id);
    if (!item) return false;
    await this.mutate(() => {
      this.items = this.items.filter((i) => i.id !== id);
    });
    await fs.unlink(this.pathOf(item)).catch(() => {});
    await fs.unlink(path.join(this.textDir, item.id + ".txt")).catch(() => {});
    return true;
  }

  private mutate(fn: () => void): Promise<void> {
    const next = this.chain.then(async () => {
      fn();
      const tmp = this.file + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(this.items, null, 2));
      await fs.rename(tmp, this.file);
    });
    this.chain = next.catch(() => {});
    return next;
  }
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
