import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { users, documents, sources, paragraphs, nodes, nodeSourceRanges } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("nodes schema", () => {
  const userId = "clerk_" + crypto.randomUUID();
  let docId = "";
  afterAll(async () => {
    if (docId) await db.delete(documents).where(eq(documents.id, docId)); // cascades to sources/paragraphs/nodes/ranges
    await db.delete(users).where(eq(users.id, userId));
  });

  it("stores a node with a source range and cascades on document delete", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const [doc] = await db.insert(documents).values({ ownerId: userId, title: "Doc" }).returning();
    docId = doc.id;
    const [src] = await db.insert(sources)
      .values({ documentId: doc.id, isPrimary: true, position: 0, text: "Hello world" }).returning();
    const [para] = await db.insert(paragraphs)
      .values({ sourceId: src.id, position: 0, charStart: 0, charEnd: 11 }).returning();
    const [node] = await db.insert(nodes)
      .values({ documentId: doc.id, parentId: null, position: 0, label: "1", title: null }).returning();
    await db.insert(nodeSourceRanges).values({
      nodeId: node.id, sourceId: src.id,
      startParagraphId: para.id, startOffset: 0, endParagraphId: para.id, endOffset: 11,
    });

    const ranges = await db.select().from(nodeSourceRanges).where(eq(nodeSourceRanges.nodeId, node.id));
    expect(ranges).toHaveLength(1);
    expect(src.text.slice(ranges[0].startOffset, ranges[0].endOffset)).toBe("Hello world");
  });
});
