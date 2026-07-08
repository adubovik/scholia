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
