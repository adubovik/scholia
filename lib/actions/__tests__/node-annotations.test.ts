import { describe, it, expect, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { users, documents, nodes, nodeAnnotations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const userId = "clerk_" + crypto.randomUUID();
vi.mock("@/lib/auth/current-user", () => ({ requireUser: async () => ({ id: userId, displayName: "T" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { upsertNodeAnnotation, deleteNodeAnnotation } from "@/lib/actions/nodeAnnotations";

describe("node annotation actions", () => {
  const created: string[] = [];
  const foreign = "clerk_foreign_" + crypto.randomUUID();
  afterAll(async () => {
    for (const id of created) await db.delete(documents).where(eq(documents.id, id));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(users).where(eq(users.id, foreign));
  });

  async function ownDocWithNode() {
    const [doc] = await db.insert(documents).values({ ownerId: userId, title: "D" }).returning();
    created.push(doc.id);
    const [node] = await db.insert(nodes).values({ documentId: doc.id, position: 0 }).returning();
    return { docId: doc.id, nodeId: node.id };
  }

  it("upsert creates then updates the same row (one row, not two)", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const { docId, nodeId } = await ownDocWithNode();

    const id1 = await upsertNodeAnnotation({ documentId: docId, nodeId, note: "first", tags: ["x"] });
    const id2 = await upsertNodeAnnotation({ documentId: docId, nodeId, note: "second", tags: ["y", "z"] });
    expect(id2).toBe(id1); // same row updated in place

    const rows = await db.select().from(nodeAnnotations).where(eq(nodeAnnotations.nodeId, nodeId));
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe("second");
    expect(rows[0].tags).toEqual(["y", "z"]);
  });

  it("rejects a whitespace-only note", async () => {
    const { docId, nodeId } = await ownDocWithNode();
    await expect(
      upsertNodeAnnotation({ documentId: docId, nodeId, note: "   " }),
    ).rejects.toThrow("Note required");
  });

  it("denies create on a document owned by someone else (Forbidden)", async () => {
    await db.insert(users).values({ id: foreign, email: "f@x.c", displayName: "F" });
    const [doc] = await db.insert(documents).values({ ownerId: foreign, title: "Theirs" }).returning();
    created.push(doc.id);
    const [node] = await db.insert(nodes).values({ documentId: doc.id, position: 0 }).returning();
    await expect(
      upsertNodeAnnotation({ documentId: doc.id, nodeId: node.id, note: "hi" }),
    ).rejects.toThrow("Forbidden");
  });

  it("denies deleting a note authored by someone else (Forbidden)", async () => {
    const [doc] = await db.insert(documents).values({ ownerId: foreign, title: "Theirs2" }).returning();
    created.push(doc.id);
    const [node] = await db.insert(nodes).values({ documentId: doc.id, position: 0 }).returning();
    const [ann] = await db.insert(nodeAnnotations)
      .values({ documentId: doc.id, nodeId: node.id, authorId: foreign, note: "theirs" })
      .returning();
    await expect(deleteNodeAnnotation(ann.id)).rejects.toThrow("Forbidden");
  });

  it("deletes the caller's own note", async () => {
    const { docId, nodeId } = await ownDocWithNode();
    const id = await upsertNodeAnnotation({ documentId: docId, nodeId, note: "mine" });
    await deleteNodeAnnotation(id);
    const rows = await db.select().from(nodeAnnotations).where(eq(nodeAnnotations.id, id));
    expect(rows).toEqual([]);
  });
});
