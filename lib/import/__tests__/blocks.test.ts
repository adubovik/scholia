import { describe, it, expect } from "vitest";
import { blocksToSource } from "@/lib/import/blocks";
import { normalizeText, paragraphize } from "@/lib/import/paragraphs";
import type { Block } from "@/lib/import/html";

const blocks: Block[] = [
  { kind: "heading", level: 2, text: "CHAPTER I" },
  { kind: "paragraph", text: "First paragraph of prose." },
  { kind: "paragraph", text: "Second paragraph\nwith a soft line break." },
  { kind: "heading", level: 3, text: "A subsection" },
  { kind: "paragraph", text: "Nested prose." },
];

describe("blocksToSource", () => {
  it("emits one paragraph per block, aligned to headingLevels", () => {
    const { text, headingLevels } = blocksToSource(blocks);
    const paras = paragraphize(normalizeText(text));
    expect(paras).toHaveLength(blocks.length);
    expect(headingLevels).toEqual([2, null, null, 3, null]);
  });

  it("keeps offsets exact: text.slice(start,end) round-trips each paragraph", () => {
    const { text } = blocksToSource(blocks);
    const norm = normalizeText(text);
    for (const p of paragraphize(norm)) {
      expect(norm.slice(p.start, p.end)).toBe(p.text);
    }
  });

  it("collapses any internal blank line so a block stays a single paragraph", () => {
    const { text, headingLevels } = blocksToSource([
      { kind: "paragraph", text: "line one\n\nline two" },
    ]);
    expect(paragraphize(normalizeText(text))).toHaveLength(1);
    expect(headingLevels).toEqual([null]);
  });
});
