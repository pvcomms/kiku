import { test } from "node:test";
import assert from "node:assert/strict";
import { isLoopback, listenHost, venvDir, venvPython } from "../src/config.ts";
import { page } from "../src/ui.ts";

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
  const props = { voices: [], defaultVoice: "af_heart", hosts: [], setup: false };
  assert.match(page({ ...props, see: true }), /<html lang="en" data-see="on">/);
  assert.match(page({ ...props, see: false }), /<html lang="en" data-see="off">/);
});
