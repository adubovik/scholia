"use client";

import type { ReactNode } from "react";
import { splitSpans, type Segment } from "@/lib/annotations/spans";
import type { InlineAnnotationView } from "@/lib/annotations/types";
import { useNotesActions, useActiveAnnInSet } from "./NotesContext";
import { GlyphMarker } from "./GlyphPill";
import { glyphsInTags } from "@/lib/annotations/glyphs";

/** One highlighted segment. Isolated so it can subscribe to the active-selection
 * store on its own — when it becomes the selected highlight it fills its background
 * with that annotation's colour (item 9); otherwise it's a bottom underline.
 * `markers` are the glyph pills for annotations that START at this segment; rendered
 * as absolutely-positioned first children so they float above the highlight's top-left
 * without ever reflowing the prose. */
function HlSpan({
  seg,
  sourceId,
  nodeId,
  markers,
}: {
  seg: Segment;
  sourceId: string;
  nodeId: string;
  markers: InlineAnnotationView[];
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
      className="hl"
      data-source-id={sourceId}
      data-char-start={seg.charStart}
      data-ann-id={ids.join(" ")}
      style={{
        borderBottom: `2px solid var(--hl-${top.color})`,
        background: fill ? `var(--hl-${fill})` : undefined,
        boxShadow: boxShadow || undefined,
      }}
      onClick={() => openAnnotation(top.id, nodeId)}
    >
      {markers.map((a) => (
        <GlyphMarker key={a.id} glyphs={glyphsInTags(a.tags)} />
      ))}
      {seg.text}
    </span>
  );
}

export function SourcePassage({
  text,
  sourceId,
  nodeId,
  startOffset,
  annotations,
  prefix,
}: {
  text: string;
  sourceId: string;
  nodeId: string;
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
      {segments.map((seg) =>
        seg.annotations.length === 0 ? (
          <span key={seg.charStart} data-source-id={sourceId} data-char-start={seg.charStart}>
            {seg.text}
          </span>
        ) : (
          <HlSpan
            key={seg.charStart}
            seg={seg}
            sourceId={sourceId}
            nodeId={nodeId}
            markers={markersByStart.get(seg.charStart) ?? []}
          />
        ),
      )}
    </p>
  );
}
