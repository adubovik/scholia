"use client";

import { indentNode, outdentNode, moveNodeUp, moveNodeDown } from "@/lib/actions/tree";

export function TreeEditControls({
  nodeId,
  canEdit,
  hasNote,
  onOpenNote,
}: {
  nodeId: string;
  canEdit: boolean;
  hasNote: boolean;
  onOpenNote: () => void;
}) {
  return (
    <span className="tree-controls">
      <button
        className={hasNote ? "glyph note-pencil note-pencil--set" : "glyph note-pencil"}
        aria-label={hasNote ? "Note" : "Add note"}
        onClick={onOpenNote}
      >
        ✎
      </button>
      {canEdit && (
        <span className="tree-controls-grid">
          <button className="glyph" aria-label="Move up" onClick={() => moveNodeUp(nodeId)}>↑</button>
          <button className="glyph" aria-label="Move down" onClick={() => moveNodeDown(nodeId)}>↓</button>
          <button className="glyph" aria-label="Outdent" onClick={() => outdentNode(nodeId)}>⇤</button>
          <button className="glyph" aria-label="Indent" onClick={() => indentNode(nodeId)}>⇥</button>
        </span>
      )}
    </span>
  );
}
