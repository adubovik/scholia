"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, type Color } from "@/lib/annotations/types";
import { rangeToOffsets, type SourceRange } from "@/lib/annotations/offsets";
import { createInlineAnnotation } from "@/lib/actions/annotations";
import { useNotesActions } from "./NotesContext";

export function SelectionPopover({ documentId, rootId }: { documentId: string; rootId: string }) {
  const { openAnnotation } = useNotesActions();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const pending = useRef<(SourceRange & { nodeId: string | null }) | null>(null);

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
      // The node the selection lives in — so the new highlight can emboss its block.
      const anchor = range.commonAncestorContainer;
      const el = anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement;
      const nodeId = el?.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null;
      const rect = range.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0 };
      pending.current = { ...mapped, nodeId };
      setPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [rootId]);

  async function pick(color: Color) {
    if (!pending.current) return;
    const { nodeId, ...range } = pending.current;
    const id = await createInlineAnnotation({ documentId, ...range, color });
    window.getSelection()?.removeAllRanges();
    pending.current = null;
    setPos(null);
    // Open the drawer on the new highlight + mark it (and its block) active, so the
    // just-created annotation is visibly selected — matching the node-note flow.
    openAnnotation(id, nodeId);
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
