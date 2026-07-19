import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, sources, paragraphs, nodes, nodeSourceRanges, inlineAnnotations, nodeAnnotations } from "@/lib/db/schema";
import { requireUser, getUserId } from "@/lib/auth/current-user";
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
  // Read path: only need the id to scope the query. Skip requireUser's
  // upsert-on-every-call write — the owner's row already exists, and reads
  // shouldn't pay a DB write round-trip. (Mutations still upsert; see requireUser.)
  const userId = await getUserId();
  if (!userId) return null;
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.ownerId, userId)));
  if (!doc) return null;

  // These four depend only on doc.id, so fire them concurrently. neon-http issues
  // one HTTP round-trip per query; awaited one-at-a-time this was the bulk of a
  // ~950ms flat render cost (re-paid on every revalidatePath). Fan out instead.
  const [src, nodeRows, nodeAnnRows] = await Promise.all([
    db.select().from(sources).where(eq(sources.documentId, doc.id)).orderBy(sources.position),
    db.select().from(nodes).where(eq(nodes.documentId, doc.id)).orderBy(nodes.position),
    db.select().from(nodeAnnotations).where(eq(nodeAnnotations.documentId, doc.id)),
  ]);
  const source = src[0] ?? null;

  // These three need source.id, so they form a second concurrent wave.
  // M3: annotations are scoped to the primary source only; M4 must query all of the document's sources.
  const [paras, rangeRows, annRows] = source
    ? await Promise.all([
        db.select().from(paragraphs).where(eq(paragraphs.sourceId, source.id)).orderBy(paragraphs.position),
        db.select().from(nodeSourceRanges).where(eq(nodeSourceRanges.sourceId, source.id)),
        db
          .select()
          .from(inlineAnnotations)
          .where(eq(inlineAnnotations.sourceId, source.id))
          .orderBy(inlineAnnotations.createdAt), // oldest→newest: newest is the "top" underline
      ])
    : [[], [], []];
  const annViews: InlineAnnotationView[] = annRows.map((a) => ({
    id: a.id,
    startOffset: a.startOffset,
    endOffset: a.endOffset,
    color: a.color as Color,
    note: a.note,
    tags: a.tags,
    authorId: a.authorId,
    createdAt: a.createdAt.toISOString(),
  }));
  const nodeAnnViews: NodeAnnotationView[] = nodeAnnRows.map((a) => ({
    id: a.id,
    nodeId: a.nodeId,
    note: a.note,
    tags: a.tags,
    authorId: a.authorId,
    createdAt: a.createdAt.toISOString(),
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
