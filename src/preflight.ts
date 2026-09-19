// What the machine needs before a reading can happen, and the exact command that closes each
// gap. Nothing in here installs, downloads or starts anything: it looks, and it reports.
//
// Two depths. The shallow pass only touches the filesystem and Ollama, so the page can poll it.
// The deep pass also spawns the venv's python to prove MLX and the spaCy pipeline really load,
// which takes a few seconds and is what `bin/doctor` runs.
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chooseModel, gb, installed } from "./ollama.ts";
import { resolveExportDir } from "./export.ts";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The repo id bin/tts.py loads. Its cache directory name is derived from it. */
export const KOKORO_REPO = "mlx-community/Kokoro-82M-bf16";

/** A long book makes a few hundred MB of intermediate wav. Refuse to start below this. */
export const FREE_FLOOR_BYTES = 2_000_000_000;

const MIN_NODE_MAJOR = 25;

/**
 * `need` is what a reading cannot happen without. `want` is what one half of kiku uses — the
 * model for `see`, Proton Drive for the copies — and its absence is reported, not raised:
 * `listen` still works on a plane with neither.
 */
export type Level = "need" | "want";
export type Check = {
  name: string;
  ok: boolean;
  level: Level;
  detail: string;
  fix?: string;
};
export type Report = { ok: boolean; checks: Check[] };

export type CheckOptions = {
  /** Spawn the venv python to prove the speech stack imports. Slow; off by default. */
  deep?: boolean;
  home?: string;
  root?: string;
};

export async function check(opts: CheckOptions = {}): Promise<Report> {
  const root = opts.root ?? ROOT;
  const home =
    opts.home ?? process.env.KIKU_HOME ?? path.join(os.homedir(), "Kiku");
  const checks: Check[] = [];

  const major = Number(process.versions.node.split(".")[0]);
  checks.push({
    name: "node",
    ok: major >= MIN_NODE_MAJOR,
    level: "need",
    detail: `v${process.versions.node}`,
    fix: `brew install node  # kiku runs TypeScript directly and needs ${MIN_NODE_MAJOR} or newer`,
  });

  for (const [bin, why, fix] of BINARIES) {
    const found = await which(bin);
    checks.push({
      name: bin,
      ok: found !== null,
      level: "need",
      detail: found ?? `not on PATH — ${why}`,
      fix,
    });
  }

  const python = path.join(root, ".venv", "bin", "python");
  const hasVenv = isExecutable(python);
  checks.push({
    name: "speech venv",
    ok: hasVenv,
    level: "need",
    detail: hasVenv ? python : "no .venv at the repo root",
    fix: "bin/setup-python.sh",
  });

  if (opts.deep && hasVenv) checks.push(await importsSpeechStack(python));

  const weights = kokoroSnapshot();
  checks.push({
    name: "kokoro weights",
    ok: weights !== null,
    level: "need",
    detail: weights ?? `${KOKORO_REPO} is not in the Hugging Face cache`,
    fix: `bin/kiku "warming the voice up"  # once, online, to cache the weights`,
  });

  checks.push(await ollamaCheck());

  const exportDir = resolveExportDir();
  checks.push({
    name: "proton drive",
    ok: exportDir !== null,
    level: "want",
    detail:
      exportDir ??
      "no Proton Drive sync folder under ~/Library/CloudStorage — copies are off",
    fix: "open Proton Drive.app and sign in; or KIKU_EXPORT_DIR=/a/folder to choose one",
  });

  const free = await freeBytes(home).catch(() => null);
  checks.push({
    name: "disk",
    ok: free !== null && free >= FREE_FLOOR_BYTES,
    level: "need",
    detail:
      free === null
        ? `cannot read free space on ${home}`
        : `${gb(free)} free on ${home}`,
    fix: "free up space, or point KIKU_HOME at a volume that has some",
  });

  return {
    ok: checks.every((c) => c.ok || c.level === "want"),
    checks,
  };
}

const BINARIES: [string, string, string][] = [
  ["ffmpeg", "encodes the mp3", "brew install ffmpeg"],
  ["ffprobe", "reads the finished duration", "brew install ffmpeg"],
  ["pdftotext", "reads PDFs", "brew install poppler"],
  ["markitdown", "reads epub, docx and odt", "brew install markitdown"],
];

async function which(bin: string): Promise<string | null> {
  return run("/usr/bin/which", [bin])
    .then(({ stdout }) => stdout.trim() || null)
    .catch(() => null);
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function importsSpeechStack(python: string): Promise<Check> {
  const probe = [
    "import mlx_audio, spacy",
    "spacy.load('en_core_web_sm')",
    "print('ok')",
  ].join("; ");
  try {
    await run(python, ["-c", probe], { timeout: 120_000 });
    return {
      name: "speech imports",
      ok: true,
      level: "need",
      detail: "mlx_audio and en_core_web_sm both load",
    };
  } catch (e) {
    return {
      name: "speech imports",
      ok: false,
      level: "need",
      detail: lastLine(e),
      fix: "bin/setup-python.sh  # rebuilds .venv from pyproject.toml",
    };
  }
}

/** The Hugging Face cache root, honouring the two environment variables that move it. */
export function hfCacheRoot(): string {
  if (process.env.HF_HUB_CACHE) return process.env.HF_HUB_CACHE;
  const home =
    process.env.HF_HOME ?? path.join(os.homedir(), ".cache", "huggingface");
  return path.join(home, "hub");
}

/**
 * The path of the cached Kokoro snapshot, or null when it is not there. A snapshot counts only
 * if it holds both the config and the weights: a half-finished download is worse than none,
 * because it makes the offline switch below claim the machine is ready when it is not.
 */
export function kokoroSnapshot(): string | null {
  const dir = path.join(
    hfCacheRoot(),
    "models--" + KOKORO_REPO.replace("/", "--"),
    "snapshots",
  );
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const snapshot = path.join(dir, entry);
    let files: string[];
    try {
      files = fs.readdirSync(snapshot);
    } catch {
      continue;
    }
    const hasWeights = files.some((f) => f.endsWith(".safetensors"));
    if (hasWeights && files.includes("config.json")) return snapshot;
  }
  return null;
}

async function ollamaCheck(): Promise<Check> {
  let models;
  try {
    models = await installed();
  } catch {
    return {
      name: "ollama",
      ok: false,
      level: "want",
      detail: "not reachable on 127.0.0.1:11434 — only the see half needs it",
      fix: "brew services start ollama  # or: ollama serve",
    };
  }
  const choice = chooseModel(models);
  return choice.ok
    ? {
        name: "ollama",
        ok: true,
        level: "want",
        detail: `${choice.model} (${gb(choice.bytes)}) — ${choice.why}`,
      }
    : {
        name: "ollama",
        ok: false,
        level: "want",
        detail: choice.reason,
        fix: choice.fix,
      };
}

export async function freeBytes(dir: string): Promise<number> {
  const target = fs.existsSync(dir) ? dir : path.dirname(dir);
  const s = await fsp.statfs(target);
  return Number(s.bavail) * Number(s.bsize);
}

function lastLine(e: unknown): string {
  const text = e instanceof Error ? (e.message ?? "") : String(e);
  const lines = text.split("\n").filter((l) => l.trim());
  return lines[lines.length - 1] ?? "failed";
}
