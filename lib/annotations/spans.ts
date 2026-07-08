import type { Color, InlineAnnotationView } from "./types";

export interface Segment {
  text: string;
  charStart: number; // absolute offset into sources.text
  annotations: { id: string; color: Color }[]; // [] = bare text; input order preserved (oldest→newest)
}

/**
 * Split a node's text into ordered, non-overlapping segments, each tagged with
 * the annotations covering it. `nodeStart` is the node's absolute start in
 * sources.text; annotations are clamped to [nodeStart, nodeStart + text.length).
 */
export function splitSpans(nodeText: string, nodeStart: number, annotations: InlineAnnotationView[]): Segment[] {
  const nodeEnd = nodeStart + nodeText.length;
  const points = new Set<number>([nodeStart, nodeEnd]);
  for (const a of annotations) {
    const s = Math.max(a.startOffset, nodeStart);
    const e = Math.min(a.endOffset, nodeEnd);
    if (s < e) { points.add(s); points.add(e); }
  }
  const sorted = [...points].sort((x, y) => x - y);

  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start >= end) continue;
    const covering = annotations
      .filter((a) => a.startOffset <= start && a.endOffset >= end)
      .map((a) => ({ id: a.id, color: a.color }));
    segments.push({ text: nodeText.slice(start - nodeStart, end - nodeStart), charStart: start, annotations: covering });
  }
  return segments;
}
