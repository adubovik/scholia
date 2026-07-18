import Link from "next/link";
import { requireMember, canCreateInvites } from "@/lib/auth/access";
import { listDocuments } from "@/lib/data/documents";
import { listMyInvites } from "@/lib/data/invites";
import { InviteSettings } from "@/components/InviteSettings";

// Printed-catalog date: "10 JUL 2026" — mono, tracked, tabular. Formatted on the
// server (this is a Server Component) so there's no locale/hydration drift.
const editedFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const formatEdited = (d: Date) => editedFmt.format(new Date(d)).toUpperCase();

export default async function Home() {
  const user = await requireMember();
  const canInvite = canCreateInvites(user);
  const [docs, myInvites] = await Promise.all([
    listDocuments(),
    canInvite ? listMyInvites(user.id) : Promise.resolve([]),
  ]);
  return (
    <main className="page">
      <header className="home-head">
        <div className="home-brand">
          <h1>Scholia</h1>
          <p className="home-tagline">Close reading &amp; marginal annotation.</p>
        </div>
        <div className="home-actions">
          {canInvite && <InviteSettings invites={myInvites} />}
          <Link href="/new" className="btn btn--ghost">＋ New</Link>
        </div>
      </header>

      {docs.length === 0 ? (
        <div className="home-empty">
          <p className="home-empty-line">No texts yet.</p>
          <p className="home-empty-hint">Import a text to begin close-reading.</p>
          <Link href="/new" className="btn">＋ Add a text</Link>
        </div>
      ) : (
        <ul className="doc-list">
          {docs.map((d) => (
            <li key={d.id}>
              <Link href={`/d/${d.id}`} className="doc-row">
                <span className="doc-title">{d.title}</span>
                <span className="doc-meta">
                  <span className="doc-stats">
                    <span className="stat" title={`${d.noteCount} ${d.noteCount === 1 ? "note" : "notes"}`}>
                      <span className="stat-icon" aria-hidden>¶</span>
                      {d.noteCount}
                    </span>
                    <span className="stat" title={`${d.highlightCount} ${d.highlightCount === 1 ? "highlight" : "highlights"}`}>
                      <span className="stat-icon stat-hl" aria-hidden />
                      {d.highlightCount}
                    </span>
                    <span className="stat" title={`${d.nodeCount} ${d.nodeCount === 1 ? "node" : "nodes"}`}>
                      <span className="stat-icon" aria-hidden>§</span>
                      {d.nodeCount}
                    </span>
                  </span>
                  <span className="doc-date">Edited {formatEdited(d.updatedAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
