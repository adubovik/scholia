import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, sources, paragraphs, nodes, nodeSourceRanges, inlineAnnotations, nodeAnnotations } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { buildTree } from "@/lib/tree/build";
import type { Color, InlineAnnotationView, NodeAnnotationView } from "@/lib/annotations/types";

export async function listDocuments() {
  const user = await requireUser();
  const docs = await db
    .select({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt })
    .from(documents)
    .where(eq(documents.ownerId, user.id))
    .orderBy(desc(documents.updatedAt));
  if (docs.length === 0) return [];

  // Catalog stats per document. nodes / inline_annotations / node_annotations all
  // carry documentId, so each is a single grouped count (no per-doc fan-out),
  // scoped to this owner by joining documents. Run the three concurrently.
  const owned = eq(documents.ownerId, user.id);
  const [nodeRows, highlightRows, noteRows] = await Promise.all([
    db.select({ documentId: nodes.documentId, n: count() })
      .from(nodes).innerJoin(documents, eq(nodes.documentId, documents.id))
      .where(owned).groupBy(nodes.documentId),
    db.select({ documentId: inlineAnnotations.documentId, n: count() })
      .from(inlineAnnotations).innerJoin(documents, eq(inlineAnnotations.documentId, documents.id))
      .where(owned).groupBy(inlineAnnotations.documentId),
    db.select({ documentId: nodeAnnotations.documentId, n: count() })
      .from(nodeAnnotations).innerJoin(documents, eq(nodeAnnotations.documentId, documents.id))
      .where(owned).groupBy(nodeAnnotations.documentId),
  ]);
  const toMap = (rows: { documentId: string; n: number }[]) =>
    new Map(rows.map((r) => [r.documentId, r.n]));
  const nodeCounts = toMap(nodeRows);
  const highlightCounts = toMap(highlightRows);
  const noteCounts = toMap(noteRows);

  return docs.map((d) => ({
    ...d,
    nodeCount: nodeCounts.get(d.id) ?? 0,
    highlightCount: highlightCounts.get(d.id) ?? 0,
    noteCount: noteCounts.get(d.id) ?? 0,
  }));
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
  const nodeAnnRows = await db
    .select()
    .from(nodeAnnotations)
    .where(eq(nodeAnnotations.documentId, doc.id));
  const nodeAnnViews: NodeAnnotationView[] = nodeAnnRows.map((a) => ({
    id: a.id,
    nodeId: a.nodeId,
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
        nodeAnnViews,
      )
    : [];

  return { doc, source, paragraphs: paras, tree };
}
