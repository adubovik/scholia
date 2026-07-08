"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDocument } from "@/lib/actions/documents";
import { extractHtml } from "@/lib/actions/extract";

type Mode = "paste" | "url" | "file";

export default function NewDocumentPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("paste");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(finalTitle: string, finalText: string) {
    setBusy(true); setError(null);
    try {
      const id = await createDocument({ title: finalTitle.trim() || "Untitled", text: finalText });
      router.push(`/d/${id}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  async function importUrl() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Import failed");
      const { title: t, paragraphs } = await res.json();
      await submit(t ?? title, (paragraphs as string[]).join("\n\n"));
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  async function importFile(file: File) {
    setBusy(true); setError(null);
    try {
      const raw = await file.text();
      const base = file.name.replace(/\.[^.]+$/, "");
      let finalText = raw;
      if (/\.html?$/i.test(file.name)) {
        const { title: t, paragraphs } = await extractHtml(raw);
        finalText = paragraphs.join("\n\n");
      }
      await submit(title || base, finalText);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <main className="page">
      <h1>Import a text</h1>
      <nav className="tabs">
        {(["paste", "url", "file"] as Mode[]).map((m) => (
          <button key={m} className={m === mode ? "tab active" : "tab"} onClick={() => setMode(m)}>{m}</button>
        ))}
      </nav>
      <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      {mode === "paste" && (
        <>
          <textarea className="textarea" placeholder="Paste text or Markdown…" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn" disabled={busy || !text.trim()} onClick={() => submit(title, text)}>Import</button>
        </>
      )}
      {mode === "url" && (
        <>
          <input className="input" placeholder="https://www.gutenberg.org/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn" disabled={busy || !url.trim()} onClick={importUrl}>Fetch & import</button>
        </>
      )}
      {mode === "file" && (
        <input className="input" type="file" accept=".txt,.md,.html,.htm"
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} disabled={busy} />
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
