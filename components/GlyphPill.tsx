"use client";

import { GLYPHS, GLYPH_META, orderGlyphs } from "@/lib/annotations/glyphs";

// The segmented pill — one visual primitive, three modes. A capsule with a hairline
// border and equal square cells split by 1px dividers; each glyph in its own colour.
// A single-cell pill renders as a clean circle (square cell + fully-rounded container).

/** Read-only (reading markers + card): only the enabled glyphs, each in its colour. */
export function GlyphPill({ glyphs, className }: { glyphs: string[]; className?: string }) {
  const shown = orderGlyphs(glyphs);
  if (shown.length === 0) return null;
  return (
    <span className={className ? `glyph-pill ${className}` : "glyph-pill"} aria-hidden>
      {shown.map((g) => (
        <span key={g} className="glyph-cell" data-glyph={g} style={{ color: GLYPH_META[g].color }}>
          {GLYPH_META[g].char}
        </span>
      ))}
    </span>
  );
}

/** Interactive (filter header + note editor): all three sections; an active/enabled
 * cell fills with its colour (white glyph), the rest are outline (glyph in colour). */
export function GlyphToggle({
  active,
  onToggle,
}: {
  active: string[];
  onToggle: (glyph: string) => void;
}) {
  return (
    <span className="glyph-pill glyph-pill--toggle">
      {GLYPHS.map((g) => {
        const on = active.includes(g);
        return (
          <button
            key={g}
            type="button"
            data-glyph={g}
            className={on ? "glyph-cell glyph-cell--on" : "glyph-cell"}
            style={on ? { background: GLYPH_META[g].color } : { color: GLYPH_META[g].color }}
            aria-pressed={on}
            aria-label={GLYPH_META[g].label}
            onClick={() => onToggle(g)}
          >
            {GLYPH_META[g].char}
          </button>
        );
      })}
    </span>
  );
}
