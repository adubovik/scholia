import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { blocksToSource } from "./blocks";

// ── New structured-block extraction ──────────────────────────────────────────

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string };

export interface ExtractedDoc {
  title?: string;
  blocks: Block[];
}

const HEADING_TAGS = "h1,h2,h3,h4,h5,h6";
const GUTENBERG_MARKER = /\*{3}\s*(START|END) OF (THE|THIS) PROJECT GUTENBERG/i;
const CONTENTS_HEADING = /^(table of\s+)?contents$/i;
const BYLINE = /^by\s+\S/i;

/** A block plus the DOM-derived signal used only during TOC stripping. */
interface RawBlock {
  kind: "heading" | "paragraph";
  level: number; // heading level, or 0 for paragraphs
  text: string;
  linkish: boolean; // paragraph text is mostly internal (#) anchors
}

/** Strip a trailing "| Project Gutenberg" / " - Site" suffix from a title. */
function cleanTitle(raw: string): string {
  return raw.split(/\s+[|–—\-]\s+/)[0].trim();
}

/** Walk h1–h6 + p in document order into raw blocks (h1 skipped: it is the title). */
function collectRawBlocks(rootHtml: string): { blocks: RawBlock[]; firstH1?: string } {
  const { document } = parseHTML(`<body>${rootHtml}</body>`);
  const root = document.querySelector("article") ?? document;
  const blocks: RawBlock[] = [];
  let firstH1: string | undefined;

  for (const el of root.querySelectorAll(`${HEADING_TAGS},p`)) {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (GUTENBERG_MARKER.test(text)) continue;

    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      if (level === 1) {
        firstH1 ??= text;
        continue;
      }
      blocks.push({ kind: "heading", level, text, linkish: false });
    } else {
      const anchors = [...el.querySelectorAll('a[href^="#"]')];
      const linkLen = anchors.reduce((s, a) => s + ((a.textContent ?? "").trim().length), 0);
      const linkish = text.length > 0 && linkLen / text.length >= 0.5;
      blocks.push({ kind: "paragraph", level: 0, text, linkish });
    }
  }
  return { blocks, firstH1 };
}

/** R1: drop Contents-style headings. Byline: drop a heading `By …` with no prose before the next heading. */
function stripHeadingCruft(blocks: RawBlock[]): RawBlock[] {
  return blocks.filter((b, i) => {
    if (b.kind !== "heading") return true;
    if (CONTENTS_HEADING.test(b.text)) return false;
    if (BYLINE.test(b.text)) {
      const next = blocks[i + 1];
      if (!next || next.kind === "heading") return false;
    }
    return true;
  });
}

/**
 * R2: drop link-dominated paragraph clusters (list/paragraph TOCs). A run of
 * 3+ consecutive link-dominated paragraphs is dropped as a table-of-contents
 * block; shorter runs (a stray footnote/reference link) are kept.
 */
function stripTocClusters(blocks: RawBlock[]): RawBlock[] {
  const drop = new Array(blocks.length).fill(false);
  let i = 0;
  while (i < blocks.length) {
    if (!(blocks[i].kind === "paragraph" && blocks[i].linkish)) {
      i++;
      continue;
    }
    let j = i;
    while (j < blocks.length && blocks[j].kind === "paragraph" && blocks[j].linkish) j++;
    if (j - i >= 3) for (let k = i; k < j; k++) drop[k] = true;
    i = j;
  }
  return blocks.filter((_, idx) => !drop[idx]);
}

/** Server-only: extract a clean title + ordered content blocks from arbitrary HTML. */
export function htmlToBlocks(html: string): ExtractedDoc {
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as Document).parse();
  const contentHtml = article?.content ?? html;

  const { blocks: raw, firstH1 } = collectRawBlocks(contentHtml);
  const kept = stripTocClusters(stripHeadingCruft(raw));
  const blocks: Block[] = kept.map((b) =>
    b.kind === "heading"
      ? { kind: "heading", level: b.level, text: b.text }
      : { kind: "paragraph", text: b.text },
  );

  const rawTitle = article?.title ?? firstH1;
  return { title: rawTitle ? cleanTitle(rawTitle) : undefined, blocks };
}

export interface ExtractedText {
  title?: string;
  text: string;
  headingLevels: (number | null)[];
}

/** Server-only: extract clean title + immutable source text + heading levels. */
export function htmlToSource(html: string): ExtractedText {
  const { title, blocks } = htmlToBlocks(html);
  const { text, headingLevels } = blocksToSource(blocks);
  return { title, text, headingLevels };
}
