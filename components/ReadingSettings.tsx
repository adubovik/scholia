"use client";

import { useEffect, useRef, useState } from "react";
import {
  CONTROLS, DEFAULT_INDICES, stepsToVars,
  readStoredIndices, writeStoredIndices, clearStoredIndices,
  DEFAULT_HL_MODE, applyHlMode, readStoredHlMode, writeStoredHlMode,
  DEFAULT_ID_MODE, applyIdMode, readStoredIdMode, writeStoredIdMode,
  type PrefKey, type PrefIndices, type HlMode, type IdMode,
} from "@/lib/reading/prefs";

// Highlight display-mode options, in display order.
const HL_MODES: { value: HlMode; label: string }[] = [
  { value: "filled", label: "Filled" },
  { value: "underline", label: "Underline" },
];

// Section-id display options — the label doubles as a real sample of the citation
// each mode shows (short = the node's own id, long = the full compound path).
const ID_MODES: { value: IdMode; label: string }[] = [
  { value: "short", label: "LXI" },
  { value: "long", label: "IV.Prop.LXI" },
];

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

export function ReadingSettings({ triggerClassName = "reading-aa" }: { triggerClassName?: string } = {}) {
  const [open, setOpen] = useState(false);
  const [indices, setIndices] = useState<PrefIndices>(DEFAULT_INDICES);
  const [hlMode, setHlMode] = useState<HlMode>(DEFAULT_HL_MODE);
  const [idMode, setIdMode] = useState<IdMode>(DEFAULT_ID_MODE);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // The pre-paint script already applied stored prefs to the CSS vars; on mount
  // we only mirror them into slider positions. Reading localStorage during
  // render would break SSR, so the one-shot mount effect is the intended path.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration mirror, see above
    setIndices(readStoredIndices());
    setHlMode(readStoredHlMode());
    setIdMode(readStoredIdMode());
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

  function setMode(mode: HlMode) {
    setHlMode(mode);
    applyHlMode(mode);
    writeStoredHlMode(mode);
  }

  function setIds(mode: IdMode) {
    setIdMode(mode);
    applyIdMode(mode);
    writeStoredIdMode(mode);
  }

  function reset() {
    setIndices(DEFAULT_INDICES);
    applyVars(DEFAULT_INDICES);
    clearStoredIndices();
    setMode(DEFAULT_HL_MODE);
    setIds(DEFAULT_ID_MODE);
  }

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    const getFocusable = () =>
      sheet
        ? Array.from(
            sheet.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => !el.hasAttribute("disabled"))
        : [];

    // Move focus into the sheet on open (first focusable — the Close button).
    getFocusable()[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "Tab") {
        const items = getFocusable();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        className={triggerClassName}
        aria-label="Display settings"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Aa
      </button>

      {open && (
        <div className="aa-backdrop" onClick={close}>
          <div
            ref={sheetRef}
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

            {ROWS.map(({ key, label, lo, hi }) => {
              const count = CONTROLS[key].steps.length;
              return (
                <label key={key} className="aa-row">
                  <span className="aa-label">{label}</span>
                  <span className="aa-cap" aria-hidden="true">{lo}</span>
                  <span className="aa-slider">
                    {/* One tick per step, aligned to the thumb's stops. */}
                    <span className="aa-ticks" aria-hidden="true">
                      {Array.from({ length: count }, (_, i) => (
                        <span key={i} className="aa-tick" />
                      ))}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={count - 1}
                      step={1}
                      value={indices[key]}
                      aria-label={label}
                      onChange={(e) => setOne(key, Number(e.target.value))}
                    />
                  </span>
                  <span className="aa-cap" aria-hidden="true">{hi}</span>
                </label>
              );
            })}

            <div className="aa-modrow">
              <span className="aa-label">Marks</span>
              <span className="aa-seg" role="group" aria-label="Highlight display">
                {HL_MODES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className="aa-seg-btn"
                    data-mode={value}
                    aria-pressed={hlMode === value}
                    onClick={() => setMode(value)}
                  >
                    {/* the label doubles as a live sample of the mode it selects */}
                    <span className="aa-seg-sample">{label}</span>
                  </button>
                ))}
              </span>
            </div>

            <div className="aa-modrow">
              <span className="aa-label">Section ids</span>
              <span className="aa-seg" role="group" aria-label="Section id display">
                {ID_MODES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className="aa-seg-btn"
                    data-mode={value}
                    aria-pressed={idMode === value}
                    onClick={() => setIds(value)}
                  >
                    {/* the label is a real sample of the citation this mode shows */}
                    <span className="aa-seg-sample aa-seg-id">{label}</span>
                  </button>
                ))}
              </span>
            </div>

            <button className="link-btn" onClick={reset}>Reset to defaults</button>
          </div>
        </div>
      )}
    </>
  );
}
