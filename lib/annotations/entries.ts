import type { TreeNode } from "@/lib/tree/build";
import type { Color } from "@/lib/annotations/types";

/** One annotation flattened for the Notes drawer, carrying its node context. */
export interface NoteEntry {
  id: string;
  kind: "inline" | "node";
  nodeId: string;
  nodeLabel: string | null;
  nodeTitle: string | null;
  color: Color | null; // inline only
  snippet: string; // inline only — the highlighted text
  note: string | null;
  tags: string[];
  createdAt: string; // ISO
}

/**
 * Document-order list of every annotation. Per node we emit its node note first
 * (the "whole passage" comment), then its inline highlights sorted by position —
 * matching the reading order a highlight appears in the prose. This is the order
 * the drawer scrolls through and the count shown in the header.
 */
export function flattenEntries(tree: TreeNode[]): NoteEntry[] {
  const out: NoteEntry[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.nodeAnnotation) {
        out.push({
          id: n.nodeAnnotation.id,
          kind: "node",
          nodeId: n.id,
          nodeLabel: n.label,
          nodeTitle: n.title,
          color: null,
          snippet: "",
          note: n.nodeAnnotation.note,
          tags: n.nodeAnnotation.tags,
          createdAt: n.nodeAnnotation.createdAt,
        });
      }
      for (const a of [...n.annotations].sort((x, y) => x.startOffset - y.startOffset)) {
        const s = a.startOffset - n.startOffset;
        const e = a.endOffset - n.startOffset;
        out.push({
          id: a.id,
          kind: "inline",
          nodeId: n.id,
          nodeLabel: n.label,
          nodeTitle: n.title,
          color: a.color,
          snippet: n.text.slice(Math.max(0, s), Math.max(0, e)),
          note: a.note,
          tags: a.tags,
          createdAt: a.createdAt,
        });
      }
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}
