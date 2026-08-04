"use client";

import { useState } from "react";
import { displayTags } from "@/lib/annotations/glyphs";

/** Shared tag list + add/remove + input. Controlled: parent owns `tags`, this owns the
 * draft input. ":glyph" system tags stay in `tags` but aren't shown as chips here — the
 * glyph pill represents them; typing ":summary" simply lights up that glyph. */
export function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [tagInput, setTagInput] = useState("");
  const [adding, setAdding] = useState(false);

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setTagInput("");
  }

  return (
    <div className="note-tags">
      {displayTags(tags).map((t) => (
        // Same pill as the filter chips at the top of the drawer; click removes it.
        <button key={t} className="chip" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
          #{t} <span className="chip-x">×</span>
        </button>
      ))}
      {adding ? (
        <input
          className="tag-input"
          value={tagInput}
          autoFocus
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(); // keep the field open so several tags can be added in a row
            } else if (e.key === "Escape") {
              setTagInput("");
              setAdding(false);
            }
          }}
          // Commit a half-typed tag when focus leaves (e.g. clicking Save) — otherwise a
          // tag typed but not Enter'd is silently dropped — then collapse back to the +.
          onBlur={() => {
            addTag();
            setAdding(false);
          }}
          placeholder="add tag…"
        />
      ) : (
        // Collapsed by default: the input only appears on demand, keeping the editor tidy.
        <button type="button" className="tag-add" aria-label="Add tag" onClick={() => setAdding(true)}>
          +
        </button>
      )}
    </div>
  );
}
