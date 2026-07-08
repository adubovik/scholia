import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, sources, paragraphs, nodes, nodeSourceRanges } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { buildTree } from "@/lib/tree/build";

export async function listDocuments() {
  const user = await requireUser();
  return db
    .select({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt })
    .from(documents)
    .where(eq(documents.ownerId, user.id))
    .orderBy(desc(documents.updatedAt));
}

export async function getDocument(docId: string) {
  const user = await requireUser();
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.ownerId, user.id)));
  if (!doc) return null;

  const src = await db
    .select().from(sources).where(eq(sources.documentId, doc.id)).orderBy(sources.position);
  const source = src[0] ?? null;
  const paras = source
    ? await db.select().from(paragraphs).where(eq(paragraphs.sourceId, source.id)).orderBy(paragraphs.position)
    : [];

  const nodeRows = await db.select().from(nodes).where(eq(nodes.documentId, doc.id)).orderBy(nodes.position);
  const rangeRows = source
    ? await db.select().from(nodeSourceRanges).where(eq(nodeSourceRanges.sourceId, source.id))
    : [];
  const tree = source
    ? buildTree(
        nodeRows,
        rangeRows.map((r) => ({ nodeId: r.nodeId, startOffset: r.startOffset, endOffset: r.endOffset })),
        source.text,
      )
    : [];

  return { doc, source, paragraphs: paras, tree };
}
