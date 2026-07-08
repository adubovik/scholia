import { describe, it, expect, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { users, documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const mockAuth = vi.hoisted(() => ({ id: "clerk_" + Math.random().toString(36).slice(2) }));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: async () => ({ id: mockAuth.id, displayName: "T" }),
}));

import { createDocument } from "@/lib/actions/documents";
import { getDocument, listDocuments } from "@/lib/data/documents";

describe("document actions", () => {
  let docId = "";
  afterAll(async () => {
    if (docId) await db.delete(documents).where(eq(documents.id, docId));
    await db.delete(users).where(eq(users.id, mockAuth.id));
  });

  it("creates a document with paragraphs and reads it back", async () => {
    await db.insert(users).values({ id: mockAuth.id, email: "a@b.c", displayName: "T" });
    docId = await createDocument({ title: "Russell", text: "One.\r\n\r\nTwo." });

    const got = await getDocument(docId);
    expect(got).not.toBeNull();
    expect(got!.doc.title).toBe("Russell");
    expect(got!.paragraphs.map(p => got!.source.text.slice(p.charStart, p.charEnd)))
      .toEqual(["One.", "Two."]);

    const list = await listDocuments();
    expect(list.some(d => d.id === docId)).toBe(true);
  });

  it("owner-gates getDocument (returns null for a non-existent id)", async () => {
    expect(await getDocument(crypto.randomUUID())).toBeNull();
  });

  it("getDocument returns null for a document owned by another user", async () => {
    // docId was created above under mockAuth.id
    const realOwner = mockAuth.id;
    mockAuth.id = "clerk_" + Math.random().toString(36).slice(2); // now a different user
    try {
      expect(await getDocument(docId)).toBeNull();
    } finally {
      mockAuth.id = realOwner; // restore so afterAll cleanup deletes as the owner
    }
  });
});
