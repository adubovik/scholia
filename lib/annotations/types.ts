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
  createdAt: string; // ISO — drives the drawer's relative timestamp
}

/** A node (entity) annotation shaped for rendering + editing; anchored to a node, not a text span. */
export interface NodeAnnotationView {
  id: string;
  nodeId: string;
  note: string;
  tags: string[];
  authorId: string;
  createdAt: string; // ISO — drives the drawer's relative timestamp
}

/** A layer's tint. Pastel, chosen to sit under reading prose on the cream page
 * without competing with a highlighter mark. App-checked (see assertLayerColor). */
export type LayerColor = "sand" | "sage" | "mist" | "blush" | "lilac" | "clay";
export const LAYER_COLORS: LayerColor[] = ["sand", "sage", "mist", "blush", "lilac", "clay"];

/** A named alternative rendition of the document — a summary pass, a translation,
 * another edition. Document-scoped; its per-node text lives in node_annotations. */
export interface LayerView {
  id: string;
  name: string;
  color: LayerColor;
  position: number;
}

/** One node's text in one layer. A node_annotation row with a layer_id — the same
 * storage as a node note, so it edits and deletes through the same actions. */
export interface LayerNoteView {
  id: string;
  nodeId: string;
  layerId: string;
  note: string;
}
