import { describe, it, expect } from "vitest";
import { numberSections } from "@/lib/tree/number";
import type { TreeNode } from "@/lib/tree/build";

// Minimal tree factory — only id + children matter to numberSections.
const n = (id: string, children: TreeNode[] = []): TreeNode => ({
  id, label: null, title: null, text: "", sourceId: "s", startOffset: 0,
  annotations: [], nodeAnnotation: null, children,
});

describe("numberSections", () => {
  it("numbers by 1-based sibling index path, both directions", () => {
    const tree = [
      n("a", [n("a1"), n("a2", [n("a2a")])]),
      n("b"),
    ];
    const { byId, byNumber } = numberSections(tree);
    expect(Object.fromEntries(byId)).toEqual({
      a: "1", a1: "1.1", a2: "1.2", a2a: "1.2.1", b: "2",
    });
    expect(byNumber.get("1.2.1")).toBe("a2a");
    expect(byNumber.get("2")).toBe("b");
  });
});
