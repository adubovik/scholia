import { parseNumberedTree } from "./numbering";
import { parseHeadingTree } from "./heading";

export interface ParaInput {
  start: number;
  end: number;
  text: string;
}

export interface PlannedNode {
  id: string;
  parentId: string | null;
  position: number;
  label: string | null; // the node's OWN id segment ("XI", "Definitions", "3"); null ⇒ positional at render
  alias: string | null; // short token ancestors lend to a descendant's path ("Def"); null ⇒ same as label
  title: string | null;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
}

/**
 * Plan one node per paragraph. Precedence: a clean numbered structure
 * (`parseNumberedTree`) nests by label; otherwise heading levels
 * (`parseHeadingTree`) nest prose under headings; otherwise every node is
 * top-level with a whole-paragraph range. Ids come from `newId` so callers
 * control uuid generation (and tests stay deterministic).
 */
export function planNodes(
  paras: ParaInput[],
  newId: () => string,
  headingLevels?: (number | null)[],
): PlannedNode[] {
  const ids = paras.map(() => newId());
  const position = new Map<string, number>();
  const nextPosition = (parentId: string | null) => {
    const key = parentId ?? "\0root";
    const n = position.get(key) ?? 0;
    position.set(key, n + 1);
    return n;
  };

  const numbered = parseNumberedTree(paras);
  if (numbered !== null) {
    const idByLabel = new Map<string, string>();
    numbered.forEach((r) => idByLabel.set(r.label, ids[r.paragraphIndex]));
    return numbered.map((r) => {
      const parentId = r.parentLabel ? idByLabel.get(r.parentLabel)! : null;
      const p = paras[r.paragraphIndex];
      // Store the node's OWN segment ("2.1" → "1"); the path renderer rebuilds the
      // dotted number from ancestors. Labels are single-dot-guaranteed (numbering.ts).
      const own = r.label.slice(r.label.lastIndexOf(".") + 1);
      return {
        id: ids[r.paragraphIndex], parentId, position: nextPosition(parentId),
        label: own, alias: null, title: null, paragraphIndex: r.paragraphIndex,
        startOffset: p.start + r.proseStart, endOffset: p.end,
      };
    });
  }

  const headings = headingLevels ? parseHeadingTree(paras, headingLevels) : null;
  if (headings !== null) {
    return headings.map((r) => {
      const parentId = r.parentIndex === null ? null : ids[r.parentIndex];
      const p = paras[r.paragraphIndex];
      return {
        id: ids[r.paragraphIndex], parentId, position: nextPosition(parentId),
        label: null, alias: null, title: r.isHeading ? p.text : null,
        paragraphIndex: r.paragraphIndex, startOffset: p.start, endOffset: p.end,
      };
    });
  }

  return paras.map((p, i) => ({
    id: ids[i], parentId: null, position: nextPosition(null),
    label: null, alias: null, title: null, paragraphIndex: i, startOffset: p.start, endOffset: p.end,
  }));
}
