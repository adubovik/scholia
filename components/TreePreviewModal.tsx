"use client";

import type { AiPreviewResult } from "@/lib/actions/ai-preview";

/** Confirm-before-create preview of the AI-detected tree. Kept paragraphs render
 * nested (like the reading panel, long lines truncated); dropped paragraphs show
 * in place with a red/pink background. Shows token usage + Accept/Cancel. */
export function TreePreviewModal({
  result,
  busy,
  error,
  onAccept,
  onCancel,
}: {
  result: AiPreviewResult;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const { usage } = result;
  return (
    <div className="tprev-backdrop" onClick={busy ? undefined : onCancel}>
      <div
        className="tprev-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="AI-detected structure"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tprev-head">
          <div>
            <p className="import-eyebrow">Preview</p>
            <h2 className="newdoc-title">AI-detected structure</h2>
          </div>
          <div className="tprev-stats">
            <span><strong>{result.kept}</strong> kept</span>
            <span className="tprev-stat-dropped"><strong>{result.dropped}</strong> removed</span>
            <span><strong>{usage.totalTokens.toLocaleString()}</strong> tokens</span>
          </div>
        </div>
        <div className="newdoc-rule" />

        <div className="tprev-scroll">
          {result.lines.map((l, i) => (
            <div
              key={i}
              className={`tprev-line tprev-${l.kind}`}
              style={{ paddingLeft: `${0.25 + l.depth * 1.1}rem` }}
            >
              {l.kind === "dropped" && <span className="tprev-tag">removed</span>}
              {l.title && <span className="tprev-title">{l.title}</span>}
              {l.kind !== "heading" && l.text && <span className="tprev-text">{l.text}</span>}
            </div>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="tprev-actions">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onAccept}>
            {busy ? "Creating…" : "Accept & create"}
          </button>
        </div>
      </div>
    </div>
  );
}
