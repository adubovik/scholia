import type { TreeNode } from "./build";

/**
 * Hierarchical section numbers derived from tree position: each node's number is
 * its 1-based index path among ancestors ("1", "1.2", "2.1.3"). Returns lookups
 * both ways — byId drives the in-prose identifier + drawer card labels, byNumber
 * powers §cross-reference links back to a node.
 */
export function numberSections(tree: TreeNode[]): {
  byId: Map<string, string>;
  byNumber: Map<string, string>;
} {
  const byId = new Map<string, string>();
  const byNumber = new Map<string, string>();
  const walk = (nodes: TreeNode[], prefix: string) => {
    nodes.forEach((n, i) => {
      const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      byId.set(n.id, num);
      byNumber.set(num, n.id);
      walk(n.children, num);
    });
  };
  walk(tree, "");
  return { byId, byNumber };
}

/**
 * Document order for two section numbers: 1 < 1.1 < 1.10 < 2. Segment-wise and
 * numeric, so "1.10" sorts after "1.2" (string compare would invert them) and a
 * shorter prefix sorts before what it contains ("1" before "1.1").
 *
 * Needed because the drawer has to place an unsaved node-note composer — which
 * has a section number but no entry in the flattened list — at its spot in the
 * feed. Object key order can't stand in for this: numberSections' byNumber has
 * integer-like keys ("1", "2"), which JS hoists ahead of dotted ones.
 */
export function compareSections(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d) return d;
  }
  return 0;
}
