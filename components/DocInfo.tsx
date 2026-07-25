"use client";

import { useState } from "react";
import { deleteDocument, updateDocument } from "@/lib/actions/documents";
import { SettingsIcon } from "./SettingsIcon";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const fmtDate = (iso: string) => fmt.format(new Date(iso)).toUpperCase();

const CopyIcon = () => (
  <svg className="doc-btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
    <rect x="5.5" y="5.5" width="8" height="9" rx="1.2" />
    <path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="doc-btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
    <path d="M8 1.5v8.5M4.5 7 8 10.5 11.5 7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 13.5h12" strokeLinecap="round" />
  </svg>
);

/** Strip the scheme/trailing slash so a long origin URL reads as a bare host+path. */
const prettyUrl = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");

export interface DocMeta {
  documentId: string;
  title: string;
  author: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  highlightCount: number;
  noteCount: number;
}

/** Reading-header ⚙ → document metadata sheet. Title + author are editable here
 * (owner-only, via updateDocument); origin is shown when the text was imported
 * from a URL. */
export function DocInfo({ meta }: { meta: DocMeta }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [authorDraft, setAuthorDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const exportUrl = `/api/export/${meta.documentId}`;

  function startEdit() {
    setTitleDraft(meta.title);
    setAuthorDraft(meta.author ?? "");
    setEditing(true);
  }

  async function saveEdit() {
    if (!titleDraft.trim()) return;
    setSaving(true);
    try {
      await updateDocument({ documentId: meta.documentId, title: titleDraft, author: authorDraft });
      setEditing(false); // revalidatePath refreshes meta via server props
    } finally {
      setSaving(false);
    }
  }

  async function onCopy() {
    // Safari drops the user gesture across an await, so hand the clipboard the
    // pending fetch itself; writeText covers browsers without ClipboardItem.
    const text = fetch(exportUrl).then((r) => r.text());
    try {
      try {
        const item = new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) });
        await navigator.clipboard.write([item]);
      } catch {
        await navigator.clipboard.writeText(await text);
      }
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied(null), 2000);
  }

  async function onDelete() {
    if (!window.confirm(`Delete “${meta.title}”? This removes the text and every annotation on it.`)) return;
    setBusy(true);
    await deleteDocument(meta.documentId); // redirects home
  }

  return (
    <>
      <button className="reading-headbtn reading-headbtn--icon" aria-label="Document info" title="Document info" onClick={() => setOpen(true)}>
        <SettingsIcon />
      </button>

      {open && (
        <div className="aa-backdrop" onClick={() => setOpen(false)}>
          <div className="doc-sheet" role="dialog" aria-modal="true" aria-label="Document info" onClick={(e) => e.stopPropagation()}>
            <div className="doc-sheet-head">
              <div className="doc-sheet-headmain">
                <div className="doc-sheet-eyebrow">Document</div>
                {editing ? (
                  <>
                    <input
                      className="doc-sheet-titleinput"
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      placeholder="Title"
                      aria-label="Title"
                      autoFocus
                    />
                    <input
                      className="doc-sheet-authorinput"
                      value={authorDraft}
                      onChange={(e) => setAuthorDraft(e.target.value)}
                      placeholder="Author"
                      aria-label="Author"
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    />
                  </>
                ) : (
                  <>
                    <h2 className="doc-sheet-title">{meta.title}</h2>
                    {meta.author && <div className="doc-sheet-author">{meta.author}</div>}
                  </>
                )}
              </div>
              <div className="doc-sheet-headbtns">
                {!editing && (
                  <button className="glyph" aria-label="Edit title and author" title="Edit" onClick={startEdit}>✎</button>
                )}
                <button className="glyph" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
              </div>
            </div>

            {editing && (
              <div className="doc-sheet-editbtns">
                <button className="doc-btn" disabled={saving || !titleDraft.trim()} onClick={saveEdit}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="doc-btn" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            )}

            <div className="doc-sheet-grid">
              <div className="doc-sheet-key">Added</div>
              <div className="doc-sheet-val">{fmtDate(meta.createdAt)}</div>
              <div className="doc-sheet-key">Updated</div>
              <div className="doc-sheet-val">{fmtDate(meta.updatedAt)}</div>
              {meta.sourceUrl && (
                <>
                  <div className="doc-sheet-key">Source</div>
                  <div className="doc-sheet-val">
                    <a className="doc-sheet-link" href={meta.sourceUrl} target="_blank" rel="noopener noreferrer">
                      {prettyUrl(meta.sourceUrl)}
                    </a>
                  </div>
                </>
              )}
              <div className="doc-sheet-key">Stats</div>
              <div className="doc-sheet-val doc-sheet-stats">
                <span className="doc-sheet-stat" title="text nodes">§ {meta.nodeCount} nodes</span>
                <span className="doc-sheet-stat" title="highlights"><span className="stat-hl" />{meta.highlightCount} highlights</span>
                <span className="doc-sheet-stat" title="notes">✎ {meta.noteCount} notes</span>
              </div>
            </div>

            <div className="doc-export">
              <div className="doc-export-label">Export markdown</div>
              <div className="doc-export-btns">
                <button className="doc-btn" onClick={onCopy}>
                  <CopyIcon />
                  {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Copy to clipboard"}
                </button>
                <a className="doc-btn" href={exportUrl} download>
                  <DownloadIcon />
                  Save .md file
                </a>
              </div>
              <p className="doc-export-hint">Every annotated block, with its highlights and notes.</p>
            </div>

            <button className="doc-delete" disabled={busy} onClick={onDelete}>Delete document</button>
          </div>
        </div>
      )}
    </>
  );
}
