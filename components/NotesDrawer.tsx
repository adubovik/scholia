"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { COLORS } from "@/lib/annotations/types";
import type { NoteEntry } from "@/lib/annotations/entries";
import { updateInlineAnnotation, deleteInlineAnnotation } from "@/lib/actions/annotations";
import { upsertNodeAnnotation, deleteNodeAnnotation } from "@/lib/actions/nodeAnnotations";
import { TagEditor } from "./TagEditor";
import { useNotesActions, useNotesState } from "./NotesContext";

const MIN_W = 320;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.round((then - Date.now()) / 1000); // negative = past
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000], ["month", 2592000], ["day", 86400],
    ["hour", 3600], ["minute", 60],
  ];
  for (const [unit, s] of units) {
    if (Math.abs(secs) >= s) return rtf.format(Math.round(secs / s), unit);
  }
  return "just now";
}

/** A saved annotation: view mode + inline editor, mutating via the existing server actions. */
function EntryCard({ entry, documentId }: { entry: NoteEntry; documentId: string }) {
  const { locate, setFilterTag } = useNotesActions();
  const { activeId } = useNotesState();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(entry.note ?? "");
  const [tags, setTags] = useState<string[]>(entry.tags);
  const [busy, setBusy] = useState(false);
  const isActive = activeId === entry.id;

  async function save() {
    setBusy(true);
    if (entry.kind === "inline") {
      await updateInlineAnnotation({ id: entry.id, note: note.trim() || null, tags });
    } else {
      // Node notes are not-null by invariant; an emptied node note is a delete.
      if (note.trim()) await upsertNodeAnnotation({ documentId, nodeId: entry.nodeId, note: note.trim(), tags });
      else await deleteNodeAnnotation(entry.id);
    }
    setBusy(false);
    setEditing(false);
  }

  async function remove() {
    setBusy(true);
    if (entry.kind === "inline") await deleteInlineAnnotation(entry.id);
    else await deleteNodeAnnotation(entry.id);
  }

  return (
    <div
      data-card-id={entry.id}
      className={isActive ? "note-card note-card--active" : "note-card"}
    >
      <button className="note-cardhead" onClick={() => locate(entry)}>
        <span className={entry.kind === "inline" ? "note-num note-num--inline" : "note-num note-num--node"}>
          {entry.nodeLabel ?? "¶"}
        </span>
        {entry.kind === "inline" ? (
          <span className="note-snippet" style={{ background: `var(--hl-${entry.color})` }}>
            {entry.snippet}
          </span>
        ) : (
          entry.nodeTitle && <span className="note-nodetitle">{entry.nodeTitle}</span>
        )}
      </button>

      {editing ? (
        <>
          <textarea
            className="textarea note-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (Markdown)…"
          />
          {entry.kind === "inline" && (
            <div className="note-colors">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={c === entry.color ? "swatch swatch--active" : "swatch"}
                  aria-label={`Recolor ${c}`}
                  style={{ background: `var(--hl-${c})` }}
                  onClick={() => void updateInlineAnnotation({ id: entry.id, color: c })}
                />
              ))}
            </div>
          )}
          <TagEditor tags={tags} onChange={setTags} />
          <div className="note-actions">
            <button className="btn" disabled={busy} onClick={save}>Save</button>
            <button className="link-btn" disabled={busy} onClick={() => { setEditing(false); setNote(entry.note ?? ""); setTags(entry.tags); }}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <div className="note-cardbody">
            {entry.note ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.note}</ReactMarkdown>
            ) : (
              <span className="muted">No note.</span>
            )}
          </div>
          {entry.tags.length > 0 && (
            <div className="note-cardtags">
              {entry.tags.map((t) => (
                <button key={t} className="chip" onClick={() => setFilterTag(t)}>#{t}</button>
              ))}
            </div>
          )}
          <div className="note-cardfoot">
            <span className="note-time">{timeAgo(entry.createdAt)}</span>
            <span className="note-foot-spacer" />
            <button className="icon-btn" aria-label="Edit note" title="Edit" onClick={() => setEditing(true)}>✎</button>
            <button className="icon-btn icon-btn--danger" aria-label="Delete note" title="Delete" disabled={busy} onClick={remove}>
              <svg width="12" height="13" viewBox="0 0 12 13" fill="none" stroke="currentColor" strokeWidth="1.1" style={{ display: "block" }}>
                <path d="M1 3.2h10M4.2 3.2V1.8h3.6v1.4M2.4 3.2l0.7 8.3h5.8l0.7-8.3M4.7 5.4v4M7.3 5.4v4" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** A fresh node-note composer, shown at the top of the list when the menu asks for one. */
function ComposeCard({ documentId, nodeId }: { documentId: string; nodeId: string }) {
  const { closeDrawer } = useNotesActions();
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!note.trim()) return;
    setBusy(true);
    await upsertNodeAnnotation({ documentId, nodeId, note: note.trim(), tags });
    // Revalidation repaints the tree + drawer with the real card; close the composer.
    closeDrawer();
  }

  return (
    <div className="note-card note-card--active">
      <div className="note-cardhead note-cardhead--compose">
        <span className="note-num note-num--node">¶</span>
        <span className="note-nodetitle">New note</span>
      </div>
      <textarea
        className="textarea note-textarea"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (Markdown)…"
        autoFocus
      />
      <TagEditor tags={tags} onChange={setTags} />
      <div className="note-actions">
        <button className="btn" disabled={busy || !note.trim()} onClick={save}>Save</button>
        <button className="link-btn" disabled={busy} onClick={closeDrawer}>Cancel</button>
      </div>
    </div>
  );
}

export function NotesDrawer({ documentId }: { documentId: string }) {
  const { entries, drawerOpen, activeId, composeNodeId, panelWidth, filterTag } = useNotesState();
  const { closeDrawer, toggleDrawer, setPanelWidth, setFilterTag } = useNotesActions();
  const listRef = useRef<HTMLDivElement>(null);

  const tags = [...new Set(entries.flatMap((e) => e.tags))];
  const shown = filterTag ? entries.filter((e) => e.tags.includes(filterTag)) : entries;

  // Scroll the active card into view + flash it when a highlight opens the drawer.
  useEffect(() => {
    if (!drawerOpen || !activeId) return;
    const list = listRef.current;
    const card = list?.querySelector<HTMLElement>(`[data-card-id="${activeId}"]`);
    if (!list || !card) return;
    list.scrollTo({ top: card.offsetTop - list.offsetTop - 12, behavior: "smooth" });
    card.classList.add("note-flash");
    const t = window.setTimeout(() => card.classList.remove("note-flash"), 900);
    return () => window.clearTimeout(t);
  }, [drawerOpen, activeId]);

  // Edge handle: click (when closed) toggles; drag (when open) resizes.
  function onHandleDown(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const wasOpen = drawerOpen;
    let moved = false;
    function onMove(ev: PointerEvent) {
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      if (!wasOpen) return;
      const w = window.innerWidth - ev.clientX;
      if (w < MIN_W - 60) { cleanup(); closeDrawer(); return; }
      setPanelWidth(Math.max(MIN_W, Math.min(w, window.innerWidth - 320)));
    }
    function onUp() {
      cleanup();
      if (!moved) toggleDrawer();
    }
    function cleanup() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return (
    <>
      {drawerOpen && <div className="notes-backdrop" onClick={closeDrawer} />}

      <button
        className="notes-edge"
        aria-label="Toggle notes drawer"
        style={{ right: drawerOpen ? panelWidth : 0, cursor: drawerOpen ? "col-resize" : "pointer" }}
        onPointerDown={onHandleDown}
      >
        <span className="notes-edge-grip" />
      </button>

      <aside
        className="notes-drawer"
        data-open={drawerOpen}
        style={{ width: panelWidth }}
        aria-hidden={!drawerOpen}
      >
        <div className="notes-head">
          <span className="notes-title">Notes · {entries.length}</span>
          <button className="glyph" aria-label="Close" onClick={closeDrawer}>✕</button>
        </div>

        {tags.length > 0 && (
          <div className="notes-filters">
            <button
              className={filterTag ? "chip" : "chip chip--active"}
              onClick={() => setFilterTag(null)}
            >
              All
            </button>
            {tags.map((t) => (
              <button
                key={t}
                className={filterTag === t ? "chip chip--active" : "chip"}
                onClick={() => setFilterTag(t)}
              >
                #{t}
              </button>
            ))}
          </div>
        )}

        <div className="notes-list" ref={listRef}>
          {composeNodeId && <ComposeCard documentId={documentId} nodeId={composeNodeId} />}
          {shown.map((e) => (
            <EntryCard key={e.id} entry={e} documentId={documentId} />
          ))}
          {shown.length === 0 && !composeNodeId && (
            <div className="notes-empty">No annotations match this filter.</div>
          )}
        </div>
      </aside>
    </>
  );
}
