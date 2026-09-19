// Ollama, the local model runner. Every request in here goes to 127.0.0.1 and nowhere else.
// The model that does the work is whichever installed model is largest and still fits in
// memory, so there is no table of model names to keep in step with what has been pulled.
import os from "node:os";

export const HOST = process.env.KIKU_OLLAMA ?? "http://127.0.0.1:11434";

export type InstalledModel = { name: string; bytes: number };

export type Choice =
  | { ok: true; model: string; bytes: number; why: string }
  | { ok: false; reason: string; fix: string };

/** The smallest model worth asking to read a document. Anything under this is a toy. */
const MIN_BYTES = 1_500_000_000;

/** What `ollama pull` we name when nothing usable is installed. */
export const SUGGESTED_MODEL = "qwen2.5:7b";

export async function installed(timeoutMs = 2500): Promise<InstalledModel[]> {
  const res = await fetch(`${HOST}/api/tags`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`ollama answered ${res.status}`);
  const body = (await res.json()) as {
    models?: { name?: unknown; size?: unknown }[];
  };
  return (body.models ?? [])
    .map((m) => ({
      name: typeof m.name === "string" ? m.name : "",
      bytes: typeof m.size === "number" ? m.size : 0,
    }))
    .filter((m) => m.name);
}

/**
 * How much memory a model may occupy. Apple's unified memory lets Metal take roughly three
 * quarters of the machine, which is why a 65GB model runs on a 96GB Studio and an 18GB one
 * does not run on a 16GB laptop.
 */
export function memoryBudget(totalBytes = os.totalmem()): number {
  return Math.floor(totalBytes * 0.75);
}

export function chooseModel(
  models: InstalledModel[],
  budget = memoryBudget(),
  pinned = process.env.KIKU_MODEL,
): Choice {
  if (pinned) {
    const hit = models.find((m) => m.name === pinned);
    if (hit)
      return {
        ok: true,
        model: hit.name,
        bytes: hit.bytes,
        why: "pinned by KIKU_MODEL",
      };
    return {
      ok: false,
      reason: `KIKU_MODEL is ${pinned}, which is not installed`,
      fix: `ollama pull ${pinned}`,
    };
  }

  const fits = models
    .filter((m) => m.bytes >= MIN_BYTES && m.bytes <= budget)
    .sort((a, b) => b.bytes - a.bytes);
  if (fits.length > 0)
    return {
      ok: true,
      model: fits[0].name,
      bytes: fits[0].bytes,
      why: `largest of ${models.length} installed that fits ${gb(budget)} of memory`,
    };

  const tooBig = models.filter((m) => m.bytes > budget);
  if (tooBig.length > 0)
    return {
      ok: false,
      reason: `every installed model is larger than ${gb(budget)}: ${tooBig
        .map((m) => `${m.name} (${gb(m.bytes)})`)
        .join(", ")}`,
      fix: `ollama pull ${SUGGESTED_MODEL}`,
    };

  return {
    ok: false,
    reason: "no model installed",
    fix: `ollama pull ${SUGGESTED_MODEL}`,
  };
}

export function gb(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)}GB`;
}

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * One turn with the model, answered as JSON that fits `schema` — Ollama constrains the
 * sampling to it, so the shape is guaranteed and only the content can be wrong. The model is
 * released as soon as it answers (`keep_alive: 0`): on a 16GB laptop the speech step needs
 * that memory next, and the pump runs the two strictly one after the other.
 */
export async function chatJson(
  model: string,
  messages: Message[],
  schema: object,
  timeoutMs = 10 * 60_000,
): Promise<{ raw: string; parsed: unknown }> {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      format: schema,
      stream: false,
      keep_alive: 0,
      options: { temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok)
    throw new Error(
      `ollama answered ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  const body = (await res.json()) as { message?: { content?: unknown } };
  const raw =
    typeof body.message?.content === "string" ? body.message.content : "";
  try {
    return { raw, parsed: JSON.parse(raw) };
  } catch {
    throw new Error(`${model} did not answer with JSON: ${raw.slice(0, 120)}`);
  }
}
