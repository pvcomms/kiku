import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportFile, reconcile, resolveExportDir } from "../src/export.ts";

const tmp = (p: string) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test("resolveExportDir: KIKU_EXPORT_DIR wins, else the live Proton folder, else null", () => {
  assert.equal(
    resolveExportDir({ KIKU_EXPORT_DIR: "/x/y" }, "/nowhere"),
    "/x/y",
  );

  const home = tmp("kiku-home-");
  assert.equal(resolveExportDir({}, home), null, "no CloudStorage at all");

  const cloud = path.join(home, "Library", "CloudStorage");
  fs.mkdirSync(cloud, { recursive: true });
  assert.equal(
    resolveExportDir({}, home),
    null,
    "CloudStorage with nothing in it",
  );

  // The stale re-sync copy sits beside the live folder with a date in its name.
  for (const n of [
    "GoogleDrive-someone@gmail.com",
    "ProtonDrive-p@pm.me-folder (01-08-26 10:00 AM)",
    "ProtonDrive-p@pm.me-folder",
    "iCloudDrive-iCloudDrive (18-09-26 4:09 AM)",
  ])
    fs.mkdirSync(path.join(cloud, n));
  assert.equal(
    resolveExportDir({}, home),
    path.join(cloud, "ProtonDrive-p@pm.me-folder", "Kiku"),
  );
});

test("exportFile copies once, then reports it present, and leaves no .part behind", async () => {
  const src = path.join(tmp("kiku-src-"), "a1-essay.mp3");
  fs.writeFileSync(src, "audio".repeat(100));
  const dest = path.join(tmp("kiku-dest-"), "Kiku", "Audio", "a1-essay.mp3");

  assert.equal(await exportFile(src, dest), "copied");
  assert.equal(fs.readFileSync(dest, "utf8"), "audio".repeat(100));
  assert.equal(fs.existsSync(dest + ".part"), false);
  assert.equal(await exportFile(src, dest), "present");

  // A destination of a different size is a broken or older copy: replace it.
  fs.writeFileSync(dest, "stub");
  assert.equal(await exportFile(src, dest), "copied");
  assert.equal(fs.statSync(dest).size, 500);
});

test("reconcile reports each outcome and a missing source cannot stop the others", async () => {
  const srcDir = tmp("kiku-src-");
  const destDir = tmp("kiku-dest-");
  fs.writeFileSync(path.join(srcDir, "ok.mp3"), "x");
  const lines: string[] = [];
  const sweep = await reconcile(
    [
      {
        id: "gone",
        src: path.join(srcDir, "gone.mp3"),
        dest: path.join(destDir, "gone.mp3"),
      },
      {
        id: "ok",
        src: path.join(srcDir, "ok.mp3"),
        dest: path.join(destDir, "ok.mp3"),
      },
    ],
    (l) => lines.push(l),
  );
  assert.deepEqual(sweep, { copied: ["ok"], present: [], failed: ["gone"] });
  assert.equal(fs.existsSync(path.join(destDir, "ok.mp3")), true);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^export failed for gone\.mp3/);
  assert.equal(lines[1], "exported ok.mp3");
});
