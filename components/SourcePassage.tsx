"use client";

import { splitSpans } from "@/lib/annotations/spans";
import type { InlineAnnotationView } from "@/lib/annotations/types";

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
}) {
  const segments = splitSpans(text, startOffset, annotations);
  return (
    <p className="reading-p">
      {segments.map((seg, i) => {
        if (seg.annotations.length === 0) {
          return (
            <span key={i} data-source-id={sourceId} data-char-start={seg.charStart}>
              {seg.text}
            </span>
          );
        }
        const top = seg.annotations[seg.annotations.length - 1].color;
        const extra = seg.annotations.slice(0, -1);
        const boxShadow = extra.map((a, j) => `0 ${4 + j * 3}px 0 0 var(--hl-${a.color})`).join(", ");
        return (
          <span
            key={i}
            className="hl"
            data-source-id={sourceId}
            data-char-start={seg.charStart}
            style={{ borderBottom: `2px solid var(--hl-${top})`, boxShadow: boxShadow || undefined }}
          >
            {seg.text}
          </span>
        );
      })}
    </p>
  );
}
