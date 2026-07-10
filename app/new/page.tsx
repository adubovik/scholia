"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createDocument } from "@/lib/actions/documents";
import { extractHtml } from "@/lib/actions/extract";

export default function NewDocumentPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // dragenter/dragleave fire per child element; count depth so the overlay only
  // clears when the pointer truly leaves the canvas, not on inner boundaries.
  const dragDepth = useRef(0);

  // Keep a stray drop outside the canvas from navigating the browser to the file.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  // All three provenances funnel into { title, text }; Import is the one commit.
  async function loadFile(file: File) {
    setError(null);
    const base = file.name.replace(/\.[^.]+$/, "");
    try {
      if (/\.html?$/i.test(file.name)) {
        setBusy(true);
        const { title: t, paragraphs } = await extractHtml(await file.text());
        setText(paragraphs.join("\n\n"));
        setTitle((cur) => cur || t || base);
      } else {
        setText(await file.text());
        setTitle((cur) => cur || base);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function fetchUrl() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Import failed");
      const { title: t, paragraphs } = await res.json();
      setText((paragraphs as string[]).join("\n\n"));
      setTitle((cur) => cur || t || "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setBusy(true);
    setError(null);
    try {
      const id = await createDocument({ title: title.trim() || "Untitled", text });
      router.push(`/d/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }

  return (
    <main className="page page--import">
      <header className="import-head">
        <p className="import-eyebrow">New text</p>
        <h1>Add to the library</h1>
      </header>

      <label className="field-label" htmlFor="doc-title">Title</label>
      <input
        id="doc-title"
        className="input"
        placeholder="Untitled"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label className="field-label" htmlFor="doc-text">Text</label>
      <div
        className={dragging ? "source is-dragging" : "source"}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <textarea
          id="doc-text"
          className="textarea"
          placeholder="Paste text or Markdown…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" className="source-browse" onClick={() => fileRef.current?.click()}>
          Drop a file here, or <span className="source-browse-link">browse</span>
        </button>
        <div className="source-overlay">Release to import</div>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.html,.htm"
          hidden
          onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
        />
      </div>

      <label className="field-label" htmlFor="doc-url">From the web</label>
      <div className="url-row">
        <input
          id="doc-url"
          className="input"
          placeholder="https://www.gutenberg.org/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchUrl()}
        />
        <button type="button" className="btn btn--ghost" disabled={busy || !url.trim()} onClick={fetchUrl}>
          Fetch
        </button>
      </div>

      <div className="import-actions">
        <button type="button" className="btn" disabled={busy || !text.trim()} onClick={doImport}>
          Import
        </button>
        {busy && <span className="muted">Working…</span>}
      </div>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
