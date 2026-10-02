import { test } from "node:test";
import assert from "node:assert/strict";
import { isLoopback, listenHost, venvDir, venvPython } from "../src/config.ts";
import { page, readPage } from "../src/ui.ts";

test("the page answers on loopback unless told otherwise", () => {
  assert.equal(listenHost({}), "127.0.0.1");
  assert.equal(listenHost({ KIKU_HOST: "" }), "127.0.0.1");
  assert.equal(listenHost({ KIKU_HOST: "0.0.0.0" }), "0.0.0.0");
});

test("loopback is recognised, the network is not", () => {
  for (const h of ["127.0.0.1", "127.0.0.2", "localhost", "::1"])
    assert.equal(isLoopback(h), true, h);
  for (const h of ["0.0.0.0", "192.168.1.20", "mac-studio.local"])
    assert.equal(isLoopback(h), false, h);
});

test("the speech environment is .venv in the repo unless KIKU_VENV moves it", () => {
  assert.equal(venvDir("/opt/kiku", {}), "/opt/kiku/.venv");
  assert.equal(venvPython("/opt/kiku", {}), "/opt/kiku/.venv/bin/python");
  const moved = { KIKU_VENV: "/Users/x/Library/Application Support/Kiku/venv" };
  assert.equal(venvDir("/opt/kiku", moved), moved.KIKU_VENV);
  assert.equal(venvPython("/opt/kiku", moved), moved.KIKU_VENV + "/bin/python");
});

test("the page says whether there is anything to draw with", () => {
  const props = { voices: [], defaultVoice: "af_heart", hosts: [], setup: false, inboxCap: 2000, view: "focus" as const, speak: false };
  assert.match(page({ ...props, see: true }), /<html lang="en" data-see="on" data-speak="off">/);
  assert.match(page({ ...props, see: false }), /<html lang="en" data-see="off" data-speak="off">/);
});

test("the page offers speak only with a voice model, and /notes shows the notes alone", () => {
  const props = { voices: [], defaultVoice: "af_heart", hosts: [], setup: false, see: true, inboxCap: 2000 };
  assert.match(page({ ...props, view: "focus", speak: true }), /data-speak="on"/);
  assert.doesNotMatch(page({ ...props, view: "focus", speak: false }), /<b>speak<\/b>/);
  const notes = page({ ...props, view: "notes", speak: true });
  assert.match(notes, /<section class="rise" id="notesSec">/);
  assert.match(notes, /<section class="rise" id="inboxSec" hidden>/);
  assert.match(notes, /<section class="rise" id="sources" hidden>/);
  assert.match(notes, /<a href="\/notes" class="on">notes<\/a>/);
  assert.match(page({ ...props, view: "focus", speak: true }), /<section class="rise" id="notesSec" hidden>/);
});

test("both pages carry the theme button, and the saved theme is applied before any style", () => {
  const props = { voices: [], defaultVoice: "af_heart", hosts: [], setup: false, see: true, inboxCap: 2000, view: "focus" as const, speak: true };
  const pages = [page(props), readPage({ title: "T", paragraphs: ["p"], words: 1 })];
  for (const html of pages) {
    assert.match(html, /<button class="theme" id="theme"/);
    const head = html.indexOf('localStorage.getItem("kiku.theme")');
    assert.ok(head > 0 && head < html.indexOf("<style>"), "theme is read before the first stylesheet");
    assert.match(html, /:root\[data-theme="dark"\]/);
    assert.match(html, /:root:not\(\[data-theme="light"\]\)/);
  }
});

test("the focus page shows the players and the articles; /sources shows the rest", () => {
  const props = { voices: [], defaultVoice: "af_heart", hosts: [], setup: false, see: true, inboxCap: 2000, speak: true };
  const focus = page({ ...props, view: "focus" });
  const manage = page({ ...props, view: "manage" });
  assert.match(focus, /<section class="rise" id="inboxSec">/);
  assert.match(focus, /<section class="rise" id="sources" hidden>/);
  assert.match(focus, /<form class="compose rise" id="compose" autocomplete="off" hidden>/);
  assert.match(manage, /<section class="rise" id="inboxSec" hidden>/);
  assert.match(manage, /<section class="rise" id="sources">/);
  assert.match(manage, /<form class="compose rise" id="compose" autocomplete="off">/);
  // one face, self-hosted, and nothing else is ever declared
  for (const html of [focus, manage, readPage({ title: "T", paragraphs: ["p"], words: 1 })]) {
    const faces = [...html.matchAll(/font-family: "([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(faces)], ["IBM Plex Mono"]);
    assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
  }
});
