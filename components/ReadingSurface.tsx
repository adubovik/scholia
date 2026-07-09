import { NodeSection } from "./NodeSection";
import { SelectionPopover } from "./SelectionPopover";
import type { TreeNode } from "@/lib/tree/build";

export function ReadingSurface({
  title,
  tree,
  canEdit,
  documentId,
}: {
  title: string;
  tree: TreeNode[];
  canEdit: boolean;
  documentId: string;
}) {
  return (
    <>
      <article id="reading-root" className="reading">
        <h1 className="reading-title">{title}</h1>
        {tree.map((node) => (
          <NodeSection key={node.id} node={node} depth={0} canEdit={canEdit} />
        ))}
      </article>
      <SelectionPopover documentId={documentId} rootId="reading-root" />
    </>
  );
}
