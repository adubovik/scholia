import { describe, it, expect, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { users, documents, inlineAnnotations, nodeAnnotations, sources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const userId = "clerk_" + crypto.randomUUID();
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: async () => ({ id: userId, displayName: "T", isAdmin: true, status: "active", canInvite: false }),
  getUserId: async () => userId,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createDocument } from "@/lib/actions/documents";
import { getDocument } from "@/lib/data/documents";
import { deleteNode, indentNode, updateNodeText } from "@/lib/actions/tree";

describe("deleteNode / updateNodeText", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await db.delete(documents).where(eq(documents.id, id));
    await db.delete(users).where(eq(users.id, userId));
  });

  async function doc(title: string, text: string) {
    const id = await createDocument({ title, text });
    created.push(id);
    return id;
  }
  const srcText = async (id: string) =>
    (await db.select().from(sources).where(eq(sources.documentId, id)))[0].text;
  const marked = async (id: string) => {
    const text = await srcText(id);
    const rows = await db.select().from(inlineAnnotations).where(eq(inlineAnnotations.documentId, id));
    return rows.map((a) => [a.color, text.slice(a.startOffset, a.endOffset)] as const).sort();
  };

  it("removes a node and promotes its children into its slot", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" }).onConflictDoNothing();
    const id = await doc("D1", "A.\n\nB.\n\nC.\n\nD.");
    const before = await getDocument(id);
    await indentNode(before!.tree[2].id); // nest C under B → A, B[C], D

    const mid = await getDocument(id);
    await deleteNode(mid!.tree[1].id); // delete B

    const after = await getDocument(id);
    expect(after!.tree.map((n) => n.text)).toEqual(["A.", "C.", "D."]); // C took B's slot, one level up
    expect(after!.tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it("takes the deleted node's highlights and note with it, leaving the rest alone", async () => {
    const id = await doc("D2", "First para.\n\nSecond para.");
    const [first, second] = (await getDocument(id))!.tree;
    await db.insert(inlineAnnotations).values([
      { documentId: id, sourceId: first.sourceId, authorId: userId, startOffset: first.startOffset, endOffset: first.startOffset + 5, color: "yellow" },
      { documentId: id, sourceId: second.sourceId, authorId: userId, startOffset: second.startOffset, endOffset: second.startOffset + 6, color: "blue" },
    ]);
    await db.insert(nodeAnnotations).values({ documentId: id, nodeId: first.id, authorId: userId, note: "gone with it" });

    await deleteNode(first.id);

    const after = await getDocument(id);
    expect(after!.tree.map((n) => n.text)).toEqual(["Second para."]);
    expect(await marked(id)).toEqual([["blue", "Second"]]); // the deleted node's highlight is gone, not orphaned
    expect(await db.select().from(nodeAnnotations).where(eq(nodeAnnotations.documentId, id))).toHaveLength(0);
  });

  it("rewrites a passage and slides the highlights that follow it", async () => {
    const id = await doc("D3", "The quick brown fox.\n\nJumps over it.");
    const [first, second] = (await getDocument(id))!.tree;
    await db.insert(inlineAnnotations).values({
      documentId: id, sourceId: second.sourceId, authorId: userId,
      startOffset: second.startOffset, endOffset: second.startOffset + 5, color: "green",
    });

    await updateNodeText(first.id, "The very quick brown fox indeed.");

    const after = await getDocument(id);
    expect(after!.tree.map((n) => n.text)).toEqual(["The very quick brown fox indeed.", "Jumps over it."]);
    expect(await marked(id)).toEqual([["green", "Jumps"]]); // downstream anchor still on its word
  });

  it("carries the node's own highlights to wherever their markers moved", async () => {
    const id = await doc("D4", "alpha beta gamma");
    const node = (await getDocument(id))!.tree[0];
    const at = (s: number, e: number, color: string) => ({
      documentId: id, sourceId: node.sourceId, authorId: userId,
      startOffset: node.startOffset + s, endOffset: node.startOffset + e, color,
    });
    await db.insert(inlineAnnotations).values([at(0, 5, "yellow"), at(11, 16, "blue")]);

    // Swap the two marked words and rewrite the one in between.
    await updateNodeText(node.id, "[gamma][2] DELTA [alpha][1]");

    expect(await srcText(id)).toBe("gamma DELTA alpha");
    expect(await marked(id)).toEqual([["blue", "gamma"], ["yellow", "alpha"]]);
  });

  it("refuses an edit that drops, duplicates or invents a highlight", async () => {
    const id = await doc("D5", "alpha beta");
    const node = (await getDocument(id))!.tree[0];
    await db.insert(inlineAnnotations).values({
      documentId: id, sourceId: node.sourceId, authorId: userId,
      startOffset: node.startOffset, endOffset: node.startOffset + 5, color: "pink",
    });

    await expect(updateNodeText(node.id, "alpha beta")).rejects.toThrow("missing");
    await expect(updateNodeText(node.id, "[alpha][1] [beta][1]")).rejects.toThrow("more than once");
    await expect(updateNodeText(node.id, "[alpha][1] [beta][2]")).rejects.toThrow("no highlight");
    expect(await marked(id)).toEqual([["pink", "alpha"]]); // nothing moved
  });

  it("refuses to empty a passage (that is what Delete is for)", async () => {
    const id = await doc("D5b", "Only para.");
    const node = (await getDocument(id))!.tree[0];
    await expect(updateNodeText(node.id, "   ")).rejects.toThrow("empty");
  });

  it("refuses a passage whose highlights overlap", async () => {
    const id = await doc("D6", "alpha beta gamma");
    const node = (await getDocument(id))!.tree[0];
    const at = (s: number, e: number, color: string) => ({
      documentId: id, sourceId: node.sourceId, authorId: userId,
      startOffset: node.startOffset + s, endOffset: node.startOffset + e, color,
    });
    await db.insert(inlineAnnotations).values([at(0, 10, "yellow"), at(6, 16, "blue")]);

    await expect(updateNodeText(node.id, "[alpha beta gamma][1]")).rejects.toThrow("overlapping");
  });

  it("gives a bodyless section prose of its own, keeping its children and what follows", async () => {
    // The shape the AI importer produces for an epub chapter head: `cut` eats the whole
    // heading paragraph, so the node's range is zero-length and it renders as a bare id.
    const id = await createDocument({
      title: "D7",
      text: "I\n\nThe traditional disputes.\n\nII\n\nA later chapter.",
      aiTree: [
        { h: 1, id: "I", cut: "I", body: [2, 2] },
        { h: 3, id: "II", cut: "II", body: [4, 4] },
      ],
    });
    created.push(id);
    const chapter = (await getDocument(id))!.tree[0];
    expect(chapter.text).toBe(""); // nothing to edit — until now

    await updateNodeText(chapter.id, "A lead-in written long after the import.");

    const after = (await getDocument(id))!.tree;
    expect(after[0].text).toBe("A lead-in written long after the import.");
    expect(after[0].children.map((c) => c.text)).toEqual(["The traditional disputes."]);
    expect(after[1].children.map((c) => c.text)).toEqual(["A later chapter."]); // downstream slid intact
    expect(await srcText(id)).toContain("IA lead-in written long after the import.");
  });
});
