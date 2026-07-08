export function normalizeText(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export interface Paragraph {
  text: string;
  start: number;
  end: number;
}

/**
 * A paragraph is a maximal run of non-blank lines. Blank-line runs
 * (optionally containing spaces/tabs) separate paragraphs. Offsets index
 * into the given `text` exactly, so `text.slice(start, end) === paragraph.text`.
 */
export function paragraphize(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  const sep = /\n[ \t]*\n/g;
  let segStart = 0;
  const push = (from: number, to: number) => {
    const raw = text.slice(from, to);
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;
    const leading = raw.length - raw.trimStart().length;
    const start = from + leading;
    out.push({ text: trimmed, start, end: start + trimmed.length });
  };
  let m: RegExpExecArray | null;
  while ((m = sep.exec(text)) !== null) {
    push(segStart, m.index);
    segStart = m.index + m[0].length;
  }
  push(segStart, text.length);
  return out;
}
