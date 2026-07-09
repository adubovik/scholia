"use client";

import { useState } from "react";
import { splitSpans } from "@/lib/annotations/spans";
import type { InlineAnnotationView } from "@/lib/annotations/types";
import { InlineNote } from "./InlineNote";

export function SourcePassage({
  text,
  sourceId,
  startOffset,
  annotations,
  canEdit,
}: {
  text: string;
  sourceId: string;
  startOffset: number;
  annotations: InlineAnnotationView[];
  canEdit: boolean;
}) {
  const segments = splitSpans(text, startOffset, annotations);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picker, setPicker] = useState<string[] | null>(null); // annotation ids to choose from

  const byId = new Map(annotations.map((a) => [a.id, a]));

  function onSpanClick(ids: string[]) {
    setPicker(null);
    if (ids.length === 1) setOpenId(ids[0]);
    else { setOpenId(null); setPicker(ids); }
  }

  const open = openId ? byId.get(openId) : undefined;

  return (
    <>
      <p className="reading-p">
        {segments.map((seg) => {
          if (seg.annotations.length === 0) {
            return (
              <span key={seg.charStart} data-source-id={sourceId} data-char-start={seg.charStart}>
                {seg.text}
              </span>
            );
          }
          const top = seg.annotations[seg.annotations.length - 1].color;
          const extra = seg.annotations.slice(0, -1);
          const boxShadow = extra.map((a, j) => `0 ${4 + j * 3}px 0 0 var(--hl-${a.color})`).join(", ");
          const ids = seg.annotations.map((a) => a.id);
          return (
            <span
              key={seg.charStart}
              className="hl"
              data-source-id={sourceId}
              data-char-start={seg.charStart}
              style={{ borderBottom: `2px solid var(--hl-${top})`, boxShadow: boxShadow || undefined }}
              onClick={() => onSpanClick(ids)}
            >
              {seg.text}
            </span>
          );
        })}
      </p>

      {picker && (
        <div className="note-picker">
          <span className="muted">Overlapping notes:</span>
          {picker.map((id) => {
            const a = byId.get(id)!;
            return (
              <button key={id} className="link-btn" onClick={() => { setOpenId(id); setPicker(null); }}>
                {a.note ? a.note.slice(0, 24) : `(${a.color} highlight)`}
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <InlineNote key={open.id} annotation={open} canEdit={canEdit} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}
