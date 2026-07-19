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
