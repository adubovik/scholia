"use client";

import { indentNode, outdentNode, moveNodeUp, moveNodeDown } from "@/lib/actions/tree";

export function TreeEditControls({ nodeId }: { nodeId: string }) {
  return (
    <span className="tree-controls">
      <button className="glyph" aria-label="Move up" onClick={() => moveNodeUp(nodeId)}>↑</button>
      <button className="glyph" aria-label="Move down" onClick={() => moveNodeDown(nodeId)}>↓</button>
      <button className="glyph" aria-label="Outdent" onClick={() => outdentNode(nodeId)}>⇤</button>
      <button className="glyph" aria-label="Indent" onClick={() => indentNode(nodeId)}>⇥</button>
    </span>
  );
}
