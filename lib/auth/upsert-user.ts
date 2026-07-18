import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function upsertUser(u: { id: string; email: string; displayName: string }) {
  // Only email/displayName are mirrored on re-login. status/canInvite are
  // deliberately NOT in the `set` clause so authenticating never resets a
  // member's access — see lib/auth/__tests__/current-user.test.ts.
  const [row] = await db
    .insert(users)
    .values(u)
    .onConflictDoUpdate({ target: users.id, set: { email: u.email, displayName: u.displayName } })
    .returning();
  return row;
}
