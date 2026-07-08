export interface NumberedRelation {
  paragraphIndex: number;
  label: string;
  parentLabel: string | null;
  proseStart: number;
}

const LABEL = /^(\d+(?:\.\d+)*)(\s+)/;

/** Ancestors of a single-dot decimal label, nearest first, ending at the integer root. */
function ancestorChain(label: string): string[] {
  const dot = label.indexOf(".");
  if (dot === -1) return []; // integer label: no ancestors
  const intPart = label.slice(0, dot);
  let frac = label.slice(dot + 1);
  const chain: string[] = [];
  while (frac.length > 1) {
    frac = frac.slice(0, -1);
    chain.push(intPart + "." + frac);
  }
  chain.push(intPart);
  return chain;
}

/**
 * Parse Tractatus-style decimal numbering into parent/child relations, or null
 * when the paragraphs are not a clean numbered structure. Numbered mode requires
 * every paragraph to carry a leading label, no label with more than one dot, and
 * no duplicate labels. The parent is the nearest ancestor that actually appears.
 */
export function parseNumberedTree(paragraphs: { text: string }[]): NumberedRelation[] | null {
  if (paragraphs.length === 0) return null;

  const matched: { label: string; proseStart: number }[] = [];
  for (const p of paragraphs) {
    const m = LABEL.exec(p.text);
    if (!m) return null;                 // a paragraph without a label → flat
    const label = m[1];
    if (label.indexOf(".") !== label.lastIndexOf(".")) return null; // >1 dot → out of scope
    matched.push({ label, proseStart: m[0].length });
  }

  const labelSet = new Set<string>();
  for (const { label } of matched) {
    if (labelSet.has(label)) return null; // duplicate → ambiguous
    labelSet.add(label);
  }

  return matched.map(({ label, proseStart }, paragraphIndex) => {
    const parentLabel = ancestorChain(label).find((a) => labelSet.has(a)) ?? null;
    return { paragraphIndex, label, parentLabel, proseStart };
  });
}
