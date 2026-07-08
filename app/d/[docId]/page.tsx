import { notFound } from "next/navigation";
import { getDocument } from "@/lib/data/documents";
import { ReadingSurface } from "@/components/ReadingSurface";

export default async function DocumentPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const data = await getDocument(docId);
  if (!data || !data.source) notFound();
  return (
    <main className="page">
      <ReadingSurface
        title={data.doc.title}
        sourceText={data.source.text}
        paragraphs={data.paragraphs.map((p) => ({ charStart: p.charStart, charEnd: p.charEnd }))}
      />
    </main>
  );
}
