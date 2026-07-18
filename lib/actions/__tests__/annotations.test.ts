import { describe, it, expect, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { users, documents, sources, inlineAnnotations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const userId = "clerk_" + crypto.randomUUID();
vi.mock("@/lib/auth/current-user", () => ({ requireUser: async () => ({ id: userId, displayName: "T", isAdmin: true, status: "active", canInvite: false }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createInlineAnnotation, updateInlineAnnotation, deleteInlineAnnotation } from "@/lib/actions/annotations";

describe("inline annotation actions", () => {
  const created: string[] = [];
  const foreign = "clerk_foreign_" + crypto.randomUUID();
  afterAll(async () => {
    for (const id of created) await db.delete(documents).where(eq(documents.id, id));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(users).where(eq(users.id, foreign));
  });

  async function ownDoc() {
    const [doc] = await db.insert(documents).values({ ownerId: userId, title: "D" }).returning();
    created.push(doc.id);
    const [src] = await db.insert(sources).values({ documentId: doc.id, position: 0, text: "Hello world." }).returning();
    return { docId: doc.id, sourceId: src.id };
  }

  it("creates, updates (note+tags), and deletes an annotation", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const { docId, sourceId } = await ownDoc();

    const id = await createInlineAnnotation({ documentId: docId, sourceId, startOffset: 0, endOffset: 5, color: "yellow" });
    let [row] = await db.select().from(inlineAnnotations).where(eq(inlineAnnotations.id, id));
    expect(row.color).toBe("yellow");

    await updateInlineAnnotation({ id, note: "**hi**", tags: ["metaphysics"], color: "green" });
    [row] = await db.select().from(inlineAnnotations).where(eq(inlineAnnotations.id, id));
    expect(row.note).toBe("**hi**");
    expect(row.tags).toEqual(["metaphysics"]);
    expect(row.color).toBe("green");

    await deleteInlineAnnotation(id);
    const rows = await db.select().from(inlineAnnotations).where(eq(inlineAnnotations.id, id));
    expect(rows).toEqual([]);
  });

  it("rejects an invalid color", async () => {
    const { docId, sourceId } = await ownDoc();
    await expect(
      createInlineAnnotation({ documentId: docId, sourceId, startOffset: 0, endOffset: 5, color: "purple" }),
    ).rejects.toThrow("Invalid color");
  });

  it("rejects a zero-length range", async () => {
    const { docId, sourceId } = await ownDoc();
    await expect(
      createInlineAnnotation({ documentId: docId, sourceId, startOffset: 3, endOffset: 3, color: "yellow" }),
    ).rejects.toThrow("Invalid range");
  });

  it("denies create on a document owned by someone else (Forbidden)", async () => {
    await db.insert(users).values({ id: foreign, email: "f@x.c", displayName: "F" });
    const [doc] = await db.insert(documents).values({ ownerId: foreign, title: "Theirs" }).returning();
    created.push(doc.id);
    const [src] = await db.insert(sources).values({ documentId: doc.id, position: 0, text: "x" }).returning();
    await expect(
      createInlineAnnotation({ documentId: doc.id, sourceId: src.id, startOffset: 0, endOffset: 1, color: "yellow" }),
    ).rejects.toThrow("Forbidden");
  });

  it("denies editing/deleting an annotation authored by someone else (Forbidden)", async () => {
    const [doc] = await db.insert(documents).values({ ownerId: foreign, title: "Theirs2" }).returning();
    created.push(doc.id);
    const [src] = await db.insert(sources).values({ documentId: doc.id, position: 0, text: "x" }).returning();
    const [ann] = await db.insert(inlineAnnotations)
      .values({ documentId: doc.id, sourceId: src.id, authorId: foreign, startOffset: 0, endOffset: 1, color: "yellow" })
      .returning();
    await expect(updateInlineAnnotation({ id: ann.id, note: "hi" })).rejects.toThrow("Forbidden");
    await expect(deleteInlineAnnotation(ann.id)).rejects.toThrow("Forbidden");
  });
});
