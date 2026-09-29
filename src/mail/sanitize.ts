// A newsletter as the author wrote it: the words, the headings, the links that go somewhere.
// Not the design, not the images, not the pixel that reports the open, not the click tracker
// that reports the link. What comes out is stored on disk and is all kiku ever reads from.
import sanitizeHtml from "sanitize-html";
import { cleanUrl, isTrackingPixel } from "../hygiene.ts";

/**
 * Lines a mailing platform wraps around the letter: the forward notice, the subscribe nags,
 * the share button, the postal address the law requires. Matched on whole paragraphs of the
 * extracted markdown, so a sentence inside the post that mentions subscribing is untouched.
 */
const CHROME_RE = [
  /^forwarded this email\b/i,
  /^(view|open|read) (it )?in (the )?app\.?$/i,
  /^listen to (the )?(article|this|post|episode)\.?$/i,
  /^(read|view) (the )?(full )?(article|post) (online|on the web)\.?$/i,
  /^(view|read) (this|it) (in|on) (your )?browser\b/i,
  /^(thanks|thank you) for (reading|subscribing)\b/i,
  /\bis a reader-supported publication\b/i,
  /^(to receive new posts|consider becoming a (free or )?paid subscriber)/i,
  /^(share|like|comment|restack|leave a comment|share this post|subscribe now|subscribe|upgrade to paid)\.?$/i,
  /^(you're|you are) (currently )?(receiving|on the) (this|free|paid)\b/i,
  /^(unsubscribe|manage (your )?subscription|update your preferences|privacy policy)\b/i,
  /^©\s*\d{4}\b/,
  /\bunsubscribe\b.*$/i,
  /^\d{2,5} [A-Z][\w .]+ (Street|St|Avenue|Ave|Road|Rd|Blvd|Suite)\b.*$/,
];

export function stripMailChrome(markdown: string): string {
  return markdown
    .split(/\n{2,}/)
    .filter((p) => !CHROME_RE.some((re) => re.test(p.trim())))
    .join("\n\n")
    .trim();
}

const HIDDEN_STYLE_RE =
  /display\s*:\s*none|max-height\s*:\s*0|font-size\s*:\s*0(?:px)?\s*(?:;|$)|opacity\s*:\s*0\s*(?:;|$)|mso-hide/i;

function dropJunk(frame: sanitizeHtml.IFrame): boolean {
  if (HIDDEN_STYLE_RE.test(frame.attribs?.style ?? "")) return true;
  if (frame.tag === "img" && isTrackingPixel(frame.attribs ?? {})) return true;
  return false;
}

export function cleanHtml(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: [
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "a",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "strong",
      "em",
      "b",
      "i",
      "u",
      "s",
      "hr",
      "br",
      "figure",
      "figcaption",
      "div",
      "span",
      "sub",
      "sup",
      "mark",
      "small",
    ],
    allowedAttributes: { a: ["href", "title"] },
    transformTags: {
      table: "div",
      thead: "div",
      tbody: "div",
      tfoot: "div",
      tr: "div",
      td: "div",
      th: "div",
      center: "div",
      font: "span",
      article: "div",
      section: "div",
      header: "div",
      footer: "div",
      main: "div",
      // A link is kept only when its destination survives cleaning; otherwise its text stays as text.
      a: (tagName, attribs) => {
        const href = attribs.href ? cleanUrl(attribs.href) : null;
        if (href === null) return { tagName: "span", attribs: {} };
        return {
          tagName,
          attribs: { href, ...(attribs.title ? { title: attribs.title } : {}) },
        };
      },
    },
    exclusiveFilter: dropJunk,
    allowedSchemes: ["http", "https", "mailto"],
    // A picture in a newsletter is fetched from the sender's server when shown. It is not shown.
    nonTextTags: ["style", "script", "textarea", "option", "noscript", "img"],
  });
}
