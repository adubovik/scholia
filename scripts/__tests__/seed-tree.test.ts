import { describe, it, expect } from "vitest";
import { computeDemoNesting } from "../seed-tree";

describe("computeDemoNesting", () => {
  it("nests the 2nd under 1st, 3rd under 2nd, and renumbers the rest", () => {
    expect(computeDemoNesting(["a", "b", "c", "d", "e"])).toEqual([
      { id: "b", parentId: "a", position: 0 },
      { id: "c", parentId: "b", position: 0 },
      { id: "a", parentId: null, position: 0 },
      { id: "d", parentId: null, position: 1 },
      { id: "e", parentId: null, position: 2 },
    ]);
  });
  it("returns [] when there are fewer than 3 top-level nodes", () => {
    expect(computeDemoNesting(["a", "b"])).toEqual([]);
  });
});
