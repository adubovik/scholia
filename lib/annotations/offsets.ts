export interface SourceRange {
  sourceId: string;
  startOffset: number;
  endOffset: number;
}

/** Nearest ancestor that is a source run (`data-source-id` + `data-char-start`). */
function runFor(node: Node | null): HTMLElement | null {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  while (el && (el.dataset.sourceId === undefined || el.dataset.charStart === undefined)) {
    el = el.parentElement;
  }
  return el;
}

/**
 * Map a DOM Range to absolute source offsets, or null if it cannot be a valid
 * single-node, single-source inline annotation. Assumes each run holds one text
 * node (see SourcePassage), so the in-run offset is the Range's own offset.
 */
export function rangeToOffsets(range: Range, root: HTMLElement): SourceRange | null {
  if (range.collapsed) return null;

  const startRun = runFor(range.startContainer);
  const endRun = runFor(range.endContainer);
  if (!startRun || !endRun) return null;
  if (!root.contains(startRun) || !root.contains(endRun)) return null;

  const sourceId = startRun.dataset.sourceId!;
  if (endRun.dataset.sourceId !== sourceId) return null; // cross-source

  const startNode = startRun.closest("[data-node-id]");
  const endNode = endRun.closest("[data-node-id]");
  if (!startNode || startNode !== endNode) return null; // single-node restriction

  const startOffset = Number(startRun.dataset.charStart) + range.startOffset;
  const endOffset = Number(endRun.dataset.charStart) + range.endOffset;
  if (startOffset >= endOffset) return null;

  return { sourceId, startOffset, endOffset };
}
