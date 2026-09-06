"use client";

import { useMemo, useState } from "react";
import type { AiPreviewResult } from "@/lib/actions/ai-preview";

/** Expand the reader's strike-outs (each a node's contiguous anchor span) into the
 * flat set of paragraph anchors that get no node. */
function expand(cuts: ReadonlyMap<number, number>): Set<number> {
  const out = new Set<number>();
  for (const [from, to] of cuts) for (let a = from; a <= to; a++) out.add(a);
  return out;
}

/** Confirm-before-create preview of the AI-detected tree. Kept paragraphs render
 * nested (like the reading panel, long lines truncated); dropped paragraphs show
 * in place with a red/pink background. Each kept line can be struck out by hand —
 * striking a heading takes its whole section with it — and put back again.
 * Shows token usage + Accept/Cancel. */
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
  onAccept: (drop: number[]) => void;
  onCancel: () => void;
}) {
  const { usage } = result;
  // Keyed by the struck line's anchor → the last anchor of its subtree, so a
  // strike stays one reversible unit however many paragraphs it swallowed.
  const [cuts, setCuts] = useState<ReadonlyMap<number, number>>(new Map());
  const cut = useMemo(() => expand(cuts), [cuts]);

  const toggle = (anchor: number, last: number) =>
    setCuts((prev) => {
      const next = new Map(prev);
      if (!next.delete(anchor)) next.set(anchor, last);
      return next;
    });

  const dropped = result.lines.filter((l) => l.kind === "dropped" || cut.has(l.anchor)).length;
  const kept = result.lines.length - dropped;

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
            <span><strong>{kept}</strong> kept</span>
            <span className="tprev-stat-dropped"><strong>{dropped}</strong> removed</span>
            <span><strong>{usage.totalTokens.toLocaleString()}</strong> tokens</span>
          </div>
        </div>
        <div className="newdoc-rule" />
        <p className="muted tprev-hint">
          Strike out anything the AI kept but you don’t want — a heading takes its whole section with it.
        </p>

        <div className="tprev-scroll">
          {result.lines.map((l) => {
            const struck = cuts.has(l.anchor); // the line the reader clicked
            const gone = l.kind === "dropped" || cut.has(l.anchor);
            const span = l.last - l.anchor + 1;
            return (
              <div
                key={l.anchor}
                className={`tprev-line tprev-${gone ? "dropped" : l.kind}`}
                style={{ paddingLeft: `${0.25 + l.depth * 1.1}rem` }}
              >
                <span className="tprev-body">
                  {gone && <span className="tprev-tag">removed</span>}
                  {l.title && <span className="tprev-title">{l.title}</span>}
                  {l.kind !== "heading" && l.text && <span className="tprev-text">{l.text}</span>}
                </span>
                {/* Only the reader's own strikes are reversible: an AI-dropped line
                    has no node in the tree to put back. */}
                {(struck || (l.kind !== "dropped" && !gone)) && (
                  <button
                    type="button"
                    className="tprev-cut"
                    title={struck ? "Put back" : span > 1 ? `Remove this and the ${span - 1} paragraphs under it` : "Remove"}
                    aria-label={`${struck ? "Put back" : "Remove"} paragraph ${l.anchor}`}
                    onClick={() => toggle(l.anchor, l.last)}
                  >
                    {struck ? "↩" : "✕"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="tprev-actions">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={busy || kept === 0} onClick={() => onAccept([...cut])}>
            {busy ? "Creating…" : "Accept & create"}
          </button>
        </div>
      </div>
    </div>
  );
}
