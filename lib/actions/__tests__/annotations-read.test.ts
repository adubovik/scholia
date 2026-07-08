import { describe, it, expect, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { users, documents, inlineAnnotations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const userId = "clerk_" + crypto.randomUUID();
vi.mock("@/lib/auth/current-user", () => ({ requireUser: async () => ({ id: userId, displayName: "T" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createDocument } from "@/lib/actions/documents";
import { getDocument } from "@/lib/data/documents";

describe("getDocument attaches inline annotations", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await db.delete(documents).where(eq(documents.id, id));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("returns annotations on the node whose range they fall in", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const id = await createDocument({ title: "R", text: "First para.\n\nSecond para." });
    created.push(id);

    const before = await getDocument(id);
    const firstNode = before!.tree[0];
    // Highlight "First" (offsets 0..5 into the source) on the primary source.
    await db.insert(inlineAnnotations).values({
      documentId: id, sourceId: firstNode.sourceId, authorId: userId, startOffset: 0, endOffset: 5, color: "yellow",
    });

    const after = await getDocument(id);
    expect(after!.tree[0].annotations.map((a) => a.color)).toEqual(["yellow"]);
    expect(after!.tree[1].annotations).toEqual([]);
  });
});
