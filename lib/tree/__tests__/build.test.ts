import { describe, it, expect } from "vitest";
import { buildTree, type NodeRow, type NodeRange } from "@/lib/tree/build";

const SRC = "Root text. Child text.";

describe("buildTree", () => {
  it("nests children under parents, ordered by position, with resolved text", () => {
    const nodes: NodeRow[] = [
      { id: "b", parentId: "a", position: 1, label: "1.2", title: null },
      { id: "a", parentId: null, position: 0, label: "1", title: null },
      { id: "c", parentId: "a", position: 0, label: "1.1", title: null },
    ];
    const ranges: NodeRange[] = [
      { nodeId: "a", startOffset: 0, endOffset: 10 },   // "Root text."
      { nodeId: "c", startOffset: 11, endOffset: 22 },  // "Child text."
      { nodeId: "b", startOffset: 11, endOffset: 22 },
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
      { id: "y", parentId: null, position: 1, label: "2", title: null },
      { id: "x", parentId: null, position: 0, label: "1", title: null },
    ];
    const tree = buildTree(nodes, [], SRC);
    expect(tree.map((n) => n.id)).toEqual(["x", "y"]);
    expect(tree[0].text).toBe(""); // no range → empty text
  });
});
