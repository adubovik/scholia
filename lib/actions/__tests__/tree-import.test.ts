import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { db } from "@/lib/db";
import { users, documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const userId = "clerk_" + crypto.randomUUID();
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: async () => ({ id: userId, displayName: "T", isAdmin: true, status: "active", canInvite: false }),
  getUserId: async () => userId,
}));

import { createDocument } from "@/lib/actions/documents";
import { getDocument } from "@/lib/data/documents";

describe("import builds nodes", () => {
  const created: string[] = [];
  beforeAll(async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
  });
  afterAll(async () => {
    for (const id of created) await db.delete(documents).where(eq(documents.id, id));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("flat paste → one top-level node per paragraph", async () => {
    const id = await createDocument({ title: "Russell", text: "One.\n\nTwo." });
    created.push(id);

    const got = await getDocument(id);
    expect(got!.tree).toHaveLength(2);
    expect(got!.tree.map((n) => n.text)).toEqual(["One.", "Two."]);
    expect(got!.tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it("Tractatus paste → decimal nesting with labels and clean prose", async () => {
    const id = await createDocument({
      title: "Tractatus",
      text: "1 The world is all that is the case.\n\n1.1 The world is the totality of facts.\n\n2 A fact.",
    });
    created.push(id);

    const got = await getDocument(id);
    expect(got!.tree.map((n) => n.label)).toEqual(["1", "2"]);
    const one = got!.tree[0];
    expect(one.children.map((n) => n.label)).toEqual(["1.1"]);
    // range starts past the label → prose has no leading number
    expect(one.children[0].text).toBe("The world is the totality of facts.");
    expect(one.text).toBe("The world is all that is the case.");
  });
});
