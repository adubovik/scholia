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
        <button key={t} className="tag" onClick={() => onChange(tags.filter((x) => x !== t))}>
          {t} ×
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
        placeholder="tag"
      />
    </div>
  );
}
