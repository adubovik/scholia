/** The three fixed preset marks. Not user-editable, and NOT a separate column:
 * a glyph is just a system tag of the form ":<name>" living in an annotation's
 * `tags`. Adding the tag ":summary" is what turns on the ≡ mark. */
export type Glyph = "summary" | "question" | "insight";
export const GLYPHS: Glyph[] = ["summary", "question", "insight"];

/** Canonical glyph char + colour, used everywhere the pill renders. */
export const GLYPH_META: Record<Glyph, { char: string; color: string; label: string }> = {
  summary: { char: "≡", color: "var(--glyph-summary)", label: "Summary" },
  question: { char: "?", color: "var(--glyph-question)", label: "Question" },
  insight: { char: "!", color: "var(--glyph-insight)", label: "Insight" },
};

const TAG_TO_GLYPH = new Map<string, Glyph>(GLYPHS.map((g) => [`:${g}`, g]));

/** The system-tag form of a glyph (":summary"). */
export const glyphTag = (g: string): string => `:${g}`;

/** Is this tag one of the three preset glyph tags (":summary" etc.)? */
export const isGlyphTag = (tag: string): boolean => TAG_TO_GLYPH.has(tag);

/** The glyphs encoded in a tag list, in canonical (≡ ? !) render order. */
export function glyphsInTags(tags: string[]): Glyph[] {
  return GLYPHS.filter((g) => tags.includes(`:${g}`));
}

/** The normal (#) tags — everything that isn't a preset glyph tag. */
export const displayTags = (tags: string[]): string[] => tags.filter((t) => !isGlyphTag(t));

/** Add or remove a glyph's system tag in a tag list (toggle). */
export function toggleGlyphTag(tags: string[], g: string): string[] {
  const tag = glyphTag(g);
  return tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
}

/** Order + dedupe a list of glyph names — the pill's render order. */
export function orderGlyphs(glyphs: string[]): Glyph[] {
  return GLYPHS.filter((g) => glyphs.includes(g));
}
