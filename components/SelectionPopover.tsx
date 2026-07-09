"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, type Color } from "@/lib/annotations/types";
import { rangeToOffsets, type SourceRange } from "@/lib/annotations/offsets";
import { createInlineAnnotation } from "@/lib/actions/annotations";

export function SelectionPopover({ documentId, rootId }: { documentId: string; rootId: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const pending = useRef<SourceRange | null>(null);

  useEffect(() => {
    function onMouseUp() {
      const root = document.getElementById(rootId);
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0) {
        setPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const mapped = rangeToOffsets(range, root);
      if (!mapped) {
        setPos(null);
        pending.current = null;
        return;
      }
      const rect = range.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0 };
      pending.current = mapped;
      setPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [rootId]);

  async function pick(color: Color) {
    if (!pending.current) return;
    await createInlineAnnotation({ documentId, ...pending.current, color });
    window.getSelection()?.removeAllRanges();
    pending.current = null;
    setPos(null);
  }

  if (!pos) return null;
  return (
    <div
      className="selection-popover"
      style={{ position: "fixed", left: pos.x, top: pos.y, transform: "translate(-50%, -100%)" }}
    >
      {COLORS.map((c) => (
        <button
          key={c}
          className="swatch"
          aria-label={`Highlight ${c}`}
          style={{ background: `var(--hl-${c})` }}
          onMouseDown={(e) => e.preventDefault()} // keep the text selection alive through the click
          onClick={() => pick(c)}
        />
      ))}
    </div>
  );
}
