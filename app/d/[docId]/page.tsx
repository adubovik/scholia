import { notFound } from "next/navigation";
import { getDocument, listDocuments } from "@/lib/data/documents";
import { requireMember, canCreateInvites } from "@/lib/auth/access";
import { listMyInvites } from "@/lib/data/invites";
import { ReadingSurface } from "@/components/ReadingSurface";

export default async function DocumentPage({ params }: { params: Promise<{ docId: string }> }) {
  const user = await requireMember(); // invite-only gate; getDocument still scopes to owner
  const { docId } = await params;
  const data = await getDocument(docId);
  if (!data || !data.source) notFound();

  // The reading screen carries its own library + invite chrome (left drawer,
  // doc-info), so fetch the catalog alongside the document. Both are owner-scoped.
  const canInvite = canCreateInvites(user);
  const [docs, invites] = await Promise.all([
    listDocuments(),
    canInvite ? listMyInvites(user.id) : Promise.resolve([]),
  ]);

  // M2: only the owner can read (getDocument gates on owner_id), so canEdit is true.
  return (
    <ReadingSurface
      document={{
        title: data.doc.title,
        author: data.doc.author,
        sourceUrl: data.source.url,
        tree: data.tree,
        documentId: data.doc.id,
        createdAt: data.doc.createdAt.toISOString(),
        updatedAt: data.doc.updatedAt.toISOString(),
      }}
      canEdit
      docs={docs.map((d) => ({
        id: d.id,
        title: d.title,
        author: d.author,
        nodeCount: d.nodeCount,
        highlightCount: d.highlightCount,
        noteCount: d.noteCount,
      }))}
      canInvite={canInvite}
      invites={invites}
    />
  );
}
