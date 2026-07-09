export interface NodeUpdate {
  id: string;
  parentId: string | null;
  position: number;
}

/**
 * Given the ordered top-level node ids of a freshly imported document, produce
 * the updates that nest the 2nd node under the 1st and the 3rd under the 2nd,
 * then re-number the remaining top-level nodes contiguously. Yields:
 *   - block 0 (top-level, pos 0)
 *       - block 1 (child of 0)
 *           - block 2 (child of 1)
 *   - block 3 (top-level, pos 1)
 *   - ...
 * Returns [] when there are fewer than 3 top-level nodes (nothing to demo).
 */
export function computeDemoNesting(topLevelIds: string[]): NodeUpdate[] {
  if (topLevelIds.length < 3) return [];
  const [a, b, c, ...rest] = topLevelIds;
  const updates: NodeUpdate[] = [
    { id: b, parentId: a, position: 0 },
    { id: c, parentId: b, position: 0 },
  ];
  [a, ...rest].forEach((id, i) => updates.push({ id, parentId: null, position: i }));
  return updates;
}
