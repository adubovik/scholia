import { NodeSection } from "./NodeSection";
import { SelectionPopover } from "./SelectionPopover";
import { CollapseProvider } from "./CollapseContext";
import { RootMenu } from "./NodeMenu";
import { NotesProvider } from "./NotesContext";
import { NotesDrawer } from "./NotesDrawer";
import { LibraryDrawer, type LibraryDoc } from "./LibraryDrawer";
import { ReadingChrome } from "./ReadingChrome";
import { flattenEntries } from "@/lib/annotations/entries";
import type { InviteView } from "@/lib/data/invites";
import type { TreeNode } from "@/lib/tree/build";

// Every node id in the document — the target of the reading-canvas Collapse/Expand.
const allNodeIds = (nodes: TreeNode[]): string[] =>
  nodes.flatMap((n) => [n.id, ...allNodeIds(n.children)]);

const countNodes = (nodes: TreeNode[]): number =>
  nodes.reduce((n, x) => n + 1 + countNodes(x.children), 0);

export function ReadingSurface({
  title,
  tree,
  canEdit,
  documentId,
  createdAt,
  updatedAt,
  docs,
  currentId,
  canInvite,
  invites,
}: {
  title: string;
  tree: TreeNode[];
  canEdit: boolean;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  docs: LibraryDoc[];
  currentId: string;
  canInvite: boolean;
  invites: InviteView[];
}) {
  const entries = flattenEntries(tree);
  const meta = {
    documentId,
    title,
    createdAt,
    updatedAt,
    nodeCount: countNodes(tree),
    highlightCount: entries.filter((e) => e.kind === "inline").length,
    noteCount: entries.filter((e) => e.kind === "node").length,
  };

  return (
    <NotesProvider entries={entries}>
      <LibraryDrawer docs={docs} currentId={currentId} canInvite={canInvite} invites={invites} />

      <ReadingChrome title={title} meta={meta}>
        <article id="reading-root" className="reading">
          <CollapseProvider>
            <RootMenu allIds={allNodeIds(tree)}>
              {tree.map((node) => (
                <NodeSection key={node.id} node={node} depth={0} canEdit={canEdit} documentId={documentId} />
              ))}
            </RootMenu>
          </CollapseProvider>
          <SelectionPopover documentId={documentId} rootId="reading-root" />
        </article>
      </ReadingChrome>

      <NotesDrawer documentId={documentId} />
    </NotesProvider>
  );
}
