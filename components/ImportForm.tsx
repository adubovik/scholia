"use client";
import { useEffect, useRef, useState } from "react";
import { createDocument } from "@/lib/actions/documents";
import { extractHtml } from "@/lib/actions/extract";
import { previewAiStructure, type AiPreviewResult } from "@/lib/actions/ai-preview";
import { AI_MODEL } from "@/lib/tree/ai-model";
import { TreePreviewModal } from "./TreePreviewModal";

/** The "add a text to the library" form — paste / file / URL funnel into one
 * { title, author, text } commit. Hosted by NewDocModal (the standalone /new route
 * is gone); `onDone` receives the created document id (navigate or close, per host). */
export function ImportForm({ onDone }: { onDone: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // AI structure detection (BYOK). The key is transient: kept in sessionStorage
  // (this tab only) for convenience and sent to the server action per-import;
  // never persisted server-side, never logged.
  const [useAi, setUseAi] = useState(false);
  const [apiKey, setApiKey] = useState("");
  // The AI preview (proposed tree + dropped lines + token usage) awaiting Accept.
  // Pinned to the text it was computed from, so editing the textarea invalidates it.
  const [preview, setPreview] = useState<{ text: string; result: AiPreviewResult } | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration mirror from sessionStorage
    setApiKey(sessionStorage.getItem("openai_key") ?? "");
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  // dragenter/dragleave fire per child element; count depth so the overlay only
  // clears when the pointer truly leaves the canvas, not on inner boundaries.
  const dragDepth = useRef(0);
  // headingLevels + origin url are valid only while `text` is exactly what
  // extraction produced; once the user edits the textarea the paragraph count can
  // drift (and the text is no longer that url's), so we drop them together.
  const structured = useRef<{ text: string; headingLevels: (number | null)[]; url?: string } | null>(null);

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

  async function loadFile(file: File) {
    setError(null);
    const base = file.name.replace(/\.[^.]+$/, "");
    try {
      if (/\.html?$/i.test(file.name)) {
        setBusy(true);
        const { title: t, text: extracted, headingLevels } = await extractHtml(await file.text());
        structured.current = { text: extracted, headingLevels };
        setText(extracted);
        setTitle((cur) => cur || t || base);
      } else {
        structured.current = null;
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
    const raw = url.trim();
    if (!raw) return;
    // Accept a scheme-less paste ("www.gutenberg.org/…") — assume https and
    // reflect it back into the field so the stored source URL is complete too.
    const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    if (normalized !== url) setUrl(normalized);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: normalized }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Import failed");
      const { title: t, text: extracted, headingLevels } = await res.json();
      structured.current = { text: extracted, headingLevels, url: normalized };
      setText(extracted);
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
      // Only carry structure + origin url if the textarea still holds the exact
      // extracted text (editing it invalidates both).
      const src = structured.current && structured.current.text === text ? structured.current : null;
      const id = await createDocument({
        title: title.trim(),
        author: author.trim(),
        text,
        headingLevels: src?.headingLevels,
        url: src?.url,
      });
      onDone(id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function doPreview() {
    setBusy(true);
    setError(null);
    try {
      const result = await previewAiStructure({ text, aiKey: apiKey.trim() });
      setPreview({ text, result });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function acceptPreview() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createDocument({
        title: title.trim(),
        author: author.trim(),
        text: preview.text,
        aiTree: preview.result.tree,
      });
      onDone(id);
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

  // Title and author are both required (author matches the library-row subtitle).
  // With AI on, a key is required too.
  const canImport = Boolean(
    title.trim() && author.trim() && text.trim() && (!useAi || apiKey.trim()),
  );
  // The preview is only valid while the text still matches what it was built from;
  // editing the textarea silently invalidates it (no effect needed).
  const showPreview = preview !== null && preview.text === text;

  return (
    <>
      <label className="field-label" htmlFor="doc-title">Title <span className="field-req">*</span></label>
      <input
        id="doc-title"
        className="input"
        placeholder="Untitled"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label className="field-label" htmlFor="doc-author">Author <span className="field-req">*</span></label>
      <input
        id="doc-author"
        className="input"
        placeholder="Required"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
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

      <label className="ai-toggle">
        <input
          type="checkbox"
          checked={useAi}
          onChange={(e) => setUseAi(e.target.checked)}
        />
        <span>Use AI to detect structure <span className="muted">(OpenAI · {AI_MODEL})</span></span>
      </label>
      {useAi && (
        <>
          <input
            id="doc-openai-key"
            className="input"
            type="password"
            autoComplete="off"
            placeholder="OpenAI API key (sk-…)"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              sessionStorage.setItem("openai_key", e.target.value);
            }}
          />
          <p className="muted ai-key-note">
            Not saved to the server — used once for this import, then discarded.
            Remembered only in this browser tab.
          </p>
        </>
      )}

      <div className="import-actions">
        <button
          type="button"
          className="btn"
          disabled={busy || !canImport}
          onClick={useAi ? doPreview : doImport}
        >
          {useAi ? "Preview with AI" : "Import"}
        </button>
        {busy && <span className="muted">{useAi ? "Detecting structure with AI…" : "Working…"}</span>}
      </div>
      {error && !showPreview && <p className="error">{error}</p>}

      {showPreview && (
        <TreePreviewModal
          result={preview!.result}
          busy={busy}
          error={error}
          onAccept={acceptPreview}
          onCancel={() => {
            setPreview(null);
            setError(null);
          }}
        />
      )}
    </>
  );
}
