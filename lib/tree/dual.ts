import type { LayerNoteView } from "@/lib/annotations/types";
import type { TreeNode } from "./build";
import { displayTags, glyphTag, glyphsInTags } from "@/lib/annotations/glyphs";

/**
 * Annotation-first ("dual") view of a document: the annotations arranged along the
 * document's own hierarchy. A node's note is the prose you read; its inline
 * annotations become child rows; structural nodes with no note of their own are dim
 * skeletons that hold the hierarchy together.
 *
 * `buildDual` produces the *full* tree; `visibleDual` prunes/filters it at render time
 * (client-side) so filter chips, the compose flow and the selected views can reveal,
 * hide or restructure branches without a refetch. Numbers come from the *reading* tree,
 * so a note on §2.1 is still labelled 2.1 here — the two panels agree. Inline rows carry
 * the *parent's* number plus a 1-based `index`, so the panel can label them 2.1₁, 2.1₂ …
 * as fake citation ids (nodes keep index 0, which is why a demoted node note reads 2.1₀).
 * The index is fixed at build time so it stays stable when `visibleDual` filters siblings
 * out.
 *
 * A separate type from TreeNode on purpose: this reuses the tree's *shape* (nesting,
 * collapse) but none of reading mode's per-node logic, keeping the reading path
 * untouched.
 */
export interface DualNode {
  id: string; // dual identity: the source node id (node) or the annotation id (inline, note)
  number: string; // reading section number: the node's own (node) or its parent's (inline)
  index: number; // inline rows: 1-based position among the parent's inline annotations; nodes: 0
  kind: "node" | "inline" | "note"; // structural row / a highlight / the whole-node note, stepped down (see demote)
  nodeId: string; // owning source node — target for upsertNodeAnnotation / cross-panel select
  noteId: string | null; // real annotation row to edit; null = node has no note (skeleton)
  note: string; // the editable prose; "" when the block has no note
  tags: string[];
  color: string | null; // inline highlight colour (inline rows only)
  source: string; // original text: the node's text, or the highlighted span
  title: string | null; // structural heading title (node only)
  layerNotes: LayerNoteView[]; // this node's text in each alternative view (node only)
  children: DualNode[];
}

function toDual(n: TreeNode, numbers: Map<string, string>): DualNode {
  const number = numbers.get(n.id) ?? "";
  // Inline annotations of this node become leaf children, in reading order. Each carries
  // the parent's number + its 1-based position, so the panel can label them 2.1₁, 2.1₂.
  const inlineKids: DualNode[] = [...n.annotations]
    .sort((a, b) => a.startOffset - b.startOffset)
    .map((a, i) => {
      const s = Math.max(0, a.startOffset - n.startOffset);
      const e = Math.max(0, a.endOffset - n.startOffset);
      return {
        id: a.id,
        number,
        index: i + 1,
        kind: "inline" as const,
        nodeId: n.id,
        noteId: a.id,
        note: a.note ?? "",
        tags: a.tags,
        color: a.color,
        source: n.text.slice(s, e),
        title: null,
        layerNotes: [],
        children: [],
      };
    });
  return {
    id: n.id,
    number,
    index: 0,
    kind: "node",
    nodeId: n.id,
    noteId: n.nodeAnnotation?.id ?? null,
    note: n.nodeAnnotation?.note ?? "",
    tags: n.nodeAnnotation?.tags ?? [],
    color: null,
    source: n.text,
    title: n.title,
    layerNotes: n.layerNotes,
    children: [...inlineKids, ...n.children.map((c) => toDual(c, numbers))],
  };
}

/** Build the full annotation-first tree (every node) from the reading tree + numbers. */
export function buildDual(tree: TreeNode[], numbers: Map<string, string>): DualNode[] {
  return tree.map((n) => toDual(n, numbers));
}

/** A §-reference target: the block to scroll/select, plus the inline highlight to
 * light up (null for a plain block reference). */
export interface SectionTarget {
  annId: string | null;
  nodeId: string;
}

/** Index the dual tree for §-links in note prose: `number` → its block (e.g. "1.1"),
 * and `number_index` → an inline highlight (e.g. "1.1_1"), mirroring the 1.1 / 1.1₁
 * labels the panel shows. Same numbers as the reading tree, so references agree with
 * what the reader sees. */
export function sectionIndex(nodes: DualNode[]): Record<string, SectionTarget> {
  const out: Record<string, SectionTarget> = {};
  const walk = (list: DualNode[]) => {
    for (const d of list) {
      if (d.number) {
        if (d.kind === "inline") out[`${d.number}_${d.index}`] = { annId: d.noteId, nodeId: d.nodeId };
        else out[d.number] = { annId: null, nodeId: d.nodeId };
      }
      walk(d.children);
    }
  };
  walk(nodes);
  return out;
}

/** Does this row carry an annotation of its own? An inline row is itself a highlight and
 * a note row is a note; a node counts only if it still holds one. Note-less nodes are
 * skeletons. */
function ownAnnotated(d: DualNode): boolean {
  return d.kind !== "node" || d.noteId !== null;
}

function matches(d: DualNode, f: DualFilter): boolean {
  // A note-less node still earns a row when it has text in a *selected* view — so
  // deselecting that view in the bar prunes it back out of the tree. Tag/glyph
  // filters still apply on top: a layer-only row carries no tags, so any active
  // filter drops it.
  const inSelectedLayer = d.layerNotes.some((n) => f.layerIds?.includes(n.layerId));
  if (!ownAnnotated(d) && !inSelectedLayer) return false;
  if (f.filterTag && !d.tags.includes(f.filterTag)) return false;
  return f.filterGlyphs.every((g) => d.tags.includes(glyphTag(g)));
}

export interface DualFilter {
  filterTag: string | null;
  filterGlyphs: string[];
  forceIds?: Set<string>; // ids to keep visible regardless (an open compose target)
  layerIds?: string[]; // views selected in the layer bar; their texts keep a row alive
}

/**
 * With a selected view on screen the node's own row belongs to that view's text — so the
 * note about the *whole* node steps down beside the inline ones as annotation 0: 2.1₀
 * ahead of 2.1₁, 2.1₂. What is left of the node is a skeleton, which is exactly the row
 * DualNodeSection hands over to the first band. Keyed by the annotation's own id, like an
 * inline row, so a cross-panel select lands on the note and not on the band above it.
 *
 * Titled nodes are left alone: their row is a structural heading, not a rundown of the
 * prose, so no band displaces it there either (DualNodeSection's `leadsWithView`).
 */
function demote(d: DualNode, layerIds: string[]): DualNode {
  if (d.kind !== "node" || d.noteId === null || d.title !== null) return d;
  if (!d.layerNotes.some((n) => layerIds.includes(n.layerId))) return d;
  const note: DualNode = { ...d, id: d.noteId, kind: "note", layerNotes: [], children: [] };
  // The husk keeps its views (the band is its row now) and loses the note — including its
  // tags, so a tag filter matches the note row and reaches this one as its ancestor.
  return { ...d, noteId: null, note: "", tags: [], children: [note, ...d.children] };
}

/**
 * Prune the full dual tree to what should show: rows that carry a matching annotation,
 * plus every ancestor holding a match (so the hierarchy stays intact), plus any forced
 * id (a compose target that has no annotation yet). With no filter, this is the base
 * prune — annotated subtrees only, note-less leaves dropped.
 */
export function visibleDual(nodes: DualNode[], f: DualFilter): DualNode[] {
  const force = f.forceIds ?? new Set<string>();
  const layerIds = f.layerIds ?? [];
  const walk = (list: DualNode[]): DualNode[] =>
    list.flatMap((d0) => {
      const d = demote(d0, layerIds);
      const kids = walk(d.children);
      if (matches(d, f) || force.has(d.id) || kids.length > 0) {
        return [{ ...d, children: kids }];
      }
      return [];
    });
  return walk(nodes);
}

/** The distinct #tags across all annotations + whether any glyph is present — the
 * options for the annotation-tree filter row. */
export function dualTags(nodes: DualNode[]): { tags: string[]; anyGlyphs: boolean } {
  const tags = new Set<string>();
  let anyGlyphs = false;
  const walk = (list: DualNode[]) => {
    for (const d of list) {
      if (ownAnnotated(d)) {
        for (const t of displayTags(d.tags)) tags.add(t);
        if (glyphsInTags(d.tags).length > 0) anyGlyphs = true;
      }
      walk(d.children);
    }
  };
  walk(nodes);
  return { tags: [...tags], anyGlyphs };
}
