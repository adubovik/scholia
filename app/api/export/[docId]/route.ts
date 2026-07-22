import { getDocument } from "@/lib/data/documents";
import { numberSections } from "@/lib/tree/number";
import { toMarkdown, filenameStem } from "@/lib/export/markdown";

/**
 * Markdown export. A Route Handler rather than a server-computed string on the
 * reading page: the markdown is only wanted on click, and Content-Disposition
 * gives the download its filename for free. getDocument scopes to the owner.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const data = await getDocument(docId);
  if (!data || !data.source) return new Response("Not found", { status: 404 });

  const md = toMarkdown(data.doc.title, data.tree, numberSections(data.tree).byId);
  const stem = filenameStem(data.doc.title);
  // Untrusted title in a header: the ASCII fallback drops anything non-printable
  // (header injection), and filename* carries the real name.
  const ascii = stem.replace(/[^\x20-\x7e]/g, "_");
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ascii}.md"; filename*=UTF-8''${encodeURIComponent(stem)}.md`,
    },
  });
}
