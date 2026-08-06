import { describe, it, expect } from "vitest";
import { buildTree, type NodeRow, type NodeRange } from "@/lib/tree/build";
import type { InlineAnnotationView, NodeAnnotationView } from "@/lib/annotations/types";

const SRC = "Root text. Child text.";

describe("buildTree", () => {
  it("nests children under parents, ordered by position, with resolved text", () => {
    const nodes: NodeRow[] = [
      { id: "b", parentId: "a", position: 1, label: "1.2", alias: null, title: null },
      { id: "a", parentId: null, position: 0, label: "1", alias: null, title: null },
      { id: "c", parentId: "a", position: 0, label: "1.1", alias: null, title: null },
    ];
    const ranges: NodeRange[] = [
      { nodeId: "a", sourceId: "s1", startOffset: 0, endOffset: 10 },   // "Root text."
      { nodeId: "c", sourceId: "s1", startOffset: 11, endOffset: 22 },  // "Child text."
      { nodeId: "b", sourceId: "s1", startOffset: 11, endOffset: 22 },
    ];
    const tree = buildTree(nodes, ranges, SRC);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("a");
    expect(tree[0].text).toBe("Root text.");
    // children ordered by position: c (0) before b (1)
    expect(tree[0].children.map((n) => n.id)).toEqual(["c", "b"]);
    expect(tree[0].children[0].text).toBe("Child text.");
  });

  it("orders multiple roots by position", () => {
    const nodes: NodeRow[] = [
      { id: "y", parentId: null, position: 1, label: "2", alias: null, title: null },
      { id: "x", parentId: null, position: 0, label: "1", alias: null, title: null },
    ];
    const tree = buildTree(nodes, [], SRC);
    expect(tree.map((n) => n.id)).toEqual(["x", "y"]);
    expect(tree[0].text).toBe(""); // no range → empty text
  });
});

it("attaches only the annotations intersecting each node's range", () => {
  const nodes: NodeRow[] = [
    { id: "a", parentId: null, position: 0, label: null, alias: null, title: null },
    { id: "b", parentId: null, position: 1, label: null, alias: null, title: null },
  ];
  const ranges: NodeRange[] = [
    { nodeId: "a", sourceId: "s1", startOffset: 0, endOffset: 10 },
    { nodeId: "b", sourceId: "s1", startOffset: 11, endOffset: 22 },
  ];
  const anns: InlineAnnotationView[] = [
    { id: "x", startOffset: 2, endOffset: 6, color: "yellow", note: null, tags: [], authorId: "u" },  // in a
    { id: "y", startOffset: 12, endOffset: 15, color: "pink", note: null, tags: [], authorId: "u" },  // in b
  ];
  const tree = buildTree(nodes, ranges, "Root text. Child text.", anns);
  expect(tree[0].annotations.map((a) => a.id)).toEqual(["x"]);
  expect(tree[0].startOffset).toBe(0);
  expect(tree[0].sourceId).toBe("s1");
  expect(tree[1].annotations.map((a) => a.id)).toEqual(["y"]);
});

it("attaches each node's own note by nodeId, leaving others null", () => {
  const nodes: NodeRow[] = [
    { id: "a", parentId: null, position: 0, label: null, alias: null, title: null },
    { id: "b", parentId: null, position: 1, label: null, alias: null, title: null },
  ];
  const ranges: NodeRange[] = [
    { nodeId: "a", sourceId: "s1", startOffset: 0, endOffset: 10 },
    { nodeId: "b", sourceId: "s1", startOffset: 11, endOffset: 22 },
  ];
  const nodeAnns: NodeAnnotationView[] = [
    { id: "n1", nodeId: "a", note: "on a", tags: [], authorId: "u" },
  ];
  const tree = buildTree(nodes, ranges, "Root text. Child text.", [], nodeAnns);
  expect(tree[0].nodeAnnotation?.note).toBe("on a");
  expect(tree[1].nodeAnnotation).toBeNull();
});
