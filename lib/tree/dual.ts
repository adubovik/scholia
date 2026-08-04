import type { TreeNode } from "./build";
import { displayTags, glyphTag, glyphsInTags } from "@/lib/annotations/glyphs";

/**
 * Annotation-first ("dual") view of a document: the annotations arranged along the
 * document's own hierarchy. A node's note is the prose you read; its inline
 * annotations become child rows; structural nodes with no note of their own are dim
 * skeletons that hold the hierarchy together.
 *
 * `buildDual` produces the *full* tree; `visibleDual` prunes/filters it at render time
 * (client-side) so filter chips and the compose flow can reveal or hide branches
 * without a refetch. Numbers come from the *reading* tree, so a note on §2.1 is still
 * labelled 2.1 here — the two panels agree. Inline rows carry the *parent's* number
 * plus a 1-based `index`, so the panel can label them 2.1₁, 2.1₂ … as fake citation
 * ids (nodes have index 0). The index is fixed at build time so it stays stable when
 * `visibleDual` filters siblings out.
 *
 * A separate type from TreeNode on purpose: this reuses the tree's *shape* (nesting,
 * collapse) but none of reading mode's per-node logic, keeping the reading path
 * untouched.
 */
export interface DualNode {
  id: string; // dual identity: the source node id (node) or the inline annotation id (inline)
  number: string; // reading section number: the node's own (node) or its parent's (inline)
  index: number; // inline rows: 1-based position among the parent's inline annotations; nodes: 0
  kind: "node" | "inline";
  nodeId: string; // owning source node — target for upsertNodeAnnotation / cross-panel select
  noteId: string | null; // real annotation row to edit; null = node has no note (skeleton)
  note: string; // the editable prose; "" when the block has no note
  tags: string[];
  color: string | null; // inline highlight colour (inline rows only)
  source: string; // original text: the node's text, or the highlighted span
  title: string | null; // structural heading title (node only)
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
    children: [...inlineKids, ...n.children.map((c) => toDual(c, numbers))],
  };
}

/** Build the full annotation-first tree (every node) from the reading tree + numbers. */
export function buildDual(tree: TreeNode[], numbers: Map<string, string>): DualNode[] {
  return tree.map((n) => toDual(n, numbers));
}

/** Does this row carry an annotation of its own? An inline row is itself a highlight;
 * a node counts only if it has a note. Note-less nodes are skeletons. */
function ownAnnotated(d: DualNode): boolean {
  return d.kind === "inline" || d.noteId !== null;
}

function matches(d: DualNode, filterTag: string | null, filterGlyphs: string[]): boolean {
  if (!ownAnnotated(d)) return false;
  if (filterTag && !d.tags.includes(filterTag)) return false;
  return filterGlyphs.every((g) => d.tags.includes(glyphTag(g)));
}

export interface DualFilter {
  filterTag: string | null;
  filterGlyphs: string[];
  forceIds?: Set<string>; // ids to keep visible regardless (an open compose target)
}

/**
 * Prune the full dual tree to what should show: rows that carry a matching annotation,
 * plus every ancestor holding a match (so the hierarchy stays intact), plus any forced
 * id (a compose target that has no annotation yet). With no filter, this is the base
 * prune — annotated subtrees only, note-less leaves dropped.
 */
export function visibleDual(nodes: DualNode[], f: DualFilter): DualNode[] {
  const force = f.forceIds ?? new Set<string>();
  const walk = (list: DualNode[]): DualNode[] =>
    list.flatMap((d) => {
      const kids = walk(d.children);
      if (matches(d, f.filterTag, f.filterGlyphs) || force.has(d.id) || kids.length > 0) {
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
