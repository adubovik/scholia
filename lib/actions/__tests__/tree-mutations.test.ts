import { describe, it, expect, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { users, documents, nodes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const userId = "clerk_" + crypto.randomUUID();
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: async () => ({ id: userId, displayName: "T" }),
}));
// next/cache revalidatePath is a no-op outside a request scope.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createDocument } from "@/lib/actions/documents";
import { getDocument } from "@/lib/data/documents";
import { indentNode, outdentNode, moveNodeDown, moveNodeUp } from "@/lib/actions/tree";

describe("tree mutations", () => {
  const created: string[] = [];
  const foreignUser = "clerk_foreign_" + crypto.randomUUID();
  afterAll(async () => {
    for (const id of created) await db.delete(documents).where(eq(documents.id, id));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(users).where(eq(users.id, foreignUser));
  });

  it("indents a node under its previous sibling and persists", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const id = await createDocument({ title: "R", text: "One.\n\nTwo.\n\nThree." });
    created.push(id);

    const before = await getDocument(id);
    const second = before!.tree[1]; // "Two."
    await indentNode(second.id);

    const after = await getDocument(id);
    expect(after!.tree.map((n) => n.text)).toEqual(["One.", "Three."]); // "Two." moved under "One.", no longer at top level
    expect(after!.tree[0].children.map((n) => n.text)).toEqual(["Two."]);
  });

  it("moves a node down among its siblings", async () => {
    const id = await createDocument({ title: "R2", text: "A.\n\nB.\n\nC." });
    created.push(id);
    const before = await getDocument(id);
    await moveNodeDown(before!.tree[0].id); // A. → after B.

    const after = await getDocument(id);
    expect(after!.tree.map((n) => n.text)).toEqual(["B.", "A.", "C."]);
  });

  it("denies a non-owner (Forbidden)", async () => {
    await db.insert(users).values({ id: foreignUser, email: "f@x.c", displayName: "F" });
    const [doc] = await db.insert(documents).values({ ownerId: foreignUser, title: "Theirs" }).returning();
    created.push(doc.id);
    const [node] = await db.insert(nodes)
      .values({ documentId: doc.id, parentId: null, position: 0, label: null, title: null }).returning();

    await expect(indentNode(node.id)).rejects.toThrow("Forbidden");
  });

  it("outdent lands node right after its former parent", async () => {
    const id = await createDocument({ title: "R3", text: "A.\n\nB.\n\nC.\n\nD." });
    created.push(id);

    // Nest C under B: top-level becomes A, B[C], D
    const before = await getDocument(id);
    const cNode = before!.tree[2]; // "C."
    await indentNode(cNode.id);

    // Outdent C: should become A, B, C, D at top level
    const mid = await getDocument(id);
    const cNested = mid!.tree[1].children[0]; // C is now child of B
    await outdentNode(cNested.id);

    const after = await getDocument(id);
    expect(after!.tree.map((n) => n.text)).toEqual(["A.", "B.", "C.", "D."]);
    expect(after!.tree[1].children).toEqual([]);
  });

  it("move up swaps with the previous sibling", async () => {
    const id = await createDocument({ title: "R4", text: "A.\n\nB.\n\nC." });
    created.push(id);

    const before = await getDocument(id);
    const cNode = before!.tree[2]; // "C."
    await moveNodeUp(cNode.id);

    const after = await getDocument(id);
    expect(after!.tree.map((n) => n.text)).toEqual(["A.", "C.", "B."]);
  });

  it("outdent denies a non-owner (Forbidden)", async () => {
    const [doc] = await db.insert(documents).values({ ownerId: foreignUser, title: "Theirs2" }).returning();
    created.push(doc.id);
    const [node] = await db.insert(nodes)
      .values({ documentId: doc.id, parentId: null, position: 0, label: null, title: null }).returning();

    await expect(outdentNode(node.id)).rejects.toThrow("Forbidden");
  });
});
