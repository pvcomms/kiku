import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleParser } from "mailparser";
import {
  headerLooksLikeNewsletter,
  fromAddress,
  headerDate,
} from "../src/mail/detect.ts";
import { cleanHtml, stripMailChrome } from "../src/mail/sanitize.ts";
import { MailStore, letterFrom } from "../src/mail/sync.ts";
import { Accounts, isAccount } from "../src/mail/accounts.ts";

const HEADERS = `From: Zvi <zvi@substack.com>
To: you@example.org
Subject: AI #100
Date: Mon, 28 Sep 2026 14:00:00 +0000
Message-ID: <abc123@substack.com>
List-Unsubscribe: <https://substack.com/unsub>
`;

test("a list header or a sending platform marks a newsletter", () => {
  assert.equal(headerLooksLikeNewsletter(HEADERS), true);
  assert.equal(
    headerLooksLikeNewsletter(
      "From: a friend <friend@example.org>\nSubject: hi\n",
    ),
    false,
  );
  assert.equal(
    headerLooksLikeNewsletter("From: x <news@mail.beehiiv.com>\nSubject: hi\n"),
    true,
  );
  assert.equal(fromAddress(HEADERS), "zvi@substack.com");
  assert.equal(
    headerDate(HEADERS),
    Date.parse("Mon, 28 Sep 2026 14:00:00 +0000"),
  );
});

test("cleaning keeps the words and the real links, drops pixels, images and click trackers", () => {
  const raw = `<table><tr><td>
    <h1>AI #100</h1>
    <p>Read <a href="https://substack.com/redirect/2/abc?j=x">the paper</a> and
       <a href="https://arxiv.org/abs/1234?utm_source=substack&utm_medium=email">this one</a>.</p>
    <img src="https://open.substack.com/o/abc.gif" width="1" height="1">
    <img src="https://cdn.example.org/photo.jpg" width="600">
    <div style="display:none">preview text</div>
    <script>alert(1)</script>
  </td></tr></table>`;
  const out = cleanHtml(raw);
  assert.match(out, /<h1>AI #100<\/h1>/);
  assert.match(out, /<span>the paper<\/span>/);
  assert.match(out, /<a href="https:\/\/arxiv\.org\/abs\/1234">this one<\/a>/);
  assert.doesNotMatch(out, /<img/);
  assert.doesNotMatch(out, /preview text/);
  assert.doesNotMatch(out, /alert/);
  assert.doesNotMatch(out, /<table|<td/);
});

test("a raw message becomes a letter with its cleaned body, without a server", async () => {
  const raw = `${HEADERS}Content-Type: text/html; charset=utf-8

<html><body><p>Hello <a href="https://example.org/p?utm_campaign=x">world</a></p><img src="https://x/o.gif" width="1"></body></html>
`;
  const parsed = await simpleParser(raw);
  const { letter, html } = letterFrom(parsed, "proton", "fallback");
  assert.equal(letter.subject, "AI #100");
  assert.equal(letter.from, "Zvi");
  assert.equal(letter.fromAddress, "zvi@substack.com");
  assert.equal(letter.messageId, "<abc123@substack.com>");
  assert.match(letter.id, /^mail-[0-9a-f]{16}$/);
  assert.equal(letter.file, letter.id + ".html");
  assert.equal(html.includes('href="https://example.org/p"'), true);
  assert.equal(html.includes("<img"), false);
});

test("a plain-text message still becomes a letter", async () => {
  const parsed = await simpleParser(
    `${HEADERS}\nJust words.\n\nSecond paragraph.\n`,
  );
  const { html } = letterFrom(parsed, "proton", "fallback");
  assert.match(html, /Just words/);
  assert.match(html, /Second paragraph/);
});

test("the mail store keeps a cursor per account and folder and the ids it has taken", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kiku-mail-"));
  const store = new MailStore(home);
  await store.init();
  await store.setCursor("proton", "INBOX", { uidValidity: 7, lastUid: 42 });
  await store.markSeen(["<a@x>", "<b@x>"]);
  const again = new MailStore(home);
  await again.init();
  assert.deepEqual(again.cursor("proton", "INBOX"), {
    uidValidity: 7,
    lastUid: 42,
  });
  assert.equal(again.hasSeen("<a@x>"), true);
  assert.equal(again.hasSeen("<c@x>"), false);
  await again.forget("proton");
  assert.equal(again.cursor("proton", "INBOX"), undefined);
  assert.equal(
    again.pathOf("../escape.html"),
    path.join(home, "mail", "escape.html"),
  );
});

test("accounts are stored mode 600 and listed without their password", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kiku-acc-"));
  const acc = new Accounts(home);
  await acc.init();
  await acc.add({
    name: "proton",
    host: "127.0.0.1",
    port: 1143,
    secure: false,
    user: "me@proton.me",
    pass: "secret",
    allowInsecureTls: true,
  });
  await acc.add({
    name: "other",
    host: "imap.example.org",
    port: 993,
    secure: true,
    user: "me@example.org",
    pass: "secret2",
    allowInsecureTls: true, // not loopback: must be dropped
  });
  const mode = (await fs.stat(path.join(home, "accounts.json"))).mode & 0o777;
  assert.equal(mode, 0o600);
  const listed = acc.list();
  assert.equal(listed.length, 2);
  assert.equal("pass" in listed[0], false);
  assert.equal(acc.get("other")?.allowInsecureTls, false);
  assert.equal(acc.get("proton")?.allowInsecureTls, true);
  assert.equal(
    isAccount({ name: "x", host: "h", port: 1, user: "u", pass: "PASTE-ME" }),
    false,
  );
  const again = new Accounts(home);
  await again.init();
  assert.equal(again.all().find((a) => a.name === "proton")?.pass, "secret");
});

test("Substack's mail chrome is stripped from the paragraphs, the post is not", () => {
  const md = [
    "Forwarded this email? Subscribe here for more",
    "# The Post",
    "The first real paragraph, with a [link](https://example.org).",
    "Zvi's newsletter is a reader-supported publication. To receive new posts, consider becoming a paid subscriber.",
    "Share",
    "Another real paragraph.",
    "Thanks for reading! Subscribe for free to receive new posts.",
    "© 2026 Zvi · 548 Market Street · Unsubscribe",
  ].join("\n\n");
  const out = stripMailChrome(md);
  assert.doesNotMatch(out, /Forwarded this email|reader-supported|Unsubscribe|^Share$|Thanks for reading/m);
  assert.match(out, /The first real paragraph/);
  assert.match(out, /Another real paragraph/);
  assert.match(out, /# The Post/);
});
