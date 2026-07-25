"use client";

import { useState } from "react";

/** Shared tag list + add/remove + input. Controlled: parent owns `tags`, this owns the draft input. */
export function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [tagInput, setTagInput] = useState("");

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setTagInput("");
  }

  return (
    <div className="note-tags">
      {tags.map((t) => (
        // Same pill as the filter chips at the top of the drawer; click removes it.
        <button key={t} className="chip" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
          #{t} <span className="chip-x">×</span>
        </button>
      ))}
      <input
        className="tag-input"
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag();
          }
        }}
        // Commit a half-typed tag when focus leaves (e.g. clicking Save) — otherwise
        // a tag typed but not Enter'd is silently dropped and never renders/filters.
        onBlur={addTag}
        placeholder="add tag…"
      />
    </div>
  );
}
