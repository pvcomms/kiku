// Kokoro (via mlx-audio) -> WAV -> MP3 with tags and cover art.
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PYTHON = path.join(ROOT, ".venv", "bin", "python");
const DRIVER = path.join(ROOT, "bin", "tts.py");

export type Voice = { id: string; name: string; note: string };
export const VOICES: Voice[] = [
  { id: "af_heart", name: "Heart", note: "American · warm, the default" },
  { id: "af_bella", name: "Bella", note: "American · brighter" },
  { id: "bf_emma", name: "Emma", note: "British · measured" },
  { id: "am_michael", name: "Michael", note: "American · even" },
  { id: "bm_george", name: "George", note: "British · low" },
];
export const DEFAULT_VOICE = "af_heart";

export function isVoice(id: string): boolean {
  return VOICES.some((v) => v.id === id);
}

export type Progress = { done: number; total: number; seconds: number };

export function speak(
  textPath: string,
  wavPath: string,
  voice: string,
  speed: number,
  onProgress: (p: Progress) => void,
): Promise<{ seconds: number }> {
  const lang = voice.startsWith("b") ? "b" : "a";
  return new Promise((resolve, reject) => {
    const child = spawn(
      PYTHON,
      [
        DRIVER,
        "--in",
        textPath,
        "--out",
        wavPath,
        "--voice",
        voice,
        "--speed",
        String(speed),
        "--lang",
        lang,
      ],
      {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE ?? "0",
        },
      },
    );
    let seconds = 0;
    let stderr = "";
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const m = line.match(/^PROGRESS (\d+) (\d+) ([\d.]+)/);
        if (m) onProgress({ done: +m[1], total: +m[2], seconds: +m[3] });
        const d = line.match(/^DONE ([\d.]+)/);
        if (d) seconds = +d[1];
      }
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ seconds });
      else
        reject(
          new Error(
            `Voice generation failed (exit ${code}). ${lastLines(stderr)}`,
          ),
        );
    });
  });
}

function lastLines(s: string, n = 4): string {
  return s
    .split("\n")
    .filter((l) => l.trim() && !/Fetching|it\/s\]|hf_xet/.test(l))
    .slice(-n)
    .join(" · ");
}

export type Tags = {
  title: string;
  artist?: string;
  album?: string;
  comment?: string;
  date?: string;
  track?: number;
};

export async function encodeMp3(
  wavPath: string,
  mp3Path: string,
  tags: Tags,
  coverPath?: string,
): Promise<void> {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", wavPath];
  if (coverPath) args.push("-i", coverPath);
  args.push("-map", "0:a");
  if (coverPath)
    args.push("-map", "1:v", "-c:v", "copy", "-disposition:v", "attached_pic");
  args.push(
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "96k",
    "-ac",
    "1",
    "-ar",
    "24000",
    "-id3v2_version",
    "3",
  );
  const meta: Record<string, string | undefined> = {
    title: tags.title,
    artist: tags.artist,
    album: tags.album,
    comment: tags.comment,
    date: tags.date,
    track: tags.track ? String(tags.track) : undefined,
    genre: "Spoken Word",
  };
  for (const [k, v] of Object.entries(meta))
    if (v) args.push("-metadata", `${k}=${v}`);
  args.push(mp3Path);
  await run("ffmpeg", args);
}

export async function durationSeconds(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ]);
  return Math.round(parseFloat(stdout.trim()) || 0);
}
