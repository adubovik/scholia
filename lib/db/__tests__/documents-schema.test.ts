import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { users, documents, sources, paragraphs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("documents schema", () => {
  const userId = "clerk_" + crypto.randomUUID();
  let docId = "";
  afterAll(async () => {
    if (docId) await db.delete(documents).where(eq(documents.id, docId)); // cascades to sources/paragraphs
    await db.delete(users).where(eq(users.id, userId));
  });

  it("stores a document with a source and paragraphs (FK + cascade)", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const [doc] = await db.insert(documents).values({ ownerId: userId, title: "Doc" }).returning();
    docId = doc.id;
    const [src] = await db.insert(sources)
      .values({ documentId: doc.id, isPrimary: true, position: 0, text: "Hello world" })
      .returning();
    await db.insert(paragraphs).values({ sourceId: src.id, position: 0, charStart: 0, charEnd: 11 });

    const rows = await db.select().from(paragraphs).where(eq(paragraphs.sourceId, src.id));
    expect(rows).toHaveLength(1);
    expect(src.text.slice(rows[0].charStart, rows[0].charEnd)).toBe("Hello world");
  });
});
