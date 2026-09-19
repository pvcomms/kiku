// Copies of finished readings into Proton Drive's sync folder, so they reach the phone and
// every other machine end to end encrypted, with nothing but Proton in between.
//
// An archive, not a sync channel. This machine's library stays its own; nothing is ever read
// back from the folder; two machines exporting into it cannot collide because every file name
// starts with an id that is time plus randomness. Nothing in here may fail a reading: a
// reading is finished when it is in ~/Kiku, and the copy is a separate, retried step.
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const AUDIO_DIR = "Audio";
export const ARTIFACTS_DIR = "Artifacts";

/**
 * Where the copies go, or null when this machine has nowhere to put them. `KIKU_EXPORT_DIR`
 * wins. Otherwise the Proton Drive app's sync folder: it lives under CloudStorage with the
 * account in its name, and a stale re-sync leaves a second copy with a date in parentheses
 * beside it, which is why that one is passed over.
 */
export function resolveExportDir(
  env: NodeJS.ProcessEnv = process.env,
  home = os.homedir(),
): string | null {
  if (env.KIKU_EXPORT_DIR) return env.KIKU_EXPORT_DIR;
  const cloud = path.join(home, "Library", "CloudStorage");
  let names: string[];
  try {
    names = fs.readdirSync(cloud);
  } catch {
    return null;
  }
  const live = names
    .filter((n) => /^ProtonDrive-.*-folder$/.test(n) && !n.includes("("))
    .sort();
  return live.length > 0 ? path.join(cloud, live[0], "Kiku") : null;
}

export type Copied = "copied" | "present";

/**
 * Copy one finished file into place. The destination is another filesystem, so this is a copy
 * to a `.part` beside the final name and a rename within that directory, never a move across
 * the boundary. A file already there at the same size is left alone.
 */
export async function exportFile(src: string, dest: string): Promise<Copied> {
  const size = (await fsp.stat(src)).size;
  const there = await fsp.stat(dest).catch(() => null);
  if (there && there.size === size) return "present";
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const part = dest + ".part";
  await fsp.copyFile(src, part);
  await fsp.rename(part, dest);
  return "copied";
}

export type Pair = { id: string; src: string; dest: string };
export type Sweep = { copied: string[]; present: string[]; failed: string[] };

/** Bring every listed file into place; report rather than throw. */
export async function reconcile(
  pairs: Pair[],
  log: (line: string) => void = () => {},
): Promise<Sweep> {
  const out: Sweep = { copied: [], present: [], failed: [] };
  for (const p of pairs) {
    try {
      const r = await exportFile(p.src, p.dest);
      out[r].push(p.id);
      if (r === "copied") log(`exported ${path.basename(p.dest)}`);
    } catch (e) {
      out.failed.push(p.id);
      log(
        `export failed for ${path.basename(p.src)}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return out;
}
