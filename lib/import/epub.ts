import { unzipSync, strFromU8 } from "fflate";
import { blocksToSource } from "./blocks";
import { documentToBlocks, type Block, type ExtractedText } from "./html";

/** An epub carries its own metadata, so the form can prefill author too. */
export interface ExtractedBook extends ExtractedText {
  author?: string;
}

type Zip = Record<string, Uint8Array>;

/** Zip entries are stored with forward slashes and no leading "./". */
function read(zip: Zip, path: string): string | null {
  const bytes = zip[path] ?? zip[decodeURIComponent(path)];
  return bytes ? strFromU8(bytes) : null;
}

/** Resolve an OPF-relative href ("html/ch01.html", "../x.html") against the OPF's dir. */
function resolve(opfPath: string, href: string): string {
  const parts = opfPath.split("/").slice(0, -1);
  for (const seg of href.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** First `<dc:tag>` value in the OPF metadata. Regex, not a DOM: real-world epubs
 * ship malformed XML (missing spaces between attributes) that a parser rejects. */
function meta(opf: string, tag: string): string | undefined {
  const m = new RegExp(`<dc:${tag}\\b[^>]*>([\\s\\S]*?)</dc:${tag}>`, "i").exec(opf);
  return m?.[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || undefined;
}

/** Ordered content documents of the package: spine itemrefs → manifest hrefs. */
function spinePaths(opf: string, opfPath: string): string[] {
  const manifest = new Map<string, { href: string; type: string }>();
  for (const m of opf.matchAll(/<item\b([^>]*)>/gi)) {
    const attrs = m[1];
    const id = /\bid\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
    const type = /\bmedia-type\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
    if (id && href) manifest.set(id, { href, type });
  }
  const out: string[] = [];
  for (const m of opf.matchAll(/<itemref\b([^>]*)>/gi)) {
    const attrs = m[1];
    // linear="no" marks matter bound outside the reading order (covers, ad pages).
    if (/\blinear\s*=\s*"no"/i.test(attrs)) continue;
    const item = manifest.get(/\bidref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "");
    if (item && /html/i.test(item.type)) out.push(resolve(opfPath, item.href));
  }
  return out;
}

/** Inner HTML of <body>; an epub file is a whole document, the block walker wants content. */
function bodyOf(xhtml: string): string {
  return /<body[^>]*>([\s\S]*)<\/body>/i.exec(xhtml)?.[1] ?? xhtml;
}

/**
 * Server-only: an epub (zip of XHTML) → the same { title, text, headingLevels }
 * shape as `htmlToSource`, by concatenating the spine documents in reading order.
 * Each file is extracted on its own (see `documentToBlocks`) so per-file headings
 * survive; the caller then structures the joined text like any other import.
 */
export function epubToSource(bytes: Uint8Array): ExtractedBook {
  let zip: Zip;
  try {
    zip = unzipSync(bytes);
  } catch {
    throw new Error("Not a readable epub (could not open the archive)");
  }

  const container = read(zip, "META-INF/container.xml");
  const opfPath = container && /full-path\s*=\s*"([^"]+)"/i.exec(container)?.[1];
  if (!opfPath) throw new Error("Not a valid epub (no META-INF/container.xml rootfile)");
  const opf = read(zip, opfPath);
  if (!opf) throw new Error(`Not a valid epub (missing package file ${opfPath})`);

  const blocks: Block[] = [];
  for (const path of spinePaths(opf, opfPath)) {
    const xhtml = read(zip, path);
    if (xhtml) blocks.push(...documentToBlocks(bodyOf(xhtml)));
  }

  const { text, headingLevels } = blocksToSource(blocks);
  return { title: meta(opf, "title"), author: meta(opf, "creator"), text, headingLevels };
}
