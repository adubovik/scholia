"use client";

import { splitSpans } from "@/lib/annotations/spans";
import type { InlineAnnotationView } from "@/lib/annotations/types";
import { useNotesActions } from "./NotesContext";

export function SourcePassage({
  text,
  sourceId,
  startOffset,
  annotations,
}: {
  text: string;
  sourceId: string;
  startOffset: number;
  annotations: InlineAnnotationView[];
  canEdit?: boolean;
}) {
  const segments = splitSpans(text, startOffset, annotations);
  const { openAnnotation } = useNotesActions();

  return (
    <p className="reading-p">
      {segments.map((seg) => {
        if (seg.annotations.length === 0) {
          return (
            <span key={seg.charStart} data-source-id={sourceId} data-char-start={seg.charStart}>
              {seg.text}
            </span>
          );
        }
        const ids = seg.annotations.map((a) => a.id);
        const top = seg.annotations[seg.annotations.length - 1]; // newest renders on top
        const extra = seg.annotations.slice(0, -1);
        const boxShadow = extra.map((a, j) => `0 ${4 + j * 3}px 0 0 var(--hl-${a.color})`).join(", ");
        return (
          <span
            key={seg.charStart}
            className="hl"
            data-source-id={sourceId}
            data-char-start={seg.charStart}
            data-ann-id={ids.join(" ")}
            style={{ borderBottom: `2px solid var(--hl-${top.color})`, boxShadow: boxShadow || undefined }}
            onClick={() => openAnnotation(top.id)}
          >
            {seg.text}
          </span>
        );
      })}
    </p>
  );
}
