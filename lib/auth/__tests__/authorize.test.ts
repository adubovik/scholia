import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { users, documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/authorize";

describe("authorize", () => {
  const owner = "clerk_owner_" + crypto.randomUUID();
  const other = "clerk_other_" + crypto.randomUUID();
  let docId = "";
  afterAll(async () => {
    if (docId) await db.delete(documents).where(eq(documents.id, docId));
    await db.delete(users).where(eq(users.id, owner));
    await db.delete(users).where(eq(users.id, other));
  });

  it("resolves for the owner and throws for anyone else", async () => {
    await db.insert(users).values([
      { id: owner, email: "o@x.c", displayName: "O" },
      { id: other, email: "e@x.c", displayName: "E" },
    ]);
    const [doc] = await db.insert(documents).values({ ownerId: owner, title: "D" }).returning();
    docId = doc.id;

    await expect(authorize(owner, docId, "editTree")).resolves.toBeUndefined();
    await expect(authorize(other, docId, "editTree")).rejects.toThrow("Forbidden");
    await expect(authorize(owner, crypto.randomUUID(), "editTree")).rejects.toThrow("Forbidden");
  });
});
