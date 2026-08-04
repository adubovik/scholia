"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { splitSpans, type Segment } from "@/lib/annotations/spans";
import type { InlineAnnotationView } from "@/lib/annotations/types";
import { useNotesActions, useActiveAnnInSet } from "./NotesContext";
import { GlyphPill } from "./GlyphPill";
import { glyphsInTags } from "@/lib/annotations/glyphs";

/** One highlighted segment. Isolated so it can subscribe to the active-selection
 * store on its own — when it becomes the selected highlight it fills its background
 * with that annotation's colour (item 9). Its resting look (filled tint vs. bottom
 * underline) is driven by the `data-hl-mode` display pref via CSS; this component
 * only supplies the segment colour as `--seg-hl`. Any glyph pills for annotations
 * starting here are rendered inline just BEFORE this span by SourcePassage. */
function HlSpan({
  seg,
  sourceId,
}: {
  seg: Segment;
  sourceId: string;
}) {
  const { openAnnotation } = useNotesActions();
  const ids = seg.annotations.map((a) => a.id);
  const activeId = useActiveAnnInSet(ids); // this segment's active ann, or null
  const top = seg.annotations[seg.annotations.length - 1]; // newest renders on top
  const extra = seg.annotations.slice(0, -1);
  const boxShadow = extra.map((a, j) => `0 ${4 + j * 3}px 0 0 var(--hl-${a.color})`).join(", ");
  const fill = activeId ? seg.annotations.find((a) => a.id === activeId)?.color : null;

  return (
    <span
      className={activeId ? "hl hl--selected" : "hl"}
      data-source-id={sourceId}
      data-char-start={seg.charStart}
      data-ann-id={ids.join(" ")}
      style={{
        "--seg-hl": `var(--hl-${top.color})`,
        background: fill ? `var(--hl-${fill})` : undefined,
        boxShadow: boxShadow || undefined,
      } as CSSProperties}
      onClick={() => openAnnotation(top.id, null)}
    >
      {seg.text}
    </span>
  );
}

export function SourcePassage({
  text,
  sourceId,
  startOffset,
  annotations,
  prefix,
}: {
  text: string;
  sourceId: string;
  nodeId: string; // owning node id — kept in the contract (passed by NodeSection); unused since highlight clicks select the highlight only, not the node
  startOffset: number;
  annotations: InlineAnnotationView[];
  canEdit?: boolean;
  prefix?: ReactNode; // run-in section number, rendered inside the paragraph flow
}) {
  const segments = splitSpans(text, startOffset, annotations);

  // One glyph marker per annotation that carries a ":glyph" tag, keyed by its clamped
  // start offset (always a segment boundary). splitSpans only carries {id,color}, so
  // the glyphs are read from the full annotations here and attached to that
  // annotation's first (start) segment.
  const markersByStart = new Map<number, InlineAnnotationView[]>();
  for (const a of annotations) {
    if (glyphsInTags(a.tags).length === 0) continue;
    const start = Math.max(a.startOffset, startOffset);
    (markersByStart.get(start) ?? markersByStart.set(start, []).get(start)!).push(a);
  }

  return (
    <p className="reading-p">
      {prefix}
      {segments.map((seg) => {
        if (seg.annotations.length === 0) {
          return (
            <span key={seg.charStart} data-source-id={sourceId} data-char-start={seg.charStart}>
              {seg.text}
            </span>
          );
        }
        // Glyphs for annotations starting at this segment render inline, right before
        // the highlight — "(?) text" — instead of floating above the corner (item 5).
        const marks = markersByStart.get(seg.charStart) ?? [];
        return (
          <Fragment key={seg.charStart}>
            {marks.map((a) => (
              <GlyphPill key={a.id} glyphs={glyphsInTags(a.tags)} className="glyph-pill--inline" />
            ))}
            <HlSpan seg={seg} sourceId={sourceId} />
          </Fragment>
        );
      })}
    </p>
  );
}
