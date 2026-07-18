import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invites } from "@/lib/db/schema";

export type InviteView = {
  id: string;
  token: string;
  email: string | null;
  status: string; // 'pending' | 'accepted' | 'revoked'
  createdAt: Date;
  redeemedAt: Date | null;
};

/** Invites created by this user, newest first — for the settings dialog. */
export async function listMyInvites(userId: string): Promise<InviteView[]> {
  return db
    .select({
      id: invites.id,
      token: invites.token,
      email: invites.email,
      status: invites.status,
      createdAt: invites.createdAt,
      redeemedAt: invites.redeemedAt,
    })
    .from(invites)
    .where(eq(invites.createdBy, userId))
    .orderBy(desc(invites.createdAt));
}
