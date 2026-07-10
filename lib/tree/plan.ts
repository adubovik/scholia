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
  label: string | null;
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
      return {
        id: ids[r.paragraphIndex], parentId, position: nextPosition(parentId),
        label: r.label, title: null, paragraphIndex: r.paragraphIndex,
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
        label: null, title: r.isHeading ? p.text : null,
        paragraphIndex: r.paragraphIndex, startOffset: p.start, endOffset: p.end,
      };
    });
  }

  return paras.map((p, i) => ({
    id: ids[i], parentId: null, position: nextPosition(null),
    label: null, title: null, paragraphIndex: i, startOffset: p.start, endOffset: p.end,
  }));
}
