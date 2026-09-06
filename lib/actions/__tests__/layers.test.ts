import { describe, it, expect, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { users, documents, nodes, nodeAnnotations, layers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const userId = "clerk_" + crypto.randomUUID();
vi.mock("@/lib/auth/current-user", () => ({ requireUser: async () => ({ id: userId, displayName: "T", isAdmin: true, status: "active", canInvite: false }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createLayer, deleteLayer, updateLayer } from "@/lib/actions/layers";
import { upsertNodeAnnotation } from "@/lib/actions/nodeAnnotations";

describe("layer actions", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await db.delete(documents).where(eq(documents.id, id));
    await db.delete(users).where(eq(users.id, userId));
  });

  async function ownDocWithNode() {
    const [doc] = await db.insert(documents).values({ ownerId: userId, title: "D" }).returning();
    created.push(doc.id);
    const [node] = await db.insert(nodes).values({ documentId: doc.id, position: 0 }).returning();
    return { docId: doc.id, nodeId: node.id };
  }

  it("appends layers in creation order", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const { docId } = await ownDocWithNode();

    await createLayer({ documentId: docId, name: "Summary", color: "sand" });
    await createLayer({ documentId: docId, name: "French", color: "mist" });
    const rows = await db.select().from(layers).where(eq(layers.documentId, docId)).orderBy(layers.position);
    expect(rows.map((r) => [r.name, r.position])).toEqual([["Summary", 0], ["French", 1]]);
  });

  it("rejects an unknown colour and a blank name", async () => {
    const { docId } = await ownDocWithNode();
    await expect(createLayer({ documentId: docId, name: "X", color: "chartreuse" })).rejects.toThrow("Invalid color");
    await expect(createLayer({ documentId: docId, name: "  ", color: "sand" })).rejects.toThrow("Name required");
  });

  // The constraint swap this feature turns on: (node_id, author_id, layer_id) NULLS NOT
  // DISTINCT. A node's own note and its text in each layer are separate rows that each
  // still upsert in place — the note must not collide with a layer text, or vice versa.
  it("keeps the node note and each layer's text as separate upsertable rows", async () => {
    const { docId, nodeId } = await ownDocWithNode();
    const a = await createLayer({ documentId: docId, name: "Summary", color: "sand" });
    const b = await createLayer({ documentId: docId, name: "French", color: "mist" });

    const noteId = await upsertNodeAnnotation({ documentId: docId, nodeId, note: "my note" });
    const aId = await upsertNodeAnnotation({ documentId: docId, nodeId, note: "the gist", layerId: a });
    const bId = await upsertNodeAnnotation({ documentId: docId, nodeId, note: "le texte", layerId: b });
    expect(new Set([noteId, aId, bId]).size).toBe(3);

    // Each slot updates in place rather than adding a fourth row.
    expect(await upsertNodeAnnotation({ documentId: docId, nodeId, note: "the gist, revised", layerId: a })).toBe(aId);
    expect(await upsertNodeAnnotation({ documentId: docId, nodeId, note: "my note, revised" })).toBe(noteId);

    const rows = await db.select().from(nodeAnnotations).where(eq(nodeAnnotations.nodeId, nodeId));
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.layerId === null)?.note).toBe("my note, revised");
    expect(rows.find((r) => r.layerId === a)?.note).toBe("the gist, revised");
  });

  it("deleting a layer cascades its texts and leaves the node note", async () => {
    const { docId, nodeId } = await ownDocWithNode();
    const a = await createLayer({ documentId: docId, name: "Summary", color: "sand" });
    await upsertNodeAnnotation({ documentId: docId, nodeId, note: "my note" });
    await upsertNodeAnnotation({ documentId: docId, nodeId, note: "the gist", layerId: a });

    await deleteLayer(a);
    const rows = await db.select().from(nodeAnnotations).where(eq(nodeAnnotations.nodeId, nodeId));
    expect(rows).toHaveLength(1);
    expect(rows[0].layerId).toBeNull();
  });

  it("renames and recolours a layer", async () => {
    const { docId } = await ownDocWithNode();
    const a = await createLayer({ documentId: docId, name: "Summary", color: "sand" });
    await updateLayer({ id: a, name: "Summarisation", color: "sage" });
    const [row] = await db.select().from(layers).where(eq(layers.id, a));
    expect([row.name, row.color]).toEqual(["Summarisation", "sage"]);
  });
});
