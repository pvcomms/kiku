import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanUrl,
  cleanMarkdownLinks,
  isTrackingPixel,
} from "../src/hygiene.ts";

test("utm and click ids are stripped, real parameters stay", () => {
  assert.equal(
    cleanUrl(
      "https://aeon.co/essays/x?utm_source=substack&utm_medium=email&page=2&fbclid=abc",
    ),
    "https://aeon.co/essays/x?page=2",
  );
});

test("a Substack post link loses its reader id but keeps the post", () => {
  assert.equal(
    cleanUrl(
      "https://thezvi.substack.com/p/ai-100?r=1abc&s=r&utm_campaign=post&triedRedirect=true",
    ),
    "https://thezvi.substack.com/p/ai-100",
  );
  assert.equal(
    cleanUrl(
      "https://www.interconnects.ai/p/open-models?publication_id=48206&post_id=1&r=xyz&isFreemail=true",
    ),
    "https://www.interconnects.ai/p/open-models",
  );
});

test("a Substack redirect cannot be unwrapped and is dropped", () => {
  assert.equal(
    cleanUrl("https://substack.com/redirect/2/abc123?j=eyJ1IjoiMWFiYyJ9&s=r"),
    null,
  );
  assert.equal(
    cleanUrl("https://substack.com/app-link/post?publication_id=1&post_id=2"),
    null,
  );
});

test("Mailchimp, SendGrid, beehiiv and ConvertKit click trackers are dropped", () => {
  for (const u of [
    "https://example.us14.list-manage.com/track/click?u=abc&id=def&e=ghi",
    "https://u123.ct.sendgrid.net/ls/click?upn=abc",
    "https://link.mail.beehiiv.com/ss/c/abc",
    "https://click.convertkit-mail2.com/abc/def",
    "https://links.somesender.com/e/c/abc",
  ])
    assert.equal(cleanUrl(u), null, u);
});

test("redirectors that carry the target are unwrapped, then cleaned", () => {
  assert.equal(
    cleanUrl(
      "https://www.google.com/url?q=https://example.org/post%3Futm_source%3Dx&sa=D",
    ),
    "https://example.org/post",
  );
  assert.equal(
    cleanUrl(
      "https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.org%2Fa%3Ffbclid%3D1&h=x",
    ),
    "https://example.org/a",
  );
  assert.equal(
    cleanUrl("https://href.li/?https://example.org/b"),
    "https://example.org/b",
  );
  assert.equal(
    cleanUrl("https://urldefense.com/v3/__https://example.org/c?x=1__;!!abc$"),
    "https://example.org/c?x=1",
  );
});

test("a plain google.com page is left alone", () => {
  assert.equal(
    cleanUrl("https://www.google.com/maps?q=cafe"),
    "https://www.google.com/maps?q=cafe",
  );
});

test("a non-http value passes through unchanged", () => {
  assert.equal(
    cleanUrl("mailto:someone@example.org"),
    "mailto:someone@example.org",
  );
  assert.equal(cleanUrl("not a url"), "not a url");
});

test("markdown links keep their text and lose only the tracker", () => {
  const md =
    "Read [the essay](https://aeon.co/e?utm_source=x) and [this](https://substack.com/redirect/2/abc).";
  assert.equal(
    cleanMarkdownLinks(md),
    "Read [the essay](https://aeon.co/e) and this.",
  );
});

test("tracking pixels are found by size, style or source", () => {
  assert.equal(
    isTrackingPixel({ width: "1", height: "1", src: "https://x/a.png" }),
    true,
  );
  assert.equal(
    isTrackingPixel({ style: "width:1px;height:1px", src: "https://x/a.png" }),
    true,
  );
  assert.equal(
    isTrackingPixel({ src: "https://open.substack.com/o/abc.gif" }),
    true,
  );
  assert.equal(
    isTrackingPixel({ src: "https://x.list-manage.com/track/open.php?u=1" }),
    true,
  );
  assert.equal(
    isTrackingPixel({ width: "600", src: "https://x/photo.jpg" }),
    false,
  );
});
