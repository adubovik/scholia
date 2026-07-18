import { redirect } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth/current-user";

/**
 * The single seam for "may this user create invites?". Today: admin only.
 * The future delegation step just needs to flip a member's `canInvite` — no
 * caller changes. Admin (Clerk metadata) can always invite.
 */
export function canCreateInvites(user: CurrentUser): boolean {
  return user.isAdmin || user.canInvite;
}

/** True if the user may use the app at all: admin, or redeemed an invite. */
export function hasAccess(user: CurrentUser): boolean {
  return user.isAdmin || user.status === "active";
}

/**
 * Server-side access gate. Resolves the current user and, unless they're an
 * admin or active member, redirects to the "need an invite" page. Used by the
 * gated render paths and any membership-requiring action (e.g. createDocument).
 * Admin short-circuits before the status check, so a not-yet-configured admin
 * is never locked out.
 */
export async function requireMember(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasAccess(user)) redirect("/welcome");
  return user;
}
