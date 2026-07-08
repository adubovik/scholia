import { describe, it, expect } from "vitest";
import { splitSpans } from "@/lib/annotations/spans";
import type { InlineAnnotationView } from "@/lib/annotations/types";

function ann(id: string, startOffset: number, endOffset: number, color: InlineAnnotationView["color"] = "yellow"): InlineAnnotationView {
  return { id, startOffset, endOffset, color, note: null, tags: [], authorId: "u" };
}

describe("splitSpans", () => {
  it("returns one bare segment when there are no annotations", () => {
    const segs = splitSpans("abcdef", 0, []);
    expect(segs).toEqual([{ text: "abcdef", charStart: 0, annotations: [] }]);
  });

  it("splits adjacent (touching, non-overlapping) annotations", () => {
    const segs = splitSpans("abcdef", 0, [ann("a", 0, 2), ann("b", 2, 4)]);
    expect(segs.map((s) => [s.text, s.annotations.map((x) => x.id)])).toEqual([
      ["ab", ["a"]], ["cd", ["b"]], ["ef", []],
    ]);
  });

  it("marks the inner segment with both ids for nested annotations", () => {
    const segs = splitSpans("abcdef", 0, [ann("outer", 0, 6), ann("inner", 2, 4)]);
    expect(segs.map((s) => [s.text, s.annotations.map((x) => x.id)])).toEqual([
      ["ab", ["outer"]], ["cd", ["outer", "inner"]], ["ef", ["outer"]],
    ]);
  });

  it("marks the overlap region for partially overlapping annotations", () => {
    const segs = splitSpans("abcdef", 0, [ann("a", 0, 4), ann("b", 2, 6)]);
    expect(segs.map((s) => [s.text, s.annotations.map((x) => x.id)])).toEqual([
      ["ab", ["a"]], ["cd", ["a", "b"]], ["ef", ["b"]],
    ]);
  });

  it("clamps annotations to the node range and uses absolute charStart", () => {
    // node covers absolute [10, 16): text "abcdef"
    const segs = splitSpans("abcdef", 10, [ann("a", 8, 12), ann("b", 14, 20)]);
    expect(segs).toEqual([
      { text: "ab", charStart: 10, annotations: [{ id: "a", color: "yellow" }] },
      { text: "cd", charStart: 12, annotations: [] },
      { text: "ef", charStart: 14, annotations: [{ id: "b", color: "yellow" }] },
    ]);
  });

  it("ignores an annotation entirely outside the node range", () => {
    const segs = splitSpans("abcdef", 10, [ann("x", 0, 5)]);
    expect(segs).toEqual([{ text: "abcdef", charStart: 10, annotations: [] }]);
  });

  it("returns no segments for an empty node", () => {
    const segs = splitSpans("", 0, []);
    expect(segs).toEqual([]);
  });
});
