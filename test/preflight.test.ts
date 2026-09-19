import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { kokoroSnapshot, hfCacheRoot, KOKORO_REPO } from "../src/preflight.ts";
import { chooseModel, memoryBudget } from "../src/ollama.ts";

// kokoroSnapshot reads HF_HUB_CACHE at call time, so each test points it at its own tree.
function fakeCache(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kiku-hf-"));
  process.env.HF_HUB_CACHE = dir;
  return dir;
}
const modelDir = (root: string) =>
  path.join(root, "models--" + KOKORO_REPO.replace("/", "--"), "snapshots");

test("hfCacheRoot honours HF_HUB_CACHE over HF_HOME", () => {
  process.env.HF_HUB_CACHE = "/x/hub";
  process.env.HF_HOME = "/y";
  assert.equal(hfCacheRoot(), "/x/hub");
  delete process.env.HF_HUB_CACHE;
  assert.equal(hfCacheRoot(), path.join("/y", "hub"));
  delete process.env.HF_HOME;
});

test("no cache means no snapshot", () => {
  fakeCache();
  assert.equal(kokoroSnapshot(), null);
});

test("a half-downloaded snapshot does not count", () => {
  const root = fakeCache();
  const snap = path.join(modelDir(root), "abc123");
  fs.mkdirSync(snap, { recursive: true });
  fs.writeFileSync(path.join(snap, "config.json"), "{}");
  assert.equal(kokoroSnapshot(), null, "config alone is not the weights");
  fs.writeFileSync(path.join(snap, "kokoro-v1_0.safetensors"), "");
  assert.equal(kokoroSnapshot(), snap);
});

test("memoryBudget is three quarters of the machine", () => {
  assert.equal(memoryBudget(16e9), 12e9);
  assert.equal(memoryBudget(96e9), 72e9);
});

const studio = [
  { name: "gpt-oss:120b", bytes: 65e9 },
  { name: "qwen3.6:35b-a3b", bytes: 22e9 },
  { name: "qwen2.5:7b", bytes: 4.7e9 },
  { name: "nomic-embed-text", bytes: 0.27e9 },
];

test("chooseModel takes the largest that fits, never a toy", () => {
  const on16 = chooseModel(studio, memoryBudget(16e9), undefined);
  assert.ok(on16.ok);
  assert.equal(on16.model, "qwen2.5:7b");
  const on96 = chooseModel(studio, memoryBudget(96e9), undefined);
  assert.ok(on96.ok);
  assert.equal(on96.model, "gpt-oss:120b");
});

test("chooseModel names the pull when nothing fits or nothing is there", () => {
  const big = chooseModel(
    [{ name: "gpt-oss:120b", bytes: 65e9 }],
    12e9,
    undefined,
  );
  assert.equal(big.ok, false);
  if (!big.ok) {
    assert.match(big.reason, /larger than 12\.0GB/);
    assert.match(big.fix, /^ollama pull /);
  }
  const none = chooseModel([], 12e9, undefined);
  assert.equal(none.ok, false);
  if (!none.ok) assert.equal(none.reason, "no model installed");
});

test("KIKU_MODEL pins the choice and is honest when it is missing", () => {
  const pinned = chooseModel(studio, 1, "qwen2.5:7b");
  assert.ok(pinned.ok);
  assert.equal(pinned.why, "pinned by KIKU_MODEL");
  const missing = chooseModel(studio, 1e12, "llama9:1t");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.fix, "ollama pull llama9:1t");
});
