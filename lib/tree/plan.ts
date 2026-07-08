import { parseNumberedTree } from "./numbering";

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
 * Plan one node per paragraph. When `parseNumberedTree` detects a clean numbered
 * structure the nodes are nested by label (range started past the label token);
 * otherwise every node is top-level with a whole-paragraph range. Ids come from
 * `newId` so callers control uuid generation (and tests stay deterministic).
 */
export function planNodes(paras: ParaInput[], newId: () => string): PlannedNode[] {
  const ids = paras.map(() => newId());
  const rels = parseNumberedTree(paras);
  const position = new Map<string, number>();
  const nextPosition = (parentId: string | null) => {
    const key = parentId ?? "\0root";
    const n = position.get(key) ?? 0;
    position.set(key, n + 1);
    return n;
  };

  if (rels === null) {
    return paras.map((p, i) => ({
      id: ids[i], parentId: null, position: nextPosition(null),
      label: null, title: null, paragraphIndex: i, startOffset: p.start, endOffset: p.end,
    }));
  }

  const idByLabel = new Map<string, string>();
  rels.forEach((r) => idByLabel.set(r.label, ids[r.paragraphIndex]));

  return rels.map((r) => {
    const parentId = r.parentLabel ? idByLabel.get(r.parentLabel)! : null;
    const p = paras[r.paragraphIndex];
    return {
      id: ids[r.paragraphIndex], parentId, position: nextPosition(parentId),
      label: r.label, title: null, paragraphIndex: r.paragraphIndex,
      startOffset: p.start + r.proseStart, endOffset: p.end,
    };
  });
}
