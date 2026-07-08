import { auth, currentUser } from "@clerk/nextjs/server";
import { upsertUser } from "@/lib/auth/upsert-user";

export { upsertUser };

export async function requireUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthenticated");
  const cu = await currentUser();
  const email = cu?.emailAddresses[0]?.emailAddress ?? "";
  const displayName = cu?.firstName || cu?.username || email || "Reader";
  await upsertUser({ id: userId, email, displayName });
  return { id: userId, displayName };
}
