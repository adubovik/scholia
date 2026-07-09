"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NodeAnnotationView } from "@/lib/annotations/types";
import { upsertNodeAnnotation, deleteNodeAnnotation } from "@/lib/actions/nodeAnnotations";
import { TagEditor } from "./TagEditor";

export function NodeNote({
  documentId,
  nodeId,
  annotation,
  canEdit,
  onClose,
}: {
  documentId: string;
  nodeId: string;
  annotation: NodeAnnotationView | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(canEdit && !annotation);
  const [note, setNote] = useState(annotation?.note ?? "");
  const [tags, setTags] = useState<string[]>(annotation?.tags ?? []);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!note.trim()) return; // note is required (matches the not-null invariant)
    setBusy(true);
    await upsertNodeAnnotation({ documentId, nodeId, note: note.trim(), tags });
    setBusy(false);
    // On create there is no annotation prop yet, so view mode would render a stale
    // "No note." until revalidation. Close instead — the revalidated tree repaints a
    // solid dot, and reopening shows the note fresh. On edit, stay in view mode.
    if (annotation) setEditing(false);
    else onClose();
  }
  async function remove() {
    if (!annotation) {
      onClose();
      return;
    }
    setBusy(true);
    await deleteNodeAnnotation(annotation.id);
    onClose();
  }

  return (
    <aside className="inline-note node-note" data-node-id={nodeId}>
      {editing ? (
        <>
          <textarea
            className="textarea note-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (Markdown)…"
          />
          <TagEditor tags={tags} onChange={setTags} />
          <div className="note-actions">
            <button className="btn" disabled={busy || !note.trim()} onClick={save}>Save</button>
            <button className="link-btn" disabled={busy} onClick={annotation ? () => setEditing(false) : onClose}>Cancel</button>
            {annotation && (
              <button className="link-btn link-btn--danger" disabled={busy} onClick={remove}>Delete</button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="note-body">
            {annotation ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{annotation.note}</ReactMarkdown>
            ) : (
              <span className="muted">No note.</span>
            )}
          </div>
          {annotation && annotation.tags.length > 0 && (
            <div className="note-tags">
              {annotation.tags.map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
          )}
          <div className="note-actions">
            {canEdit && (
              <button className="link-btn" onClick={() => setEditing(true)}>Edit</button>
            )}
            <button className="link-btn" onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </aside>
  );
}
