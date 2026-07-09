import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { users, documents, nodes, nodeAnnotations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("node_annotations schema", () => {
  const uid = "clerk_" + crypto.randomUUID();
  let docId = "";
  afterAll(async () => {
    if (docId) await db.delete(documents).where(eq(documents.id, docId)); // cascades nodes + annotations
    await db.delete(users).where(eq(users.id, uid));
  });

  it("inserts with defaults (empty tags) and reads back", async () => {
    await db.insert(users).values({ id: uid, email: "a@b.c", displayName: "T" });
    const [doc] = await db.insert(documents).values({ ownerId: uid, title: "D" }).returning();
    docId = doc.id;
    const [node] = await db.insert(nodes).values({ documentId: doc.id, position: 0 }).returning();

    const [ann] = await db.insert(nodeAnnotations).values({
      documentId: doc.id, nodeId: node.id, authorId: uid, note: "A note",
    }).returning();

    expect(ann.tags).toEqual([]);
    expect(ann.note).toBe("A note");
  });

  it("enforces one note per (node, author): a second insert conflicts", async () => {
    const [node] = await db.insert(nodes).values({ documentId: docId, position: 1 }).returning();
    await db.insert(nodeAnnotations).values({ documentId: docId, nodeId: node.id, authorId: uid, note: "first" });
    await expect(
      db.insert(nodeAnnotations).values({ documentId: docId, nodeId: node.id, authorId: uid, note: "second" }),
    ).rejects.toThrow();
  });

  it("cascades: deleting the node removes its annotations", async () => {
    const [node] = await db.insert(nodes).values({ documentId: docId, position: 2 }).returning();
    await db.insert(nodeAnnotations).values({ documentId: docId, nodeId: node.id, authorId: uid, note: "x" });
    await db.delete(nodes).where(eq(nodes.id, node.id));
    const rows = await db.select().from(nodeAnnotations).where(eq(nodeAnnotations.nodeId, node.id));
    expect(rows).toEqual([]);
  });
});
