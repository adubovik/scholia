import { NodeSection } from "./NodeSection";
import type { TreeNode } from "@/lib/tree/build";

export function ReadingSurface({
  title, tree, canEdit,
}: { title: string; tree: TreeNode[]; canEdit: boolean }) {
  return (
    <article className="reading">
      <h1 className="reading-title">{title}</h1>
      {tree.map((node) => (
        <NodeSection key={node.id} node={node} depth={0} canEdit={canEdit} />
      ))}
    </article>
  );
}
