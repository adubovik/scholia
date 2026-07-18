import { requireUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { hasAccess } from "@/lib/auth/access";

// The "you need an invite" wall. Reachable by any authenticated user; NOT gated
// by requireMember (that would loop). Members who land here are sent home.
export default async function WelcomePage() {
  const user = await requireUser();
  if (hasAccess(user)) redirect("/");
  return (
    <main className="page">
      <header className="home-head">
        <div className="home-brand">
          <h1>Scholia</h1>
          <p className="home-tagline">Close reading &amp; marginal annotation.</p>
        </div>
      </header>
      <div className="home-empty">
        <p className="home-empty-line">You need an invite.</p>
        <p className="home-empty-hint">
          Scholia is invite-only right now. Ask whoever shared it with you for an invite link.
        </p>
      </div>
    </main>
  );
}
