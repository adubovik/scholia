import { splitSpans } from "@/lib/annotations/spans";
import { displayTags, glyphsInTags, GLYPH_META } from "@/lib/annotations/glyphs";
import type { TreeNode } from "@/lib/tree/build";

/**
 * Bold a highlighted run. Strong emphasis can't span a blank line and can't be
 * padded with whitespace (CommonMark flanking rules), so leading/trailing space
 * moves outside the marks and paragraph breaks close and reopen them.
 */
function strong(s: string): string {
  const [, lead, core, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!;
  if (!core) return s;
  return `${lead}**${core.replace(/\n{2,}/g, (br) => `**${br}**`)}**${tail}`;
}

const EMPTY = "{empty}"; // a highlight with no note still gets a numbered entry

const withTags = (note: string | null, tags: string[]) => {
  const body = note?.trim() || EMPTY;
  // Glyph tags (":summary" …) export as their mark char; the rest as #tags.
  const suffix = [
    ...displayTags(tags).map((t) => `#${t}`),
    ...glyphsInTags(tags).map((g) => GLYPH_META[g].char),
  ].join(" ");
  return suffix ? `${body} ${suffix}` : body;
};

/**
 * One block: prose with its highlights bolded and numbered, then the note list.
 * Every highlight is numbered, noted or not — the marker is the anchor for the
 * entry below, and a bare highlight still says "this was worth marking".
 */
function renderNode(node: TreeNode, number: string): string {
  const marked = [...node.annotations].sort((a, b) => a.startOffset - b.startOffset);
  const markerById = new Map(marked.map((a, i) => [a.id, i + 1]));
  const endById = new Map(node.annotations.map((a) => [a.id, a.endOffset]));

  // Bold each maximal run of annotated segments as one unit — marking segment by
  // segment would emit `**a****b**`. A marker is dropped where its annotation
  // ends; markers falling at the run's end sit outside the marks (`**text**(1)`).
  let body = "";
  let run: { text: string; markers: string }[] = [];
  const flush = () => {
    if (!run.length) return;
    const inner = run.map((p, i) => p.text + (i === run.length - 1 ? "" : p.markers)).join("");
    // Trailing space belongs after the marker, so the marker hugs the last word.
    const [, core, tail] = /^([\s\S]*?)(\s*)$/.exec(inner)!;
    body += strong(core) + run[run.length - 1].markers + tail;
    run = [];
  };
  for (const seg of splitSpans(node.text, node.startOffset, node.annotations)) {
    if (seg.annotations.length === 0) {
      flush();
      body += seg.text;
      continue;
    }
    const segEnd = seg.charStart + seg.text.length;
    const markers = seg.annotations
      .filter((a) => endById.get(a.id)! <= segEnd)
      .map((a) => `(${markerById.get(a.id)})`)
      .join("");
    run.push({ text: seg.text, markers });
  }
  flush();

  // Section number over depth-derived heading levels: the number already carries
  // the hierarchy, and a flat `##` keeps deep trees out of `######` territory.
  const parts = [`## ${number}${node.title ? ` — ${node.title}` : ""}`, body.trim()];
  if (marked.length) {
    // `n:` entries, one per paragraph — not a markdown list, so a reply can carry a
    // dotted number (`1.1:`) once inline_annotations grows a parent column. Today
    // every entry is top-level.
    parts.push(["**Inline notes**:", ...marked.map((a) => `${markerById.get(a.id)}: ${withTags(a.note, a.tags)}`)].join("\n\n"));
  }
  if (node.nodeAnnotation) {
    parts.push(`**Block note**: ${withTags(node.nodeAnnotation.note, node.nodeAnnotation.tags)}`);
  }
  return parts.join("\n\n");
}

/**
 * The document as markdown: title, then every annotated block in reading order,
 * each headed by its section number. Blocks carrying no annotation at all are
 * omitted — the export is the commentary, not a copy of the text.
 */
export function toMarkdown(title: string, tree: TreeNode[], numbers: Map<string, string>): string {
  const blocks: string[] = [`# ${title}`];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.annotations.length || n.nodeAnnotation) blocks.push(renderNode(n, numbers.get(n.id) ?? ""));
      walk(n.children);
    }
  };
  walk(tree);
  return blocks.join("\n\n") + "\n";
}

/** Filename stem: keeps non-ASCII letters (the texts are often not English). */
export function filenameStem(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().replace(/ /g, "-") || "document";
}
