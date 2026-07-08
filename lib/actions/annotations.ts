"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { inlineAnnotations } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { authorize } from "@/lib/auth/authorize";
import { COLORS, type Color } from "@/lib/annotations/types";

type AnnRow = typeof inlineAnnotations.$inferSelect;

function assertColor(c: string): asserts c is Color {
  if (!COLORS.includes(c as Color)) throw new Error("Invalid color");
}

/** Author gate for edit/delete — mirrors loadOwnedNode in tree.ts. */
async function loadOwnAnnotation(id: string): Promise<AnnRow> {
  const user = await requireUser();
  const [a] = await db.select().from(inlineAnnotations).where(eq(inlineAnnotations.id, id));
  if (!a) throw new Error("Not found");
  if (a.authorId !== user.id) throw new Error("Forbidden");
  return a;
}

export async function createInlineAnnotation(input: {
  documentId: string;
  sourceId: string;
  startOffset: number;
  endOffset: number;
  color: string;
}): Promise<string> {
  const user = await requireUser();
  await authorize(user.id, input.documentId, "annotate");
  assertColor(input.color);
  if (input.startOffset >= input.endOffset) throw new Error("Invalid range");

  const [row] = await db
    .insert(inlineAnnotations)
    .values({
      documentId: input.documentId,
      sourceId: input.sourceId,
      authorId: user.id,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      color: input.color,
    })
    .returning({ id: inlineAnnotations.id });
  revalidatePath(`/d/${input.documentId}`);
  return row.id;
}

export async function updateInlineAnnotation(input: {
  id: string;
  note?: string | null;
  tags?: string[];
  color?: string;
}): Promise<void> {
  const a = await loadOwnAnnotation(input.id);
  const set: Partial<AnnRow> = { updatedAt: new Date() };
  if (input.note !== undefined) set.note = input.note;
  if (input.tags !== undefined) set.tags = input.tags;
  if (input.color !== undefined) {
    assertColor(input.color);
    set.color = input.color;
  }
  await db.update(inlineAnnotations).set(set).where(eq(inlineAnnotations.id, a.id));
  revalidatePath(`/d/${a.documentId}`);
}

export async function deleteInlineAnnotation(id: string): Promise<void> {
  const a = await loadOwnAnnotation(id);
  await db.delete(inlineAnnotations).where(eq(inlineAnnotations.id, a.id));
  revalidatePath(`/d/${a.documentId}`);
}
