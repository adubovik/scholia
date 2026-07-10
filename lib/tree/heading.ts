export interface HeadingRelation {
  paragraphIndex: number;
  parentIndex: number | null;
  isHeading: boolean;
}

/**
 * Derive parent/child relations from heading levels. A paragraph's parent is the
 * current deepest open heading; a heading's parent is the nearest preceding
 * heading with a smaller level. Returns null when no block is a heading, so the
 * caller can fall through to flat structure.
 */
export function parseHeadingTree(
  paras: { text: string }[],
  headingLevels: (number | null)[],
): HeadingRelation[] | null {
  if (headingLevels.length !== paras.length) return null;
  if (!headingLevels.some((l) => l !== null)) return null;

  const stack: { index: number; level: number }[] = [];
  return paras.map((_, index) => {
    const level = headingLevels[index];
    if (level == null) {
      const parentIndex = stack.length ? stack[stack.length - 1].index : null;
      return { paragraphIndex: index, parentIndex, isHeading: false };
    }
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parentIndex = stack.length ? stack[stack.length - 1].index : null;
    stack.push({ index, level });
    return { paragraphIndex: index, parentIndex, isHeading: true };
  });
}
