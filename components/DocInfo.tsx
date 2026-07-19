"use client";

import { useState } from "react";
import { deleteDocument } from "@/lib/actions/documents";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const fmtDate = (iso: string) => fmt.format(new Date(iso)).toUpperCase();

export interface DocMeta {
  documentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  highlightCount: number;
  noteCount: number;
}

/** Reading-header ⚙ → document metadata sheet. Origin/author rows are omitted:
 * the schema stores neither, so only the fields we actually have are shown. */
export function DocInfo({ meta }: { meta: DocMeta }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!window.confirm(`Delete “${meta.title}”? This removes the text and every annotation on it.`)) return;
    setBusy(true);
    await deleteDocument(meta.documentId); // redirects home
  }

  return (
    <>
      <button className="reading-headbtn reading-headbtn--icon" aria-label="Document info" title="Document info" onClick={() => setOpen(true)}>
        ⚙
      </button>

      {open && (
        <div className="aa-backdrop" onClick={() => setOpen(false)}>
          <div className="doc-sheet" role="dialog" aria-modal="true" aria-label="Document info" onClick={(e) => e.stopPropagation()}>
            <div className="doc-sheet-head">
              <div>
                <div className="doc-sheet-eyebrow">Document</div>
                <h2 className="doc-sheet-title">{meta.title}</h2>
              </div>
              <button className="glyph" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="doc-sheet-grid">
              <div className="doc-sheet-key">Added</div>
              <div className="doc-sheet-val">{fmtDate(meta.createdAt)}</div>
              <div className="doc-sheet-key">Updated</div>
              <div className="doc-sheet-val">{fmtDate(meta.updatedAt)}</div>
              <div className="doc-sheet-key">Stats</div>
              <div className="doc-sheet-val doc-sheet-stats">
                <span>§ {meta.nodeCount} nodes</span>
                <span className="doc-sheet-stat"><span className="stat-hl" />{meta.highlightCount} highlights</span>
                <span>¶ {meta.noteCount} notes</span>
              </div>
            </div>

            <button className="doc-delete" disabled={busy} onClick={onDelete}>Delete document</button>
          </div>
        </div>
      )}
    </>
  );
}
