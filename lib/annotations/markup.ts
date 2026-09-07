/**
 * The bracket syntax that makes a passage editable without losing its highlights.
 *
 * A node's prose is rendered for editing with each highlight wrapped in a
 * Markdown-reference-shaped marker:
 *
 *     Text text blah [something][1] and [something else][2]
 *
 * Reading it back, the marker positions ARE the new anchors — so moving a phrase,
 * fixing a typo inside a highlight, or rewriting the prose around one all keep the
 * highlight on the words it was put on. That is why editing goes through this rather
 * than through an offset diff: character arithmetic can only guess where a highlight
 * went, the markup says.
 *
 * The syntax can express neither an overlapping pair nor a span that runs past the
 * node, so passages holding one are not editable this way (`isMarkupEditable`), and
 * the marker set must come back exactly as it went out — every index once, no new
 * ones. Adding and removing highlights is the selection popover's job.
 */

export interface AnnSpan {
  id: string;
  startOffset: number;
  endOffset: number;
}

/** Marker order: where the highlight sits in the passage, so [1] is the first one you
 *  read. Total and deterministic — the client and the server must number identically. */
export function markupOrder<T extends AnnSpan>(anns: T[]): T[] {
  return [...anns].sort(
    (a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset || (a.id < b.id ? -1 : 1),
  );
}

/**
 * Whether this passage's highlights can be written as markup: each wholly inside the
 * node `[start, end)`, none overlapping its neighbour. One pass over them in order —
 * a highlight that begins before the previous one ended (or before the node does)
 * fails the same test.
 */
export function isMarkupEditable(anns: AnnSpan[], start: number, end: number): boolean {
  let prevEnd = start;
  for (const a of markupOrder(anns)) {
    if (a.startOffset < prevEnd || a.endOffset > end) return false;
    prevEnd = a.endOffset;
  }
  return true;
}

/** The node's text with its highlights marked up. `start` is the node's source offset. */
export function toMarkup(text: string, start: number, anns: AnnSpan[]): string {
  let out = "";
  let at = 0;
  markupOrder(anns).forEach((a, i) => {
    const from = a.startOffset - start;
    const to = a.endOffset - start;
    out += `${text.slice(at, from)}[${text.slice(from, to)}][${i + 1}]`;
    at = to;
  });
  return out + text.slice(at);
}

export type MarkupParse =
  | { ok: true; text: string; spans: { index: number; start: number; end: number }[] }
  | { ok: false; error: string };

/**
 * Read the edited markup back: the plain text, and where each numbered highlight
 * landed in it. `count` is how many the node has — the marker set must be exactly
 * 1…count, each once, each still covering something.
 *
 * `[^\]]*` for the span body means a bare editorial `[sic]` stays literal unless a
 * `[n]` follows it, and a bracket nested inside a marker fails the index check rather
 * than silently re-anchoring anything.
 */
export function fromMarkup(markup: string, count: number): MarkupParse {
  const re = /\[([^\]]*)\]\[(\d+)\]/g;
  const spans: { index: number; start: number; end: number }[] = [];
  let text = "";
  let at = 0;
  for (let m = re.exec(markup); m; m = re.exec(markup)) {
    text += markup.slice(at, m.index);
    const start = text.length;
    text += m[1];
    spans.push({ index: Number(m[2]), start, end: text.length });
    at = m.index + m[0].length;
  }
  text += markup.slice(at);

  const seen = new Set<number>();
  for (const s of spans) {
    if (s.index < 1 || s.index > count)
      return { ok: false, error: `There is no highlight [${s.index}] — editing the text can't add one.` };
    if (seen.has(s.index)) return { ok: false, error: `Highlight [${s.index}] appears more than once.` };
    if (s.end === s.start) return { ok: false, error: `Highlight [${s.index}] has no text left.` };
    seen.add(s.index);
  }
  for (let i = 1; i <= count; i++)
    if (!seen.has(i)) return { ok: false, error: `Highlight [${i}] is missing — editing the text can't remove one.` };

  return { ok: true, text, spans };
}
