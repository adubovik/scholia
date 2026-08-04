import { describe, it, expect } from "vitest";
import { buildDual, visibleDual, dualTags } from "@/lib/tree/dual";
import type { TreeNode } from "@/lib/tree/build";
import type { InlineAnnotationView, NodeAnnotationView } from "@/lib/annotations/types";

const inline = (over: Partial<InlineAnnotationView>): InlineAnnotationView => ({
  id: "i1", startOffset: 0, endOffset: 5, color: "yellow", note: null, tags: [],
  authorId: "u", createdAt: "2026-01-01T00:00:00Z", ...over,
});
const nodeAnn = (over: Partial<NodeAnnotationView>): NodeAnnotationView => ({
  id: "n1", nodeId: "a", note: "the note", tags: [], authorId: "u",
  createdAt: "2026-01-01T00:00:00Z", ...over,
});
const node = (over: Partial<TreeNode>): TreeNode => ({
  id: "a", label: null, title: null, text: "", sourceId: "s", startOffset: 0,
  annotations: [], nodeAnnotation: null, children: [], ...over,
});
const nums = (...ids: string[]) => new Map(ids.map((id) => [id, id.toUpperCase()]));
const noFilter = { filterTag: null, filterGlyphs: [] };

describe("buildDual", () => {
  it("flips a node's note into the prose, keeps the original as source, numbers off the reading tree", () => {
    const tree = [node({ id: "a", text: "The quick brown fox.", nodeAnnotation: nodeAnn({ note: "Opening line." }) })];
    const [d] = buildDual(tree, nums("a"));
    expect(d.note).toBe("Opening line.");
    expect(d.source).toBe("The quick brown fox.");
    expect(d.noteId).toBe("n1");
    expect(d.number).toBe("A");
  });

  it("turns inline annotations into child rows carrying their note, span, and colour", () => {
    const tree = [node({
      id: "a", text: "The quick brown fox.", startOffset: 0,
      annotations: [inline({ id: "i1", startOffset: 4, endOffset: 15, note: "colour + animal", color: "pink" })],
    })];
    const [d] = buildDual(tree, nums("a"));
    expect(d.noteId).toBeNull(); // node itself has no note → skeleton
    const [kid] = d.children;
    expect(kid.kind).toBe("inline");
    expect(kid.note).toBe("colour + animal");
    expect(kid.source).toBe("quick brown");
    expect(kid.color).toBe("pink");
    expect(kid.number).toBe("A"); // inline rows carry the parent's number as a citation prefix
    expect(kid.index).toBe(1); // 1-based position among the node's inline annotations
  });

  it("numbers a node's inline annotations 1..n in reading order for its fake citation id", () => {
    const tree = [node({
      id: "a", text: "one two three four five", startOffset: 0,
      annotations: [
        inline({ id: "second", startOffset: 8, endOffset: 13 }), // "three" — later in text
        inline({ id: "first", startOffset: 0, endOffset: 3 }), // "one" — earlier, sorts ahead
      ],
    })];
    const [d] = buildDual(tree, nums("a"));
    expect(d.children.map((c) => [c.id, c.index])).toEqual([["first", 1], ["second", 2]]);
  });

  it("does NOT prune — the full tree is returned, pruning is visibleDual's job", () => {
    const tree = [node({ id: "a", text: "Bare.", nodeAnnotation: null })];
    expect(buildDual(tree, nums("a"))).toHaveLength(1);
  });
});

describe("visibleDual", () => {
  it("prunes note-less leaves but keeps a note-less ancestor of an annotated descendant", () => {
    const tree = [node({
      id: "root", title: "Book",
      children: [
        node({ id: "a", text: "Annotated.", nodeAnnotation: nodeAnn({ nodeId: "a", note: "note" }) }),
        node({ id: "b", text: "Bare." }), // no annotation → pruned
      ],
    })];
    const [root] = visibleDual(buildDual(tree, nums("root", "a", "b")), noFilter);
    expect(root.noteId).toBeNull(); // skeleton, kept for its subtree
    expect(root.children.map((c) => c.id)).toEqual(["a"]); // b pruned away
  });

  it("filters to rows carrying the tag, keeping their ancestors", () => {
    const tree = [node({
      id: "root", title: "Book",
      children: [
        node({ id: "a", text: "x", nodeAnnotation: nodeAnn({ nodeId: "a", note: "n", tags: ["greek"] }) }),
        node({ id: "b", text: "y", nodeAnnotation: nodeAnn({ nodeId: "b", note: "n", tags: ["latin"] }) }),
      ],
    })];
    const full = buildDual(tree, nums("root", "a", "b"));
    const [root] = visibleDual(full, { filterTag: "greek", filterGlyphs: [] });
    expect(root.children.map((c) => c.id)).toEqual(["a"]); // only the #greek note
  });

  it("force-includes a compose target that has no annotation yet", () => {
    const tree = [node({ id: "a", text: "Bare paragraph." })];
    const full = buildDual(tree, nums("a"));
    expect(visibleDual(full, { ...noFilter, forceIds: new Set(["a"]) })).toHaveLength(1);
    expect(visibleDual(full, noFilter)).toHaveLength(0);
  });
});

describe("dualTags", () => {
  it("collects the distinct #tags and whether any glyph is present", () => {
    const tree = [node({
      id: "a", text: "x",
      nodeAnnotation: nodeAnn({ nodeId: "a", note: "n", tags: ["greek", ":summary"] }),
      annotations: [inline({ id: "i1", note: "m", tags: ["latin"] })],
    })];
    const { tags, anyGlyphs } = dualTags(buildDual(tree, nums("a")));
    expect(tags.sort()).toEqual(["greek", "latin"]); // :summary excluded (it's a glyph)
    expect(anyGlyphs).toBe(true);
  });
});
