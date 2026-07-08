export interface NodeRow {
  id: string;
  parentId: string | null;
  position: number;
  label: string | null;
  title: string | null;
}

export interface NodeRange {
  nodeId: string;
  startOffset: number;
  endOffset: number;
}

export interface TreeNode {
  id: string;
  label: string | null;
  title: string | null;
  text: string;
  children: TreeNode[];
}

/** Fold flat node rows + their source ranges into an ordered nested tree. */
export function buildTree(nodes: NodeRow[], ranges: NodeRange[], sourceText: string): TreeNode[] {
  const textById = new Map<string, string>();
  for (const r of ranges) textById.set(r.nodeId, sourceText.slice(r.startOffset, r.endOffset));

  const byId = new Map<string, TreeNode>();
  for (const n of nodes) {
    byId.set(n.id, { id: n.id, label: n.label, title: n.title, text: textById.get(n.id) ?? "", children: [] });
  }

  const roots: TreeNode[] = [];
  const positionById = new Map(nodes.map((n) => [n.id, n.position]));
  for (const n of nodes) {
    const tn = byId.get(n.id)!;
    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(tn);
    else roots.push(tn);
  }

  const sortByPos = (a: TreeNode, b: TreeNode) => (positionById.get(a.id)! - positionById.get(b.id)!);
  const sortRec = (list: TreeNode[]) => {
    list.sort(sortByPos);
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}
