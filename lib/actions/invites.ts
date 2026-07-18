"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { invites } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { canCreateInvites } from "@/lib/auth/access";

/** Create a single-use invite link. Returns its token; caller builds the URL. */
export async function createInvite(email?: string): Promise<{ token: string }> {
  const user = await requireUser();
  if (!canCreateInvites(user)) throw new Error("Forbidden");

  const token = crypto.randomUUID(); // 122 bits of randomness — unguessable
  await db.insert(invites).values({
    token,
    createdBy: user.id,
    email: email?.trim() || null,
  });
  revalidatePath("/");
  return { token };
}

/** Revoke one of your own still-pending invites. Accepted invites can't be revoked. */
export async function revokeInvite(id: string): Promise<void> {
  const user = await requireUser();
  if (!canCreateInvites(user)) throw new Error("Forbidden");

  const [row] = await db.select().from(invites).where(eq(invites.id, id));
  if (!row) throw new Error("Not found");
  if (row.createdBy !== user.id && !user.isAdmin) throw new Error("Forbidden");
  if (row.status !== "pending") throw new Error("Only pending invites can be revoked");

  await db
    .update(invites)
    .set({ status: "revoked" })
    .where(and(eq(invites.id, id), eq(invites.status, "pending")));
  revalidatePath("/");
}
