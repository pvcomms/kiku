// Private podcast feed. Absolute URLs are built from whatever host the client used to reach us.
import type { Item } from "./library.ts";

export function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[c] as string,
  );
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function buildFeed(items: Item[], base: string): string {
  const now = new Date().toUTCString();
  const entries = items
    .map((it) => {
      const audio = `${base}/audio/${encodeURIComponent(it.file)}`;
      const by = [it.author, it.site].filter(Boolean).join(" · ");
      const desc = [
        by,
        it.sourceUrl ? `Source: ${it.sourceUrl}` : "",
        `${it.words.toLocaleString()} words · read by Kokoro (${it.voice})`,
      ]
        .filter(Boolean)
        .join("\n");
      const html = [
        by ? `<p>${escapeXml(by)}</p>` : "",
        it.sourceUrl
          ? `<p><a href="${escapeXml(it.sourceUrl)}">${escapeXml(it.sourceUrl)}</a></p>`
          : "",
      ]
        .filter(Boolean)
        .join("");
      return `    <item>
      <title>${escapeXml(it.title)}</title>
      <itunes:title>${escapeXml(it.title)}</itunes:title>
      ${it.author ? `<itunes:author>${escapeXml(it.author)}</itunes:author>` : ""}
      <guid isPermaLink="false">kiku-${escapeXml(it.id)}</guid>
      ${it.sourceUrl ? `<link>${escapeXml(it.sourceUrl)}</link>` : ""}
      <pubDate>${new Date(it.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(desc)}</description>
      <content:encoded><![CDATA[${html}]]></content:encoded>
      <enclosure url="${escapeXml(audio)}" length="${it.bytes}" type="audio/mpeg"/>
      <itunes:duration>${it.seconds}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
      <itunes:episodeType>full</itunes:episodeType>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Kiku</title>
    <link>${escapeXml(base)}/</link>
    <atom:link href="${escapeXml(base)}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Articles, files and pasted text, read aloud on the Studio. Private feed.</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <itunes:author>Kiku</itunes:author>
    <itunes:summary>Articles, files and pasted text, read aloud on the Studio. Private feed.</itunes:summary>
    <itunes:image href="${escapeXml(base)}/cover.png"/>
    <image><url>${escapeXml(base)}/cover.png</url><title>Kiku</title><link>${escapeXml(base)}/</link></image>
    <itunes:explicit>false</itunes:explicit>
    <itunes:block>Yes</itunes:block>
    <itunes:type>episodic</itunes:type>
    <itunes:category text="Society &amp; Culture"/>
${entries}
  </channel>
</rss>
`;
}
