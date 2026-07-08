import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listDocuments } from "@/lib/data/documents";

export default async function Home() {
  await requireUser();
  const docs = await listDocuments();
  return (
    <main className="page">
      <header className="home-head">
        <h1>Scholia</h1>
        <Link href="/new" className="btn">＋ New</Link>
      </header>
      {docs.length === 0 ? (
        <p className="muted">No documents yet. Import one to begin.</p>
      ) : (
        <ul className="doc-list">
          {docs.map((d) => (
            <li key={d.id}><Link href={`/d/${d.id}`}>{d.title}</Link></li>
          ))}
        </ul>
      )}
    </main>
  );
}
