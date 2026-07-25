import { NodeSection } from "./NodeSection";
import { SelectionPopover } from "./SelectionPopover";
import { CollapseProvider } from "./CollapseContext";
import { RootMenu } from "./NodeMenu";
import { NotesProvider } from "./NotesContext";
import { NotesDrawer } from "./NotesDrawer";
import { LibraryDrawer, type LibraryDoc } from "./LibraryDrawer";
import { ReadingChrome } from "./ReadingChrome";
import { flattenEntries } from "@/lib/annotations/entries";
import { numberSections } from "@/lib/tree/number";
import type { InviteView } from "@/lib/data/invites";
import type { TreeNode } from "@/lib/tree/build";

// Every node id in the document — the target of the reading-canvas Collapse/Expand.
const allNodeIds = (nodes: TreeNode[]): string[] =>
  nodes.flatMap((n) => [n.id, ...allNodeIds(n.children)]);

const countNodes = (nodes: TreeNode[]): number =>
  nodes.reduce((n, x) => n + 1 + countNodes(x.children), 0);

/** The document being read. Absent = the home surface: library open, no prose. */
export interface ReadingDoc {
  title: string;
  author: string | null;
  sourceUrl: string | null;
  tree: TreeNode[];
  documentId: string;
  createdAt: string;
  updatedAt: string;
}

export function ReadingSurface({
  document,
  canEdit,
  docs,
  canInvite,
  invites,
}: {
  document?: ReadingDoc;
  canEdit: boolean;
  docs: LibraryDoc[];
  canInvite: boolean;
  invites: InviteView[];
}) {
  const tree = document?.tree ?? [];
  const { byId: numbers, byNumber } = numberSections(tree);
  const sections = Object.fromEntries(byNumber); // section number → node id, for §links
  const entries = flattenEntries(tree, numbers);
  const meta = document && {
    documentId: document.documentId,
    title: document.title,
    author: document.author,
    sourceUrl: document.sourceUrl,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    nodeCount: countNodes(tree),
    highlightCount: entries.filter((e) => e.kind === "inline").length,
    noteCount: entries.filter((e) => e.kind === "node").length,
  };

  return (
    <NotesProvider entries={entries} sections={sections} initialLeftOpen={!document}>
      <LibraryDrawer docs={docs} currentId={document?.documentId ?? null} canInvite={canInvite} invites={invites} />

      {document ? (
        <ReadingChrome title={document.title} meta={meta}>
          <article id="reading-root" className="reading">
            <CollapseProvider>
              <RootMenu allIds={allNodeIds(tree)}>
                {tree.map((node) => (
                  <NodeSection key={node.id} node={node} depth={0} canEdit={canEdit} documentId={document.documentId} numbers={numbers} />
                ))}
              </RootMenu>
            </CollapseProvider>
            <SelectionPopover documentId={document.documentId} rootId="reading-root" />
          </article>
        </ReadingChrome>
      ) : (
        <ReadingChrome>
          <div className="reading-blank">
            <span className="reading-blank-fleuron" aria-hidden>❦</span>
            <p className="reading-blank-line">No text open.</p>
            <p className="reading-blank-hint">Pick a text from the library, or add a new one.</p>
          </div>
        </ReadingChrome>
      )}

      {document && <NotesDrawer documentId={document.documentId} />}
    </NotesProvider>
  );
}
