import { auth, currentUser } from "@clerk/nextjs/server";
import { upsertUser } from "@/lib/auth/upsert-user";
import { isDevAuth } from "@/lib/auth/mode";

export { upsertUser };

const DEV_USER = { id: "local-dev", displayName: "Local Dev" };

export async function requireUser() {
  if (isDevAuth()) {
    await upsertUser({ id: DEV_USER.id, email: "dev@localhost", displayName: DEV_USER.displayName });
    return { id: DEV_USER.id, displayName: DEV_USER.displayName };
  }
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthenticated");
  const cu = await currentUser();
  const email = cu?.emailAddresses[0]?.emailAddress ?? "";
  const displayName = cu?.firstName || cu?.username || email || "Reader";
  await upsertUser({ id: userId, email, displayName });
  return { id: userId, displayName };
}

/** Lightweight id-only check used by route handlers / actions that don't need a display name. */
export async function getUserId(): Promise<string | null> {
  if (isDevAuth()) return DEV_USER.id;
  const { userId } = await auth();
  return userId;
}
