"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { nodeAnnotations } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { authorize } from "@/lib/auth/authorize";

type NodeAnnRow = typeof nodeAnnotations.$inferSelect;

/** Author gate for edit/delete — mirrors loadOwnAnnotation in annotations.ts. */
async function loadOwnNodeAnnotation(id: string): Promise<NodeAnnRow> {
  const user = await requireUser();
  const [a] = await db.select().from(nodeAnnotations).where(eq(nodeAnnotations.id, id));
  if (!a) throw new Error("Not found");
  if (a.authorId !== user.id) throw new Error("Forbidden");
  return a;
}

/**
 * Create or update the caller's note on a node. The unique (node_id, author_id)
 * constraint makes create and edit the same operation: a conflict updates in place.
 */
export async function upsertNodeAnnotation(input: {
  documentId: string;
  nodeId: string;
  note: string;
  tags?: string[];
}): Promise<string> {
  const user = await requireUser();
  await authorize(user.id, input.documentId, "annotate");
  const note = input.note.trim();
  if (!note) throw new Error("Note required");
  const tags = input.tags ?? [];

  const [row] = await db
    .insert(nodeAnnotations)
    .values({
      documentId: input.documentId,
      nodeId: input.nodeId,
      authorId: user.id,
      note,
      tags,
    })
    .onConflictDoUpdate({
      target: [nodeAnnotations.nodeId, nodeAnnotations.authorId],
      set: { note, tags, updatedAt: new Date() },
    })
    .returning({ id: nodeAnnotations.id });
  revalidatePath(`/d/${input.documentId}`);
  return row.id;
}

export async function deleteNodeAnnotation(id: string): Promise<void> {
  const a = await loadOwnNodeAnnotation(id);
  await db.delete(nodeAnnotations).where(eq(nodeAnnotations.id, a.id));
  revalidatePath(`/d/${a.documentId}`);
}
