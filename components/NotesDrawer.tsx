"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { COLORS } from "@/lib/annotations/types";
import { compareSections } from "@/lib/tree/number";
import type { NoteEntry } from "@/lib/annotations/entries";
import { updateInlineAnnotation, deleteInlineAnnotation } from "@/lib/actions/annotations";
import { upsertNodeAnnotation, deleteNodeAnnotation } from "@/lib/actions/nodeAnnotations";
import { TagEditor } from "./TagEditor";
import { MarkdownTextarea } from "./MarkdownTextarea";
import { useNotesActions, useNotesState, useActiveAnnId } from "./NotesContext";

const MIN_W = 320;

// Rewrite "§2.2" tokens into markdown links (#section-2.2) so ReactMarkdown handles
// them, but only when the number resolves to a real node — unknown refs stay plain
// text. SectionLink then intercepts those hrefs (item 8).
function linkifySections(md: string, sections: Record<string, string>): string {
  return md.replace(/§\s*(\d+(?:\.\d+)*)/g, (m, num) => (sections[num] ? `[§${num}](#section-${num})` : m));
}

/** ReactMarkdown link override: a #section-N href becomes a blue in-app §link that
 * scrolls the prose to that node; everything else is a normal external link. */
function SectionLink({ href, children, ...rest }: ComponentPropsWithoutRef<"a">) {
  const { scrollToSection } = useNotesActions();
  if (href?.startsWith("#section-")) {
    const num = href.slice("#section-".length);
    return (
      <span
        className="xref"
        role="link"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); scrollToSection(num); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); scrollToSection(num); } }}
      >
        {children}
      </span>
    );
  }
  return <a href={href} target="_blank" rel="noreferrer" {...rest}>{children}</a>;
}

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
  const { sections, editingId } = useNotesState();
  const activeId = useActiveAnnId();
  // Context opens the editor (a freshly-created highlight, or "Edit note"); ✎ and
  // Save/Cancel override it locally. null = defer to context, so this works whether
  // the card was already mounted or mounts with the revalidation that created it.
  const [override, setOverride] = useState<boolean | null>(null);
  const editing = override ?? editingId === entry.id;
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
    setOverride(false);
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
          {entry.nodeLabel ?? ""}
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
          <MarkdownTextarea
            className="textarea note-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (Markdown)…"
            autoFocus
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
            <button className="link-btn" disabled={busy} onClick={() => { setOverride(false); setNote(entry.note ?? ""); setTags(entry.tags); }}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <div className="note-cardbody">
            {entry.note ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: SectionLink }}>
                {linkifySections(entry.note, sections)}
              </ReactMarkdown>
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
            <button className="icon-btn" aria-label="Edit note" title="Edit" onClick={() => setOverride(true)}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.1" style={{ display: "block" }}>
                <path d="M9.2 2.4l2.4 2.4M2 12l0.4-2.6 6.4-6.4 2.4 2.4-6.4 6.4L2 12z" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="icon-btn icon-btn--danger" aria-label="Delete note" title="Delete" disabled={busy} onClick={remove}>
              <svg width="13" height="13" viewBox="0 0 12 13" fill="none" stroke="currentColor" strokeWidth="1.1" style={{ display: "block" }}>
                <path d="M1 3.2h10M4.2 3.2V1.8h3.6v1.4M2.4 3.2l0.7 8.3h5.8l0.7-8.3M4.7 5.4v4M7.3 5.4v4" />
              </svg>
            </button>
            <span className="note-foot-spacer" />
            <span className="note-time">{timeAgo(entry.createdAt)}</span>
          </div>
        </>
      )}
    </div>
  );
}

/** A fresh node-note composer, slotted into the feed at its section's position (the
 * host computes it — the row doesn't exist yet, so there's nothing to sort). Node
 * notes can't be created empty (upsertNodeAnnotation rejects a blank note), which is
 * why this stays an unsaved placeholder instead of a real card in edit mode. */
function ComposeCard({ documentId, nodeId, number }: { documentId: string; nodeId: string; number?: string }) {
  const { closeDrawer, openAnnotation } = useNotesActions();
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!note.trim()) return;
    setBusy(true);
    const id = await upsertNodeAnnotation({ documentId, nodeId, note: note.trim(), tags });
    // Keep the drawer open and select the new note: revalidation repaints the real
    // card, which then renders active (highlighted) with its block embossed.
    openAnnotation(id, nodeId);
  }

  return (
    <div className="note-card note-card--active" data-card-id="compose">
      <div className="note-cardhead note-cardhead--compose">
        <span className="note-num note-num--node">{number ?? ""}</span>
        <span className="note-nodetitle">New note</span>
      </div>
      <MarkdownTextarea
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
  const { entries, sections, drawerOpen, composeNodeId, panelWidth, filterTag } = useNotesState();
  const { closeDrawer, toggleDrawer, setPanelWidth, setFilterTag } = useNotesActions();
  const activeId = useActiveAnnId();
  const listRef = useRef<HTMLDivElement>(null);

  const tags = [...new Set(entries.flatMap((e) => e.tags))];
  const shown = filterTag ? entries.filter((e) => e.tags.includes(filterTag)) : entries;

  // Slot the unsaved composer into document order rather than pinning it to the top,
  // so a new node note appears where it will live once saved. Its section sorts before
  // every entry at or past the same number (flattenEntries emits a node's own note
  // ahead of that node's highlights); past everything = last.
  const composeNumber = composeNodeId
    ? Object.keys(sections).find((k) => sections[k] === composeNodeId)
    : undefined;
  const firstAtOrAfter = composeNumber
    ? shown.findIndex((e) => e.nodeLabel && compareSections(e.nodeLabel, composeNumber) >= 0)
    : -1;
  // Also the no-composer case: at === shown.length renders the whole list, then nothing.
  const at = firstAtOrAfter === -1 ? shown.length : firstAtOrAfter;

  // Scroll the active card into view when the selection moves (item 6). The card's
  // highlight is persistent (note-card--active), not a transient flash — the last
  // selected annotation stays marked until the next selection. A composer has no
  // annotation id to be active, so it's tracked by its own sentinel id.
  const scrollTo = activeId ?? (composeNodeId ? "compose" : null);
  useEffect(() => {
    if (!drawerOpen || !scrollTo) return;
    const list = listRef.current;
    const card = list?.querySelector<HTMLElement>(`[data-card-id="${scrollTo}"]`);
    if (!list || !card) return;
    list.scrollTo({ top: card.offsetTop - list.offsetTop - 12, behavior: "smooth" });
  }, [drawerOpen, scrollTo]);

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
          {shown.slice(0, at).map((e) => (
            <EntryCard key={e.id} entry={e} documentId={documentId} />
          ))}
          {composeNodeId && (
            <ComposeCard documentId={documentId} nodeId={composeNodeId} number={composeNumber} />
          )}
          {shown.slice(at).map((e) => (
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
