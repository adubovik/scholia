"use client";

import { useState } from "react";
import { COLORS } from "@/lib/annotations/types";
import { TagEditor } from "./TagEditor";
import { GlyphToggle } from "./GlyphPill";
import { glyphsInTags, toggleGlyphTag } from "@/lib/annotations/glyphs";
import { MarkdownTextarea } from "./MarkdownTextarea";

/** The full note editor — body + colour (inline only) + #tags + preset glyphs — lifted
 * out of the old card list so the annotation tree carries every editing affordance the
 * drawer used to. Mounts fresh per edit, so its draft state always starts from the
 * current note. */
export function NoteEditor({
  kind,
  note: initialNote,
  tags: initialTags,
  color: initialColor,
  canDelete,
  onSave,
  onCancel,
  onDelete,
}: {
  kind: "node" | "inline";
  note: string;
  tags: string[];
  color: string | null;
  canDelete: boolean;
  onSave: (v: { note: string; tags: string[]; color: string | null }) => Promise<void> | void;
  onCancel: () => void;
  onDelete: () => Promise<void> | void;
}) {
  const [note, setNote] = useState(initialNote);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [color, setColor] = useState<string | null>(initialColor);
  const [busy, setBusy] = useState(false);

  async function save() { setBusy(true); await onSave({ note, tags, color }); setBusy(false); }
  async function del() { setBusy(true); await onDelete(); setBusy(false); }

  return (
    <div className="dual-editor">
      <MarkdownTextarea
        className="textarea note-textarea"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (Markdown)…"
        autoFocus
      />
      {kind === "inline" && (
        <div className="note-colors">
          {COLORS.map((c) => (
            <button
              key={c}
              className={c === color ? "swatch swatch--active" : "swatch"}
              aria-label={`Recolor ${c}`}
              style={{ background: `var(--hl-${c})` }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      )}
      <TagEditor tags={tags} onChange={setTags} />
      <div className="note-glyphs">
        <GlyphToggle active={glyphsInTags(tags)} onToggle={(g) => setTags(toggleGlyphTag(tags, g))} />
      </div>
      <div className="note-actions">
        <button className="btn" disabled={busy} onClick={save}>Save</button>
        <button className="link-btn" disabled={busy} onClick={onCancel}>Cancel</button>
        {canDelete && <button className="link-btn link-btn--danger" disabled={busy} onClick={del}>Delete note</button>}
      </div>
    </div>
  );
}
