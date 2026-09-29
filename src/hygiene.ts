// What a link is allowed to carry into the inbox. A person subscribed to an author, not to the
// author's mailing provider's click log. Every link from every source passes through here once:
// a wrapped link is unwrapped when its destination is in the URL, dropped to plain text when it
// is not, and a plain link loses the parameters that exist only to say who opened it.

/** Query parameters that identify the reader, the campaign or the click, never the page. */
const TRACKING_PARAMS =
  /^(utm_\w+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|twclid|ttclid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|hsctatracking|vero_id|vero_conv|ck_subscriber_id|mkt_tok|oly_enc_id|oly_anon_id|_bhlid|ss_email_id|ss_campaign_id|s_cid|ncid|sr_share|rb_clickid|_ga|_gl|ga_source|ga_medium|ga_campaign|mailchimp_id|__s|__hstc|__hssc|__hsfp)$/i;

/** Substack marks a post link with these; on such a link the short ones are reader ids too. */
const SUBSTACK_PARAMS =
  /^(r|s|ref|isfreemail|triedredirect|showwelcomeonshare|publication_id|post_id|token|action|redirect|utm_\w+)$/i;

/**
 * Redirectors whose target is a query parameter. Host is matched as a suffix, so
 * `www.google.com` matches `google.com`.
 */
const UNWRAP: { host: string; params: string[] }[] = [
  { host: "google.com", params: ["q", "url"] },
  { host: "l.facebook.com", params: ["u"] },
  { host: "lm.facebook.com", params: ["u"] },
  { host: "out.reddit.com", params: ["url"] },
  { host: "medium.com", params: ["url"] },
  { host: "t.umblr.com", params: ["z"] },
  { host: "youtube.com", params: ["q"] },
  { host: "safelinks.protection.outlook.com", params: ["url"] },
  { host: "linkprotect.cudasvc.com", params: ["a"] },
  { host: "duckduckgo.com", params: ["uddg"] },
  { host: "exit.sc", params: ["url"] },
  { host: "steamcommunity.com", params: ["url"] },
  { host: "href.li", params: [] },
];

/**
 * Click trackers whose target lives only on the provider's server. The link cannot be
 * repaired, so the text stays and the link goes.
 */
const OPAQUE: RegExp[] = [
  /(^|\.)substack\.com$/i, // /redirect/ and /app-link/; checked with the path below
  /(^|\.)list-manage\.com$/i,
  /(^|\.)mandrillapp\.com$/i,
  /(^|\.)sendgrid\.net$/i,
  /(^|\.)beehiiv\.com$/i,
  /(^|\.)convertkit-mail\d*\.com$/i,
  /(^|\.)kit-mail\d*\.com$/i,
  /(^|\.)mailgun\.org$/i,
  /(^|\.)mailchi\.mp$/i,
  /(^|\.)cmail\d*\.com$/i, // Campaign Monitor
  /(^|\.)createsend\d*\.com$/i,
  /(^|\.)customeriomail\.com$/i,
  /(^|\.)email\.mg\d*\./i,
  /(^|\.)links\.[a-z0-9-]+\.com$/i, // links.<sender>.com, the white-label pattern
  /(^|\.)click\.[a-z0-9-]+\.(com|co|io|net)$/i, // click.<sender>.com, same
  /(^|\.)email\.[a-z0-9-]+\.(com|co|io|net)$/i, // email.<sender>.com, same
  /(^|\.)ghost\.io$/i, // its /r/ endpoint
  /(^|\.)buttondown\.(email|com)$/i,
];

/** Paths on otherwise fine hosts that are click endpoints, not pages. */
const OPAQUE_PATHS =
  /\/(redirect|app-link|track\/click|ls\/click|r|c|o|e)\/|\/track\/click\b|\/redirect\b/i;

/** Image sources that exist to report an open, not to show anything. */
export const TRACKER_SRC_RE =
  /open\.substack\.com|substackcdn\.com\/open|list-manage\.com\/track|sendgrid\.net\/wf\/open|\/o\.gif|\/open\.gif|pixel\.gif|track\/open|beehiiv\.com\/o\/|mailchi\.mp.*track|\/wf\/open|\/e\/o\/|ck_subscriber_id|\.gif\?.*(?:uid|user|subscriber|cid)=/i;

/**
 * The link a person may keep. Returns the cleaned URL, or null when the link is a tracker whose
 * destination cannot be recovered, in which case the caller keeps the text and drops the link.
 * Anything that is not an http(s) URL comes back unchanged.
 */
export function cleanUrl(raw: string, depth = 0): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return raw;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  // Proofpoint wraps as /v3/__<url>__;<suffix> with a few characters escaped.
  if (/(^|\.)urldefense\.(com|proofpoint\.com)$/.test(host)) {
    const m = /\/v[23]\/__(.+?)__;/.exec(u.pathname + u.search);
    if (m) {
      const inner = m[1]
        .replace(/\*/g, "%")
        .replace(/-/g, "%2D")
        .replace(/_/g, "/");
      return depth < 3 ? cleanUrl(decodeURIComponent(inner), depth + 1) : null;
    }
    return null;
  }

  for (const r of UNWRAP) {
    if (host !== r.host && !host.endsWith("." + r.host)) continue;
    if (r.params.length === 0) {
      // href.li/?https://example.com
      const inner = u.search.slice(1);
      return /^https?:\/\//i.test(inner) && depth < 3
        ? cleanUrl(inner, depth + 1)
        : u.href;
    }
    for (const p of r.params) {
      const v = u.searchParams.get(p);
      if (v && /^https?:\/\//i.test(v))
        return depth < 3 ? cleanUrl(v, depth + 1) : v;
    }
    // A google.com link that is not a redirect is just a page on google.com.
    break;
  }

  const opaqueHost = OPAQUE.some((re) => re.test(host));
  if (opaqueHost) {
    // substack.com itself hosts posts at /p/ and profiles; only its click endpoints are opaque.
    const onlyPaths = /(^|\.)(substack\.com|ghost\.io)$/.test(host);
    if (!onlyPaths || OPAQUE_PATHS.test(u.pathname)) return null;
  }

  const isSubstackPost =
    u.searchParams.has("publication_id") ||
    u.searchParams.has("post_id") ||
    (/(^|\.)substack\.com$/.test(host) && /^\/(p|pub)\//.test(u.pathname));
  const keep = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (TRACKING_PARAMS.test(k)) continue;
    if (isSubstackPost && SUBSTACK_PARAMS.test(k)) continue;
    keep.append(k, v);
  }
  u.search = keep.toString() ? "?" + keep.toString() : "";
  u.hash = u.hash === "#" ? "" : u.hash;
  return u.href;
}

/** Whether an <img> is a pixel: by declared size, by inline style, or by where it points. */
export function isTrackingPixel(
  attribs: Record<string, string | undefined>,
): boolean {
  const w = parseInt(attribs.width ?? "", 10);
  const h = parseInt(attribs.height ?? "", 10);
  if ((!Number.isNaN(w) && w <= 2) || (!Number.isNaN(h) && h <= 2)) return true;
  const style = attribs.style ?? "";
  if (/(?:^|;)\s*(?:width|height)\s*:\s*[012]px/i.test(style)) return true;
  return TRACKER_SRC_RE.test(attribs.src ?? "");
}

/** Markdown links: `[text](url)` keeps its text always and its link only when cleanUrl allows. */
export function cleanMarkdownLinks(md: string): string {
  return md.replace(
    /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
    (_, text: string, url: string) => {
      const cleaned = cleanUrl(url);
      return cleaned === null ? text : `[${text}](${cleaned})`;
    },
  );
}
