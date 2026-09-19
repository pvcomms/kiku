import { test } from "node:test";
import assert from "node:assert/strict";
import {
  excerpt,
  PAIRS,
  SCHEMA,
  systemPrompt,
  toSets,
  validate,
  type SetSpec,
} from "../src/analyze.ts";

function good(): SetSpec {
  return {
    title: "Life after work",
    domains: [
      { label: "Work", desc: "What we do because someone pays." },
      { label: "Play", desc: "What we do because we cannot not." },
      { label: "Rest", desc: "What the body takes back." },
    ],
    pairs: [
      { a: 0, b: 1, name: "the craft", desc: "paid play." },
      {
        a: 0,
        b: 2,
        name: "the weekend",
        desc: "rest that exists to return to work.",
      },
      {
        a: 1,
        b: 2,
        name: "the hobby",
        desc: "play with nothing riding on it.",
      },
    ],
    triple: { name: "the good life", desc: "all three, rarely at once." },
    marker: { label: "here" },
    offrec: { label: "the work nobody counts" },
  };
}

test("a right answer has no problems", () => {
  assert.deepEqual(validate(good(), 3), []);
});

test("validate names every way a three-set answer can be wrong", () => {
  const bad = good();
  bad.title = "";
  bad.domains.push({ label: "Extra", desc: "one too many" });
  bad.pairs[0] = { a: 0, b: 0, name: "", desc: "x" };
  bad.pairs[1] = { a: 1, b: 0, name: "dup of 0,1", desc: "x" };
  bad.marker.label = "m".repeat(41);
  const p = validate(bad, 3);
  assert.ok(p.includes("title is empty"));
  assert.ok(p.includes("domains has 4 entries, needs exactly 3"));
  assert.ok(p.some((s) => s.startsWith("pairs[0] has bad indices")));
  assert.ok(p.includes("pairs[0].name is empty"));
  assert.ok(
    p.includes("pair 0,2 is missing"),
    "the pair overwritten by the duplicate is reported missing",
  );
  assert.ok(p.includes("marker.label is over 40 characters"));
});

test("validate accepts pairs in either index order and rejects pairs the layout cannot draw", () => {
  const swapped = good();
  swapped.pairs[0] = { a: 1, b: 0, name: "the craft", desc: "paid play." };
  assert.deepEqual(validate(swapped, 3), []);

  const five = good();
  assert.ok(
    validate(five, 5).includes("domains has 3 entries, needs exactly 5"),
  );
  assert.equal(PAIRS[5].length, 7, "five circles draw seven of the ten pairs");
  const undrawn = validate(
    { ...five, pairs: [{ a: 3, b: 4, name: "x", desc: "y" }] },
    5,
  );
  assert.ok(
    undrawn.includes("pairs[0] is 3,4, which this layout does not draw"),
  );
});

test("validate survives garbage", () => {
  assert.deepEqual(validate(null, 3), ["not an object"]);
  assert.ok(validate({}, 3).length > 5);
  assert.ok(validate({ domains: "no", pairs: 7 }, 3).length > 5);
});

test("excerpt keeps a short document whole and trims a long one to its frame", () => {
  const short = "# Title\n\nsome words here";
  assert.deepEqual(excerpt(short), { text: short, trimmed: false });

  const para = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
  const long = ["# One", para, "## Two", para, "## Three", para].join("\n\n");
  const r = excerpt(long, 250);
  assert.equal(r.trimmed, true);
  assert.ok(r.text.startsWith("Outline:\n# One\n## Two\n## Three"));
  assert.ok(r.text.includes("[…]"));
  assert.ok(r.text.split(/\s+/).length < 300);
});

test("systemPrompt names the exact pairs and count for each layout", () => {
  assert.match(systemPrompt(3), /exactly 3 sets/);
  assert.match(systemPrompt(3), /\(0,1\) \(0,2\) \(1,2\)/);
  assert.match(
    systemPrompt(5),
    /\(0,1\) \(0,3\) \(0,2\) \(1,2\) \(1,4\) \(2,3\) \(2,4\)/,
  );
  assert.equal(SCHEMA.required.length, 6);
});

test("toSets returns a right answer untouched and never calls twice for it", async () => {
  let calls = 0;
  const fake = async () => {
    calls++;
    return { raw: JSON.stringify(good()), parsed: good() };
  };
  const r = await toSets("# doc\n\nwords", "doc", 3, "fake:1b", fake);
  assert.equal(calls, 1);
  assert.equal(r.repaired, false);
  assert.equal(r.trimmed, false);
  assert.equal(r.spec.title, "Life after work");
});

test("toSets repairs once, feeding the problems back, then gives up with them listed", async () => {
  const broken = { ...good(), title: "" };
  const seen: string[] = [];
  const fixesItself = async (
    _m: string,
    messages: { role: string; content: string }[],
  ) => {
    seen.push(messages[messages.length - 1].content);
    const answer = messages.length > 2 ? good() : broken;
    return { raw: JSON.stringify(answer), parsed: answer };
  };
  const r = await toSets("words", "doc", 3, "fake:1b", fixesItself);
  assert.equal(r.repaired, true);
  assert.equal(seen.length, 2);
  assert.match(seen[1], /^That answer has problems:\n- title is empty/);

  const neverLearns = async () => ({
    raw: JSON.stringify(broken),
    parsed: broken,
  });
  await assert.rejects(
    () => toSets("words", "doc", 3, "fake:1b", neverLearns),
    /fake:1b could not draw this after one correction: title is empty/,
  );
});
