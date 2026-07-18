import { describe, it, expect, afterAll } from "vitest";
import { upsertUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("upsertUser", () => {
  const id = "clerk_" + crypto.randomUUID();
  afterAll(async () => { await db.delete(users).where(eq(users.id, id)); });

  it("creates then updates the mirrored user row", async () => {
    await upsertUser({ id, email: "x@y.z", displayName: "First" });
    await upsertUser({ id, email: "x@y.z", displayName: "Second" });
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row.displayName).toBe("Second");
  });

  it("re-login does not reset access (status/canInvite survive upsert)", async () => {
    await upsertUser({ id, email: "x@y.z", displayName: "First" });
    // Simulate the user having redeemed an invite + been granted delegation.
    await db.update(users).set({ status: "active", canInvite: true }).where(eq(users.id, id));
    const row = await upsertUser({ id, email: "x@y.z", displayName: "Again" });
    expect(row.status).toBe("active");
    expect(row.canInvite).toBe(true);
  });
});
