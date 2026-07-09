"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { COLORS, type InlineAnnotationView } from "@/lib/annotations/types";
import { updateInlineAnnotation, deleteInlineAnnotation } from "@/lib/actions/annotations";
import { TagEditor } from "./TagEditor";

export function InlineNote({
  annotation,
  canEdit,
  onClose,
}: {
  annotation: InlineAnnotationView;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(canEdit && !annotation.note);
  const [note, setNote] = useState(annotation.note ?? "");
  const [tags, setTags] = useState<string[]>(annotation.tags);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await updateInlineAnnotation({ id: annotation.id, note: note.trim() || null, tags });
    setBusy(false);
    setEditing(false);
  }
  async function remove() {
    setBusy(true);
    await deleteInlineAnnotation(annotation.id);
    onClose();
  }

  return (
    <aside
      className="inline-note"
      data-annotation-id={annotation.id}
      style={{ borderLeftColor: `var(--hl-${annotation.color})` }}
    >
      {editing ? (
        <>
          <textarea
            className="textarea note-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (Markdown)…"
          />
          <div className="note-colors">
            {COLORS.map((c) => (
              <button
                key={c}
                className={c === annotation.color ? "swatch swatch--active" : "swatch"}
                aria-label={`Recolor ${c}`}
                aria-pressed={c === annotation.color}
                style={{ background: `var(--hl-${c})` }}
                onClick={() => void updateInlineAnnotation({ id: annotation.id, color: c })}
              />
            ))}
          </div>
          <TagEditor tags={tags} onChange={setTags} />
          <div className="note-actions">
            <button className="btn" disabled={busy} onClick={save}>Save</button>
            <button className="link-btn" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
            <button className="link-btn link-btn--danger" disabled={busy} onClick={remove}>Delete</button>
          </div>
        </>
      ) : (
        <>
          <div className="note-body">
            {annotation.note ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{annotation.note}</ReactMarkdown>
            ) : (
              <span className="muted">No note.</span>
            )}
          </div>
          {annotation.tags.length > 0 && (
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
