import { NodeSection } from "./NodeSection";
import { SelectionPopover } from "./SelectionPopover";
import { ReadingSettings } from "./ReadingSettings";
import { CollapseProvider } from "./CollapseContext";
import { RootMenu } from "./NodeMenu";
import type { TreeNode } from "@/lib/tree/build";

// Every node id in the document — the target of the reading-canvas Collapse/Expand.
const allNodeIds = (nodes: TreeNode[]): string[] =>
  nodes.flatMap((n) => [n.id, ...allNodeIds(n.children)]);

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
        <ReadingSettings />
        <h1 className="reading-title">{title}</h1>
        <CollapseProvider>
          <RootMenu allIds={allNodeIds(tree)}>
            {tree.map((node) => (
              <NodeSection key={node.id} node={node} depth={0} canEdit={canEdit} documentId={documentId} />
            ))}
          </RootMenu>
        </CollapseProvider>
      </article>
      <SelectionPopover documentId={documentId} rootId="reading-root" />
    </>
  );
}
