import { ReadingWorkspace } from "./ReadingWorkspace";
import { type LibraryDoc } from "./LibraryDrawer";
import { flattenEntries } from "@/lib/annotations/entries";
import { numberSections } from "@/lib/tree/number";
import { buildDual } from "@/lib/tree/dual";
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
  const { byId: numbers } = numberSections(tree);
  const entries = flattenEntries(tree, numbers);
  // Annotation-first lens: the annotations arranged along the document's hierarchy,
  // numbered off the reading tree so the two panels agree.
  const dualTree = buildDual(tree, numbers);
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
    <ReadingWorkspace
      reading={{ tree, numbers, entries, allIds: allNodeIds(tree) }}
      dual={{ tree: dualTree }}
      meta={meta ?? undefined}
      title={document?.title}
      documentId={document?.documentId}
      canEdit={canEdit}
      docs={docs}
      currentId={document?.documentId ?? null}
      canInvite={canInvite}
      invites={invites}
      initialLeftOpen={!document}
    />
  );
}
