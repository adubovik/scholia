import type { InlineAnnotationView, LayerNoteView, NodeAnnotationView } from "@/lib/annotations/types";

export interface NodeRow {
  id: string;
  parentId: string | null;
  position: number;
  label: string | null;
  alias: string | null;
  title: string | null;
}

export interface NodeRange {
  nodeId: string;
  sourceId: string;
  startOffset: number;
  endOffset: number;
}

export interface TreeNode {
  id: string;
  label: string | null;
  alias: string | null;
  title: string | null;
  text: string;
  sourceId: string;
  startOffset: number;
  annotations: InlineAnnotationView[];
  nodeAnnotation: NodeAnnotationView | null;
  layerNotes: LayerNoteView[]; // this node's text in each alternative layer
  children: TreeNode[];
}

/** Fold flat node rows + source ranges (+ optional annotations) into a nested tree. */
export function buildTree(
  nodes: NodeRow[],
  ranges: NodeRange[],
  sourceText: string,
  annotations: InlineAnnotationView[] = [],
  nodeAnnotations: NodeAnnotationView[] = [],
  layerNotes: LayerNoteView[] = [],
): TreeNode[] {
  const rangeById = new Map(ranges.map((r) => [r.nodeId, r]));
  const nodeAnnById = new Map(nodeAnnotations.map((a) => [a.nodeId, a]));
  const layerNotesByNode = new Map<string, LayerNoteView[]>();
  for (const l of layerNotes) {
    const list = layerNotesByNode.get(l.nodeId);
    if (list) list.push(l);
    else layerNotesByNode.set(l.nodeId, [l]);
  }

  const byId = new Map<string, TreeNode>();
  for (const n of nodes) {
    const r = rangeById.get(n.id);
    const startOffset = r?.startOffset ?? 0;
    const endOffset = r?.endOffset ?? 0;
    const nodeAnns = r
      ? annotations.filter((a) => a.startOffset < endOffset && a.endOffset > startOffset)
      : [];
    byId.set(n.id, {
      id: n.id,
      label: n.label,
      alias: n.alias,
      title: n.title,
      text: r ? sourceText.slice(r.startOffset, r.endOffset) : "",
      sourceId: r?.sourceId ?? "",
      startOffset,
      annotations: nodeAnns,
      nodeAnnotation: nodeAnnById.get(n.id) ?? null,
      layerNotes: layerNotesByNode.get(n.id) ?? [],
      children: [],
    });
  }

  const roots: TreeNode[] = [];
  const positionById = new Map(nodes.map((n) => [n.id, n.position]));
  for (const n of nodes) {
    const tn = byId.get(n.id)!;
    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(tn);
    else roots.push(tn);
  }

  const sortByPos = (a: TreeNode, b: TreeNode) => positionById.get(a.id)! - positionById.get(b.id)!;
  const sortRec = (list: TreeNode[]) => {
    list.sort(sortByPos);
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}
