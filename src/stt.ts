// Speech to text on this machine: a person's voice note, or a window of an episode, through
// mlx-audio in the speech venv. One transcription at a time, so two never share memory.
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotOf, STT_REPO } from "./preflight.ts";
import { PYTHON } from "./tts.ts";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRIVER = path.join(ROOT, "bin", "stt.py");

export const STT_MODEL = STT_REPO;

/** The weights are on disk, so `speak` can be offered. Nothing is downloaded to find out. */
export function canTranscribe(): boolean {
  return snapshotOf(STT_MODEL) !== null;
}

/**
 * Any audio ffmpeg reads, as the 16 kHz mono WAV the model wants. With `window`, only that span
 * of the input: for an episode, the seconds before a mark, fetched by range from the enclosure.
 */
export async function toWav(
  input: string,
  out: string,
  window?: { from: number; seconds: number },
): Promise<void> {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  if (/^https?:\/\//.test(input))
    args.push("-protocol_whitelist", "http,https,tcp,tls,crypto");
  if (window)
    args.push("-ss", String(window.from), "-t", String(window.seconds));
  args.push("-i", input, "-ar", "16000", "-ac", "1", out);
  await run("ffmpeg", args, { timeout: 120_000 });
}

let chain: Promise<unknown> = Promise.resolve();

/** The words in a WAV. Calls queue behind each other. */
export function transcribe(wavPath: string): Promise<string> {
  const next = chain.then(() => once(wavPath));
  chain = next.catch(() => {});
  return next;
}

function once(wavPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      PYTHON,
      [DRIVER, "--in", wavPath, "--model", STT_MODEL],
      {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE ?? "1",
          HF_HUB_DISABLE_TELEMETRY: "1",
        },
      },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => {
      err += d.toString();
      if (err.length > 20_000) err = err.slice(-20_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const line = out.split("\n").find((l) => l.startsWith("TEXT "));
      if (code === 0 && line !== undefined) resolve(line.slice(5).trim());
      else
        reject(
          new Error(
            `Transcription failed (exit ${code}). ${err.trim().split("\n").slice(-2).join(" · ")}`,
          ),
        );
    });
  });
}
