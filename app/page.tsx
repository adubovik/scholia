import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listDocuments } from "@/lib/data/documents";

// Printed-catalog date: "10 JUL 2026" — mono, tracked, tabular. Formatted on the
// server (this is a Server Component) so there's no locale/hydration drift.
const editedFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const formatEdited = (d: Date) => editedFmt.format(new Date(d)).toUpperCase();

export default async function Home() {
  await requireUser();
  const docs = await listDocuments();
  return (
    <main className="page">
      <header className="home-head">
        <div className="home-brand">
          <h1>Scholia</h1>
          <p className="home-tagline">Close reading &amp; marginal annotation.</p>
        </div>
        <Link href="/new" className="btn btn--ghost">＋ New</Link>
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
                <span className="doc-meta">Edited {formatEdited(d.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
