import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, sources, paragraphs, nodes, nodeSourceRanges, inlineAnnotations } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { buildTree } from "@/lib/tree/build";
import type { Color, InlineAnnotationView } from "@/lib/annotations/types";

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
  // M3: annotations are scoped to the primary source only; M4 must query all of the document's sources.
  const annRows = source
    ? await db
        .select()
        .from(inlineAnnotations)
        .where(eq(inlineAnnotations.sourceId, source.id))
        .orderBy(inlineAnnotations.createdAt) // oldest→newest: newest is the "top" underline
    : [];
  const annViews: InlineAnnotationView[] = annRows.map((a) => ({
    id: a.id,
    startOffset: a.startOffset,
    endOffset: a.endOffset,
    color: a.color as Color,
    note: a.note,
    tags: a.tags,
    authorId: a.authorId,
  }));
  const tree = source
    ? buildTree(
        nodeRows,
        rangeRows.map((r) => ({ nodeId: r.nodeId, sourceId: r.sourceId, startOffset: r.startOffset, endOffset: r.endOffset })),
        source.text,
        annViews,
      )
    : [];

  return { doc, source, paragraphs: paras, tree };
}
