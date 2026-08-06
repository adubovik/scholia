import type { TreeNode } from "./build";

/**
 * Compound id paths for the in-prose identifier. Each node has TWO forms:
 *  - `full`  = ancestor aliases + own full id, e.g. `IV.Prop.LXI` (rule 2: ancestors
 *              contribute their alias, the node itself its full id).
 *  - `short` = the node's own full id alone, e.g. `LXI` (rule 1).
 * A node's own segment is its `label` (the id derived from its text) or, when it has
 * none (legacy/flat docs, folded body prose), its 1-based position — so a doc with no
 * ids reproduces the old positional numbering (`2.1`) exactly. `alias ?? label ?? pos`
 * is the token ancestors lend down. The Display-settings toggle picks full vs short.
 */
export function idPaths(tree: TreeNode[]): {
  full: Map<string, string>;
  short: Map<string, string>;
} {
  const full = new Map<string, string>();
  const short = new Map<string, string>();
  const walk = (nodes: TreeNode[], aliasPrefix: string[]) => {
    nodes.forEach((n, i) => {
      const seg = n.label ?? String(i + 1); // own full id (positional when unlabeled)
      const aliasSeg = n.alias ?? seg; // token this node lends to its descendants
      full.set(n.id, [...aliasPrefix, seg].join("."));
      short.set(n.id, seg);
      walk(n.children, [...aliasPrefix, aliasSeg]);
    });
  };
  walk(tree, []);
  return { full, short };
}

