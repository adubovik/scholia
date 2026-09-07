"use client";

import { Fragment, useMemo, useState } from "react";
import type { AiPreviewResult } from "@/lib/actions/ai-preview";
import type { PreviewLine } from "@/lib/tree/ai-structure";

/** One exchange in the preview conversation: what the reader asked (null for the
 * opening pass, which is just the text) and the structure the AI proposed back. */
export interface PreviewTurn {
  prompt: string | null;
  result: AiPreviewResult;
}

/** Expand the reader's strike-outs (each a node's contiguous anchor span) into the
 * flat set of paragraph anchors that get no node. */
function expand(cuts: ReadonlyMap<number, number>): Set<number> {
  const out = new Set<number>();
  for (const [from, to] of cuts) for (let a = from; a <= to; a++) out.add(a);
  return out;
}

/** The preview exactly as it reads on screen: indented by depth, removed lines
 * flagged. This is what the ⧉ button copies — the JSON lives behind {} instead. */
function asText(lines: PreviewLine[], cut: ReadonlySet<number>): string {
  return lines
    .map((l) => {
      const gone = l.kind === "dropped" || cut.has(l.anchor);
      const body = [l.title, l.kind === "heading" ? "" : l.text].filter(Boolean).join(" ");
      return "  ".repeat(l.depth) + (gone ? "[removed] " : "") + body;
    })
    .join("\n");
}

/** Copy-to-clipboard button that flips to ✓ for a moment. Stops the click short of
 * the <summary> it sits in, so copying never folds the reply shut. */
function CopyButton({ label, title, value }: { label: string; title: string; value: () => string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="tprev-copy"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard?.writeText(value());
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? "✓" : label}
    </button>
  );
}

/** Confirm-before-create preview of the AI-detected tree, as a conversation: the
 * opening pass, then any follow-up the reader sends ("drop everything after …"),
 * each reply foldable and copyable (⧉ rendered text, {} raw JSON) and each of the
 * reader's own messages editable + resendable.
 *
 * Kept paragraphs render nested (like the reading panel, long lines truncated);
 * dropped paragraphs show in place with a red/pink background. Lines of the LAST
 * reply — the one Accept creates from — can also be struck out by hand; striking a
 * heading takes its whole section with it. */
export function TreePreviewModal({
  turns,
  busy,
  error,
  onAccept,
  onSend,
  onCancel,
}: {
  turns: PreviewTurn[];
  busy: boolean;
  error: string | null;
  onAccept: (drop: number[]) => void;
  /** Replace the conversation from `index` on with `prompt` and ask again. */
  onSend: (index: number, prompt: string) => void;
  onCancel: () => void;
}) {
  const last = turns[turns.length - 1];
  // Keyed by the struck line's anchor → the last anchor of its subtree, so a
  // strike stays one reversible unit however many paragraphs it swallowed.
  const [cuts, setCuts] = useState<ReadonlyMap<number, number>>(new Map());
  const [ask, setAsk] = useState(""); // the composer at the foot
  const [editing, setEditing] = useState<number | null>(null); // turn whose prompt is being rewritten
  const [draft, setDraft] = useState("");
  const cut = useMemo(() => expand(cuts), [cuts]);

  const toggle = (anchor: number, last: number) =>
    setCuts((prev) => {
      const next = new Map(prev);
      if (!next.delete(anchor)) next.set(anchor, last);
      return next;
    });

  /** Ask again from `index` on. Strikes belong to the reply being replaced, so drop them. */
  const send = (index: number, prompt: string) => {
    if (!prompt.trim() || busy) return;
    setCuts(new Map());
    setAsk("");
    setEditing(null);
    onSend(index, prompt.trim());
  };

  const dropped = last.result.lines.filter((l) => l.kind === "dropped" || cut.has(l.anchor)).length;
  const kept = last.result.lines.length - dropped;
  const tokens = turns.reduce((n, t) => n + t.result.usage.totalTokens, 0);

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
            <span><strong>{tokens.toLocaleString()}</strong> tokens</span>
          </div>
        </div>
        <div className="newdoc-rule" />
        <p className="muted tprev-hint">
          Strike out anything the AI kept but you don’t want — a heading takes its whole section with
          it. Or ask below for a change and it will try again.
        </p>

        <div className="tprev-scroll">
          {turns.map((turn, i) => {
            const isLast = i === turns.length - 1;
            const lines = turn.result.lines;
            const gonecount = lines.filter((l) => l.kind === "dropped" || (isLast && cut.has(l.anchor))).length;
            return (
              <Fragment key={i}>
                {turn.prompt !== null &&
                  (editing === i ? (
                    <div className="tprev-msg tprev-msg--edit">
                      <textarea
                        className="textarea tprev-ask-input"
                        aria-label={`Edit request ${i}`}
                        value={draft}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      <div className="tprev-msg-actions">
                        <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                        <button type="button" className="btn" disabled={busy || !draft.trim()} onClick={() => send(i, draft)}>
                          Resend
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="tprev-msg">
                      <span className="tprev-msg-text">{turn.prompt}</span>
                      <button
                        type="button"
                        className="tprev-msg-edit"
                        title="Edit and send again"
                        aria-label={`Edit request ${i}`}
                        disabled={busy}
                        onClick={() => {
                          setEditing(i);
                          setDraft(turn.prompt!);
                        }}
                      >
                        ✎
                      </button>
                    </div>
                  ))}

                {/* Earlier replies stay folded; the newest is the one Accept builds from. */}
                <details className="tprev-resp" open={isLast}>
                  <summary className="tprev-resp-head">
                    <span className="tprev-resp-name">{i === 0 ? "First reply" : `Reply ${i + 1}`}</span>
                    <span className="tprev-resp-stats">
                      {lines.length - gonecount} kept · {gonecount} removed ·{" "}
                      {turn.result.usage.totalTokens.toLocaleString()} tokens · {turn.result.model}
                    </span>
                    <CopyButton
                      label="⧉"
                      title={`Copy reply ${i + 1} as text`}
                      value={() => asText(lines, isLast ? cut : new Set())}
                    />
                    <CopyButton
                      label="{}"
                      title={`Copy reply ${i + 1} as JSON`}
                      value={() => JSON.stringify({ nodes: turn.result.tree }, null, 2)}
                    />
                  </summary>

                  {lines.map((l) => {
                    const struck = isLast && cuts.has(l.anchor); // the line the reader clicked
                    const gone = l.kind === "dropped" || (isLast && cut.has(l.anchor));
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
                        {/* Only the newest reply is editable by hand, and only the reader's own
                            strikes are reversible: an AI-dropped line has no node to put back. */}
                        {isLast && (struck || (l.kind !== "dropped" && !gone)) && (
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
                </details>
              </Fragment>
            );
          })}
        </div>

        <div className="tprev-ask">
          <textarea
            className="textarea tprev-ask-input"
            placeholder="Ask for a change — e.g. “Remove all the text blocks after ‘See every Dover book in print…’” (⌘↵ to send)"
            aria-label="Ask for a change"
            value={ask}
            disabled={busy}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send(turns.length, ask);
              }
            }}
          />
          <button type="button" className="btn btn--ghost" disabled={busy || !ask.trim()} onClick={() => send(turns.length, ask)}>
            {busy ? "Thinking…" : "Send"}
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="tprev-actions">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={busy || kept === 0} onClick={() => onAccept([...cut])}>
            {busy ? "Working…" : "Accept & create"}
          </button>
        </div>
      </div>
    </div>
  );
}
