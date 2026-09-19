// The library: one JSON file plus the audio folder. Written serially so concurrent jobs never clobber it.
import fs from "node:fs/promises";
import path from "node:path";

export type Item = {
  id: string;
  title: string;
  author?: string;
  site?: string;
  sourceUrl?: string;
  sourceType: "url" | "file" | "text";
  file: string; // basename inside audio/
  bytes: number;
  seconds: number;
  words: number;
  voice: string;
  speed: number;
  createdAt: string; // ISO
  exportedAt?: string; // ISO; when a copy was confirmed in the Proton Drive folder
};

export class Library {
  readonly home: string;
  readonly audioDir: string;
  readonly textDir: string;
  private file: string;
  private items: Item[] = [];
  private chain: Promise<unknown> = Promise.resolve();

  constructor(home: string) {
    this.home = home;
    this.audioDir = path.join(home, "audio");
    this.textDir = path.join(home, "text");
    this.file = path.join(home, "library.json");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.audioDir, { recursive: true });
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
    await fs.unlink(path.join(this.audioDir, item.file)).catch(() => {});
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
