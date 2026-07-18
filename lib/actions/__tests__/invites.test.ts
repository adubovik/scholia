import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, invites } from "@/lib/db/schema";
import type { CurrentUser } from "@/lib/auth/current-user";

const admin: CurrentUser = { id: "clerk_admin_" + crypto.randomUUID(), displayName: "Admin", isAdmin: true, status: "active", canInvite: false };
const outsider: CurrentUser = { id: "clerk_out_" + crypto.randomUUID(), displayName: "Out", isAdmin: false, status: "active", canInvite: false };
const redeemer = { id: "clerk_red_" + crypto.randomUUID() };

let current: CurrentUser = admin;
vi.mock("@/lib/auth/current-user", () => ({ requireUser: async () => current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createInvite, revokeInvite } from "@/lib/actions/invites";

beforeAll(async () => {
  await db.insert(users).values([
    { id: admin.id, email: "a@b.c", displayName: "Admin" },
    { id: outsider.id, email: "o@b.c", displayName: "Out" },
    { id: redeemer.id, email: "r@b.c", displayName: "Red", status: "pending" },
  ]);
});
afterAll(async () => {
  await db.delete(invites).where(eq(invites.createdBy, admin.id));
  for (const id of [admin.id, outsider.id, redeemer.id]) await db.delete(users).where(eq(users.id, id));
});

/** Replicates the page's guarded single-use redemption. */
async function redeem(token: string, userId: string) {
  const rows = await db
    .update(invites)
    .set({ status: "accepted", redeemedBy: userId, redeemedAt: new Date() })
    .where(and(eq(invites.token, token), eq(invites.status, "pending")))
    .returning({ id: invites.id });
  if (rows.length === 0) return false;
  await db.update(users).set({ status: "active" }).where(eq(users.id, userId));
  return true;
}

describe("invite actions", () => {
  it("admin creates a pending invite; non-inviter is rejected", async () => {
    current = admin;
    const { token } = await createInvite("guest@x.com");
    const [row] = await db.select().from(invites).where(eq(invites.token, token));
    expect(row.status).toBe("pending");
    expect(row.email).toBe("guest@x.com");

    current = outsider;
    await expect(createInvite()).rejects.toThrow("Forbidden");
    current = admin;
  });

  it("a link redeems exactly once and activates the redeemer", async () => {
    current = admin;
    const { token } = await createInvite();

    expect(await redeem(token, redeemer.id)).toBe(true);
    expect(await redeem(token, redeemer.id)).toBe(false); // single-use

    const [u] = await db.select().from(users).where(eq(users.id, redeemer.id));
    expect(u.status).toBe("active");
  });

  it("revokes a pending invite but not an accepted one", async () => {
    current = admin;
    const { token: t1 } = await createInvite();
    const [pending] = await db.select().from(invites).where(eq(invites.token, t1));
    await revokeInvite(pending.id);
    const [revoked] = await db.select().from(invites).where(eq(invites.id, pending.id));
    expect(revoked.status).toBe("revoked");

    const { token: t2 } = await createInvite();
    const [inv2] = await db.select().from(invites).where(eq(invites.token, t2));
    await redeem(t2, redeemer.id);
    await expect(revokeInvite(inv2.id)).rejects.toThrow(/pending/);
  });
});
