// Turn a URL, an uploaded file, or pasted text into { title, author, site, markdown }.
import { parseHTML } from "linkedom";
import { Defuddle } from "defuddle/node";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanInline, titleFromMarkdown, wordCount } from "./clean.ts";

const run = promisify(execFile);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type Extracted = {
  title: string;
  author?: string;
  site?: string;
  published?: string;
  sourceUrl?: string;
  sourceType: "url" | "file" | "text";
  markdown: string;
};

export type Part = { title: string; markdown: string };

export const URL_RE = /^https?:\/\/\S+$/i;

export async function fromUrl(url: string): Promise<Extracted> {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept:
        "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok)
    throw new Error(
      `Could not fetch that link (${res.status} ${res.statusText}).`,
    );
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  const finalUrl = res.url || url;

  if (ct.includes("application/pdf")) {
    const name = path.basename(new URL(finalUrl).pathname) || "document.pdf";
    return fromFile(
      name.endsWith(".pdf") ? name : name + ".pdf",
      Buffer.from(await res.arrayBuffer()),
      finalUrl,
    );
  }
  if (ct.startsWith("text/plain") || ct.includes("text/markdown")) {
    return fromText(await res.text(), undefined, finalUrl);
  }
  return fromHtml(await res.text(), finalUrl);
}

export async function fromHtml(html: string, url: string): Promise<Extracted> {
  const { document } = parseHTML(html);
  const r = await Defuddle(document, url, { markdown: true });
  let markdown = (r.content ?? "").trim();
  if (wordCount(markdown) < 60) {
    const { document: d2 } = parseHTML(html);
    for (const el of d2.querySelectorAll(
      "script,style,nav,header,footer,noscript",
    ))
      el.remove();
    markdown = (d2.body?.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
  }
  if (wordCount(markdown) < 20)
    throw new Error("Nothing readable was found on that page.");
  return {
    title:
      cleanInline(r.title || "") || titleFromMarkdown(markdown) || hostOf(url),
    author: r.author ? cleanInline(r.author) : undefined,
    site: r.site ? cleanInline(r.site) : hostOf(url),
    published: r.published || undefined,
    sourceUrl: url,
    sourceType: "url",
    markdown,
  };
}

export function fromText(
  text: string,
  title?: string,
  sourceUrl?: string,
): Extracted {
  const t = text.replace(/\r\n?/g, "\n").trim();
  if (!t) throw new Error("There is no text to read.");
  return {
    title: title?.trim() || titleFromMarkdown(t) || "Untitled",
    site: sourceUrl ? hostOf(sourceUrl) : undefined,
    sourceUrl,
    sourceType: sourceUrl ? "url" : "text",
    markdown: t,
  };
}

export async function fromFile(
  name: string,
  buf: Buffer,
  sourceUrl?: string,
): Promise<Extracted> {
  const ext = path.extname(name).toLowerCase();
  const isPdf = ext === ".pdf" || buf.subarray(0, 4).toString() === "%PDF";
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  const base = path.basename(name, ext).replace(/[-_]+/g, " ").trim();

  if (ext === ".html" || ext === ".htm") {
    const r = await fromHtml(
      buf.toString("utf8"),
      sourceUrl ?? "file:///" + encodeURIComponent(name),
    );
    return { ...r, sourceType: "file", sourceUrl };
  }
  if (isPdf) {
    const md = await pdfToText(buf, name);
    return {
      title: base || "Document",
      sourceUrl,
      sourceType: "file",
      markdown: md,
    };
  }
  if (isZip || ext === ".epub" || ext === ".docx") {
    const md = await markitdown(buf, ext || (isZip ? ".epub" : ".bin"));
    return {
      title: base || "Book",
      sourceUrl,
      sourceType: "file",
      markdown: md,
    };
  }
  const r = fromText(buf.toString("utf8"), undefined, sourceUrl);
  return {
    ...r,
    title: titleFromMarkdown(r.markdown) ?? base ?? "Untitled",
    sourceType: "file",
  };
}

async function tmpFile(buf: Buffer, ext: string): Promise<string> {
  const p = path.join(
    os.tmpdir(),
    `kiku-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
  );
  await fs.writeFile(p, buf);
  return p;
}

async function pdfToText(buf: Buffer, name: string): Promise<string> {
  const p = await tmpFile(buf, ".pdf");
  try {
    const { stdout } = await run(
      "pdftotext",
      ["-nopgbrk", "-enc", "UTF-8", p, "-"],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    return reflow(stdout);
  } catch {
    return markitdown(buf, ".pdf");
  } finally {
    fs.unlink(p).catch(() => {});
  }
}

async function markitdown(buf: Buffer, ext: string): Promise<string> {
  const p = await tmpFile(buf, ext);
  try {
    const { stdout } = await run("markitdown", [p], {
      maxBuffer: 128 * 1024 * 1024,
    });
    if (wordCount(stdout) < 20) throw new Error("Could not read that file.");
    return stdout;
  } finally {
    fs.unlink(p).catch(() => {});
  }
}

/** pdftotext hard-wraps lines; stitch them back into paragraphs. */
function reflow(text: string): string {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/);
  return blocks
    .map((b) =>
      b
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !/^\d{1,4}$/.test(l))
        .join(" ")
        .replace(/(\w)- (\w)/g, "$1$2"),
    )
    .filter(Boolean)
    .join("\n\n");
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Long books become one episode per chapter. Articles stay whole. */
export function splitIntoParts(ex: Extracted, minWordsForSplit = 9000): Part[] {
  const md = ex.markdown;
  if (wordCount(md) < minWordsForSplit)
    return [{ title: ex.title, markdown: md }];
  const re = /^\s{0,3}#{1,2}\s+(.+?)\s*#*\s*$/gm;
  const heads: Array<{ idx: number; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)))
    heads.push({ idx: m.index, title: cleanInline(m[1]) });
  if (heads.length < 3) return [{ title: ex.title, markdown: md }];

  const raw: Part[] = [];
  if (heads[0].idx > 0)
    raw.push({ title: "Front matter", markdown: md.slice(0, heads[0].idx) });
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].idx : md.length;
    raw.push({ title: h.title, markdown: md.slice(h.idx, end) });
  });

  // Fold tiny sections (title pages, epigraphs) into the section that follows.
  const parts: Part[] = [];
  let carry: Part | null = null;
  for (const p of raw) {
    const merged: Part = carry
      ? { title: p.title, markdown: carry.markdown + "\n\n" + p.markdown }
      : p;
    if (wordCount(merged.markdown) < 150) {
      carry = merged;
      continue;
    }
    parts.push(merged);
    carry = null;
  }
  if (carry) {
    if (parts.length)
      parts[parts.length - 1].markdown += "\n\n" + carry.markdown;
    else parts.push(carry);
  }
  return parts.map((p, i) => ({
    title: `${ex.title} · ${i + 1}. ${p.title}`,
    markdown: p.markdown,
  }));
}
