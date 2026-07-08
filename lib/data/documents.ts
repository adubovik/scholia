import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, sources, paragraphs } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";

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
    .select()
    .from(sources)
    .where(eq(sources.documentId, doc.id))
    .orderBy(sources.position);
  const source = src[0] ?? null;
  const paras = source
    ? await db.select().from(paragraphs).where(eq(paragraphs.sourceId, source.id)).orderBy(paragraphs.position)
    : [];
  return { doc, source, paragraphs: paras };
}
