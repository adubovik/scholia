export type Color = "yellow" | "pink" | "green" | "blue";
export const COLORS: Color[] = ["yellow", "pink", "green", "blue"];

/** An inline annotation shaped for rendering + editing; offsets are absolute into sources.text. */
export interface InlineAnnotationView {
  id: string;
  startOffset: number;
  endOffset: number;
  color: Color;
  note: string | null;
  tags: string[];
  authorId: string;
}

/** A node (entity) annotation shaped for rendering + editing; anchored to a node, not a text span. */
export interface NodeAnnotationView {
  id: string;
  nodeId: string;
  note: string;
  tags: string[];
  authorId: string;
}
