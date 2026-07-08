import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { users, documents, sources, inlineAnnotations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("inline_annotations schema", () => {
  const uid = "clerk_" + crypto.randomUUID();
  let docId = "";
  afterAll(async () => {
    if (docId) await db.delete(documents).where(eq(documents.id, docId)); // cascades annotations
    await db.delete(users).where(eq(users.id, uid));
  });

  it("inserts with defaults (empty tags, null note) and reads back", async () => {
    await db.insert(users).values({ id: uid, email: "a@b.c", displayName: "T" });
    const [doc] = await db.insert(documents).values({ ownerId: uid, title: "D" }).returning();
    docId = doc.id;
    const [src] = await db.insert(sources).values({ documentId: doc.id, position: 0, text: "Hello world." }).returning();

    const [ann] = await db.insert(inlineAnnotations).values({
      documentId: doc.id, sourceId: src.id, authorId: uid, startOffset: 0, endOffset: 5, color: "yellow",
    }).returning();

    expect(ann.tags).toEqual([]);
    expect(ann.note).toBeNull();
    expect(ann.color).toBe("yellow");
  });

  it("cascades: deleting the source removes its annotations", async () => {
    const [src2] = await db.insert(sources).values({ documentId: docId, position: 1, text: "Second." }).returning();
    await db.insert(inlineAnnotations).values({
      documentId: docId, sourceId: src2.id, authorId: uid, startOffset: 0, endOffset: 3, color: "pink",
    });
    await db.delete(sources).where(eq(sources.id, src2.id));
    const rows = await db.select().from(inlineAnnotations).where(eq(inlineAnnotations.sourceId, src2.id));
    expect(rows).toEqual([]);
  });
});
