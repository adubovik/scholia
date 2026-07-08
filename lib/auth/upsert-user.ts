import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function upsertUser(u: { id: string; email: string; displayName: string }) {
  await db
    .insert(users)
    .values(u)
    .onConflictDoUpdate({ target: users.id, set: { email: u.email, displayName: u.displayName } });
}
