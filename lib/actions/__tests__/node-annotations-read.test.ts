import { describe, it, expect, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { users, documents, nodeAnnotations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const userId = "clerk_" + crypto.randomUUID();
vi.mock("@/lib/auth/current-user", () => ({ requireUser: async () => ({ id: userId, displayName: "T", isAdmin: true, status: "active", canInvite: false }), getUserId: async () => userId }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createDocument } from "@/lib/actions/documents";
import { getDocument } from "@/lib/data/documents";

describe("getDocument attaches node annotations", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await db.delete(documents).where(eq(documents.id, id));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("returns nodeAnnotation on the node it belongs to", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const id = await createDocument({ title: "R", text: "First para.\n\nSecond para." });
    created.push(id);

    const before = await getDocument(id);
    const firstNodeId = before!.tree[0].id;
    await db.insert(nodeAnnotations).values({
      documentId: id, nodeId: firstNodeId, authorId: userId, note: "**node** note", tags: ["structure"],
    });

    const after = await getDocument(id);
    expect(after!.tree[0].nodeAnnotation?.note).toBe("**node** note");
    expect(after!.tree[0].nodeAnnotation?.tags).toEqual(["structure"]);
    expect(after!.tree[1].nodeAnnotation).toBeNull();
  });
});
