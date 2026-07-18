import { auth, currentUser } from "@clerk/nextjs/server";
import { upsertUser } from "@/lib/auth/upsert-user";
import { isDevAuth } from "@/lib/auth/mode";

export { upsertUser };

const DEV_USER = { id: "local-dev", displayName: "Local Dev" };

export type CurrentUser = {
  id: string;
  displayName: string;
  isAdmin: boolean;     // from Clerk publicMetadata.role — the tamper-proof anchor
  status: string;       // 'pending' | 'active' (DB); irrelevant when isAdmin
  canInvite: boolean;   // DB delegation flag; admin can invite regardless
};

export async function requireUser(): Promise<CurrentUser> {
  if (isDevAuth()) {
    const row = await upsertUser({ id: DEV_USER.id, email: "dev@localhost", displayName: DEV_USER.displayName });
    // Local dev is always admin so the bypass keeps full access.
    return { id: DEV_USER.id, displayName: DEV_USER.displayName, isAdmin: true, status: row.status, canInvite: row.canInvite };
  }
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthenticated");
  const cu = await currentUser();
  const email = cu?.emailAddresses[0]?.emailAddress ?? "";
  const displayName = cu?.firstName || cu?.username || email || "Reader";
  const isAdmin = cu?.publicMetadata?.role === "admin";
  const row = await upsertUser({ id: userId, email, displayName });
  return { id: userId, displayName, isAdmin, status: row.status, canInvite: row.canInvite };
}

/** Lightweight id-only check used by route handlers / actions that don't need a display name. */
export async function getUserId(): Promise<string | null> {
  if (isDevAuth()) return DEV_USER.id;
  const { userId } = await auth();
  return userId;
}
