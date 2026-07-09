import { notFound } from "next/navigation";
import { getDocument } from "@/lib/data/documents";
import { ReadingSurface } from "@/components/ReadingSurface";

export default async function DocumentPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const data = await getDocument(docId);
  if (!data || !data.source) notFound();
  // M2: only the owner can read (getDocument gates on owner_id), so canEdit is true.
  return (
    <main className="page">
      <ReadingSurface title={data.doc.title} tree={data.tree} canEdit documentId={data.doc.id} />
    </main>
  );
}
