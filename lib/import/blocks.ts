import type { Block } from "./html";

/**
 * Serialize ordered blocks into the immutable source text plus a per-paragraph
 * heading-level array. Blocks are joined with a blank line, and any blank-line
 * run *inside* a block is collapsed to a single newline so that each block maps
 * to exactly one `paragraphize()` paragraph (keeping headingLevels aligned).
 */
export function blocksToSource(blocks: Block[]): {
  text: string;
  headingLevels: (number | null)[];
} {
  // The real extraction pipeline (collectRawBlocks) already strips newlines; this is a safety net for synthetic Block[] (e.g., tests).
  const pieces = blocks.map((b) => b.text.replace(/\n[ \t]*\n+/g, "\n").trim());
  return {
    text: pieces.join("\n\n"),
    headingLevels: blocks.map((b) => (b.kind === "heading" ? b.level : null)),
  };
}
