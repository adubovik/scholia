"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { layers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { authorize } from "@/lib/auth/authorize";
import { LAYER_COLORS, type LayerColor } from "@/lib/annotations/types";

const MAX_NAME = 40;

function assertLayerColor(c: string): asserts c is LayerColor {
  if (!LAYER_COLORS.includes(c as LayerColor)) throw new Error("Invalid color");
}

/**
 * Add a named alternative rendition to a document — the "Create a view" flow. Its
 * per-node text is written later through upsertNodeAnnotation with this layer's id.
 * Position is appended, so the layer bar keeps creation order.
 */
export async function createLayer(input: {
  documentId: string;
  name: string;
  color: string;
}): Promise<string> {
  const user = await requireUser();
  await authorize(user.id, input.documentId, "annotate");
  assertLayerColor(input.color);
  const name = input.name.trim().slice(0, MAX_NAME);
  if (!name) throw new Error("Name required");

  // Append: one round-trip, and a concurrent create at worst ties a position (the
  // bar falls back to creation order within a tie).
  // ponytail: no unique (document_id, position); collisions only affect display order.
  const [row] = await db
    .insert(layers)
    .values({
      documentId: input.documentId,
      name,
      color: input.color,
      position: sql`(SELECT coalesce(max(position), -1) + 1 FROM ${layers} WHERE ${layers.documentId} = ${input.documentId})`,
    })
    .returning({ id: layers.id });
  revalidatePath(`/d/${input.documentId}`);
  return row.id;
}

/** Drop a layer and, by FK cascade, every node's text in it. */
export async function deleteLayer(id: string): Promise<void> {
  const user = await requireUser();
  const [layer] = await db.select().from(layers).where(eq(layers.id, id));
  if (!layer) throw new Error("Not found");
  await authorize(user.id, layer.documentId, "annotate");
  await db.delete(layers).where(eq(layers.id, id));
  revalidatePath(`/d/${layer.documentId}`);
}

/** Rename a layer / recolour it. Same gate as create. */
export async function updateLayer(input: { id: string; name?: string; color?: string }): Promise<void> {
  const user = await requireUser();
  const [layer] = await db.select().from(layers).where(eq(layers.id, input.id));
  if (!layer) throw new Error("Not found");
  await authorize(user.id, layer.documentId, "annotate");

  const set: Partial<typeof layers.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = input.name.trim().slice(0, MAX_NAME);
    if (!name) throw new Error("Name required");
    set.name = name;
  }
  if (input.color !== undefined) {
    assertLayerColor(input.color);
    set.color = input.color;
  }
  if (Object.keys(set).length === 0) return;
  await db.update(layers).set(set).where(eq(layers.id, input.id));
  revalidatePath(`/d/${layer.documentId}`);
}
