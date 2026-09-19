import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  JobsStore,
  markInterrupted,
  toStored,
  type Job,
  type StoredJob,
} from "../src/jobs.ts";

function job(over: Partial<Job> = {}): Job {
  return {
    id: "j1",
    status: "reading",
    mode: "listen",
    title: "An essay",
    detail: "12/40 paragraphs",
    progress: 0.3,
    seconds: 100,
    itemIds: [],
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:01:00.000Z",
    voice: "af_heart",
    speed: 1,
    input: { kind: "url", url: "https://example.com/essay" },
    ...over,
  };
}

test("toStored keeps a url and small text for a retry, never a file's bytes", () => {
  const url = toStored(job());
  assert.equal(url.input, "https://example.com/essay");
  assert.deepEqual(url.again, {
    kind: "url",
    url: "https://example.com/essay",
  });

  const text = toStored(
    job({ input: { kind: "text", text: "hello", title: "Hi" } }),
  );
  assert.equal(text.input, "pasted text");
  assert.deepEqual(text.again, { kind: "text", text: "hello", title: "Hi" });

  const huge = toStored(
    job({ input: { kind: "text", text: "x".repeat(30_000) } }),
  );
  assert.equal(
    huge.again,
    undefined,
    "a pasted book is not kept on disk twice",
  );

  const file = toStored(
    job({
      input: { kind: "file", name: "book.epub", buf: Buffer.from("...") },
    }),
  );
  assert.equal(file.input, "book.epub");
  assert.equal(file.again, undefined);
  assert.equal(JSON.stringify(file).includes("buf"), false);
});

test("markInterrupted turns anything still running into an honest error", () => {
  const stored: StoredJob[] = [
    toStored(job({ id: "a", status: "reading" })),
    toStored(job({ id: "b", status: "done" })),
    toStored(
      job({ id: "c", status: "error", error: "Nothing readable was found." }),
    ),
    toStored(
      job({
        id: "d",
        status: "queued",
        input: { kind: "file", name: "x.pdf", buf: Buffer.alloc(1) },
      }),
    ),
  ];
  const out = markInterrupted(stored);
  assert.equal(out[0].status, "error");
  assert.equal(out[0].detail, "interrupted");
  assert.equal(out[0].error, "Interrupted before it finished.");
  assert.equal(out[1].status, "done");
  assert.equal(out[2].error, "Nothing readable was found.");
  assert.match(out[3].error ?? "", /Submit the file again/);
});

test("JobsStore round-trips through jobs.json and marks the interrupted on load", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kiku-jobs-"));
  const store = new JobsStore(home);
  assert.deepEqual(await store.load(), [], "no file yet is an empty list");
  await store.write([
    toStored(job({ id: "a", status: "encoding" })),
    toStored(job({ id: "b", status: "done" })),
  ]);
  const back = await store.load();
  assert.equal(back.length, 2);
  assert.equal(back[0].status, "error");
  assert.equal(back[1].status, "done");
  assert.equal(
    fs.existsSync(path.join(home, "jobs.json.tmp")),
    false,
    "the temp file is renamed away",
  );
});
