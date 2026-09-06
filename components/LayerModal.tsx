"use client";

import { useState } from "react";
import { LAYER_COLORS } from "@/lib/annotations/types";
import { createLayer, updateLayer } from "@/lib/actions/layers";
import { useLayers } from "./LayerContext";

/**
 * "Create a view" / "Rename view" — a name and a pastel, over the reading screen.
 * Follows the NewDocModal backdrop+sheet pattern rather than pulling in a dialog
 * library for two fields. Creating from a node menu drops you straight into writing
 * that node's text in the new view (see `created`).
 */
export function LayerModal({ documentId }: { documentId: string }) {
  const { sheet } = useLayers();
  // Mounted only while open, and keyed by target, so the draft always starts from the
  // view being edited (a sheet kept mounted would hold the previous one's name).
  if (!sheet) return null;
  return <LayerSheet key={sheet.layer?.id ?? "new"} documentId={documentId} />;
}

function LayerSheet({ documentId }: { documentId: string }) {
  const { sheet, closeSheet, created } = useLayers();
  const editing = sheet?.layer ?? null;
  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState<string>(editing?.color ?? LAYER_COLORS[0]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (editing) {
        await updateLayer({ id: editing.id, name, color });
        closeSheet();
      } else {
        const id = await createLayer({ documentId, name, color });
        created(id, sheet?.nodeId ?? null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="newdoc-backdrop" onClick={closeSheet}>
      <form
        className="newdoc-sheet layer-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Rename view" : "Create a view"}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="newdoc-head">
          <div>
            <p className="import-eyebrow">{editing ? "View" : "New view"}</p>
            <h2 className="newdoc-title">{editing ? "Rename this view" : "Create a view"}</h2>
          </div>
          <button type="button" className="glyph" aria-label="Close" onClick={closeSheet}>✕</button>
        </div>
        <div className="newdoc-rule" />
        <p className="layer-sheet-hint">
          A second rendition of the same text — a summary of your own, a translation, another edition.
        </p>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Summarization"
          aria-label="View name"
          maxLength={40}
          autoFocus
        />
        <div className="layer-swatches">
          {LAYER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={c === color ? "layer-swatch layer-swatch--active" : "layer-swatch"}
              data-layer-color={c}
              aria-label={`Colour ${c}`}
              aria-pressed={c === color}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="note-actions">
          <button className="btn" type="submit" disabled={busy || !name.trim()}>
            {editing ? "Save" : "Create"}
          </button>
          <button className="link-btn" type="button" onClick={closeSheet}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
