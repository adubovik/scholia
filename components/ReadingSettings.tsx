"use client";

import { useEffect, useRef, useState } from "react";
import {
  CONTROLS, DEFAULT_INDICES, stepsToVars,
  readStoredIndices, writeStoredIndices, clearStoredIndices,
  type PrefKey, type PrefIndices,
} from "@/lib/reading/prefs";

// Display order + end-cap glyphs (small→large / tight→loose). Labels double as
// each slider's accessible name.
const ROWS: { key: PrefKey; label: string; lo: string; hi: string }[] = [
  { key: "size",  label: "Size",   lo: "A",  hi: "A"  },
  { key: "line",  label: "Line",   lo: "A",  hi: "A"  },
  { key: "word",  label: "Word",   lo: "›‹", hi: "‹›" },
  { key: "block", label: "Blocks", lo: "▤", hi: "▤" },
  { key: "width", label: "Width",  lo: "├┤", hi: "┃ ┃" },
];

function applyVars(indices: PrefIndices) {
  const vars = stepsToVars(indices);
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value);
  }
}

export function ReadingSettings() {
  const [open, setOpen] = useState(false);
  const [indices, setIndices] = useState<PrefIndices>(DEFAULT_INDICES);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // The pre-paint script already applied stored prefs to the CSS vars; on mount
  // we only mirror them into slider positions.
  useEffect(() => {
    setIndices(readStoredIndices());
  }, []);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function setOne(key: PrefKey, value: number) {
    const next = { ...indices, [key]: value };
    setIndices(next);
    applyVars(next);
    writeStoredIndices(next);
  }

  function reset() {
    setIndices(DEFAULT_INDICES);
    applyVars(DEFAULT_INDICES);
    clearStoredIndices();
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        className="reading-aa"
        aria-label="Display settings"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Aa
      </button>

      {open && (
        <div className="aa-backdrop" onClick={close}>
          <div
            className="aa-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Display settings"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aa-head">
              <span className="aa-eyebrow">Display</span>
              <button className="glyph" aria-label="Close" onClick={close}>✕</button>
            </div>

            {ROWS.map(({ key, label, lo, hi }) => (
              <label key={key} className="aa-row">
                <span className="aa-label">{label}</span>
                <span className="aa-cap" aria-hidden="true">{lo}</span>
                <input
                  type="range"
                  min={0}
                  max={CONTROLS[key].steps.length - 1}
                  step={1}
                  value={indices[key]}
                  aria-label={label}
                  onChange={(e) => setOne(key, Number(e.target.value))}
                />
                <span className="aa-cap" aria-hidden="true">{hi}</span>
              </label>
            ))}

            <button className="link-btn" onClick={reset}>Reset to defaults</button>
          </div>
        </div>
      )}
    </>
  );
}
