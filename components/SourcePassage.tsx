"use client";

import type { ReactNode } from "react";
import { splitSpans, type Segment } from "@/lib/annotations/spans";
import type { InlineAnnotationView } from "@/lib/annotations/types";
import { useNotesActions, useActiveAnnInSet } from "./NotesContext";

/** One highlighted segment. Isolated so it can subscribe to the active-selection
 * store on its own — when it becomes the selected highlight it fills its background
 * with that annotation's colour (item 9); otherwise it's a bottom underline. */
function HlSpan({ seg, sourceId, nodeId }: { seg: Segment; sourceId: string; nodeId: string }) {
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

  return (
    <p className="reading-p">
      {prefix}
      {segments.map((seg) =>
        seg.annotations.length === 0 ? (
          <span key={seg.charStart} data-source-id={sourceId} data-char-start={seg.charStart}>
            {seg.text}
          </span>
        ) : (
          <HlSpan key={seg.charStart} seg={seg} sourceId={sourceId} nodeId={nodeId} />
        ),
      )}
    </p>
  );
}
