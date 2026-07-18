import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { invites, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { hasAccess } from "@/lib/auth/access";

function Message({ line, hint }: { line: string; hint: string }) {
  return (
    <main className="page">
      <header className="home-head">
        <div className="home-brand">
          <h1>Scholia</h1>
        </div>
      </header>
      <div className="home-empty">
        <p className="home-empty-line">{line}</p>
        <p className="home-empty-hint">{hint}</p>
      </div>
    </main>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Clerk (proxy) forces sign-in first, returning here. requireUser upserts the
  // user row so the status update below has a row to touch.
  const user = await requireUser();

  // Already a member (admin or redeemed before) — don't spend an unrelated link.
  if (hasAccess(user)) redirect("/");

  const [inv] = await db.select().from(invites).where(eq(invites.token, token));
  if (!inv) return <Message line="Invalid invite." hint="This link doesn't match any invite." />;
  if (inv.status === "accepted")
    return <Message line="Invite already used." hint="Each invite link works only once." />;
  if (inv.status === "revoked")
    return <Message line="Invite no longer valid." hint="This link was revoked." />;
  if (inv.expiresAt && inv.expiresAt < new Date())
    return <Message line="Invite no longer valid." hint="This link has expired." />;

  // Atomic single-use redemption: the status guard means a concurrent open can't
  // redeem the same link twice — the loser gets 0 rows back.
  const redeemed = await db
    .update(invites)
    .set({ status: "accepted", redeemedBy: user.id, redeemedAt: new Date() })
    .where(and(eq(invites.id, inv.id), eq(invites.status, "pending")))
    .returning({ id: invites.id });
  if (redeemed.length === 0)
    return <Message line="Invite already used." hint="Each invite link works only once." />;

  await db.update(users).set({ status: "active" }).where(eq(users.id, user.id));
  redirect("/");
}
