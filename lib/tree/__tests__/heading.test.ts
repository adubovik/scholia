import { describe, it, expect } from "vitest";
import { parseHeadingTree } from "@/lib/tree/heading";

// helper: paras of the right length; text is irrelevant to nesting
const paras = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `p${i}` }));

describe("parseHeadingTree", () => {
  it("returns null when there are no headings", () => {
    expect(parseHeadingTree(paras(3), [null, null, null])).toBeNull();
  });

  it("nests paragraphs under the current chapter heading", () => {
    // h2, p, p, h2, p
    const rels = parseHeadingTree(paras(5), [2, null, null, 2, null]);
    expect(rels).toEqual([
      { paragraphIndex: 0, parentIndex: null, isHeading: true },
      { paragraphIndex: 1, parentIndex: 0, isHeading: false },
      { paragraphIndex: 2, parentIndex: 0, isHeading: false },
      { paragraphIndex: 3, parentIndex: null, isHeading: true },
      { paragraphIndex: 4, parentIndex: 3, isHeading: false },
    ]);
  });

  it("nests a deeper heading and its prose under the shallower one", () => {
    // h2, p, h3, p
    const rels = parseHeadingTree(paras(4), [2, null, 3, null]);
    expect(rels).toEqual([
      { paragraphIndex: 0, parentIndex: null, isHeading: true },
      { paragraphIndex: 1, parentIndex: 0, isHeading: false },
      { paragraphIndex: 2, parentIndex: 0, isHeading: true },
      { paragraphIndex: 3, parentIndex: 2, isHeading: false },
    ]);
  });

  it("pops back up when a heading is shallower than the previous one", () => {
    // h2, h3, h2  → third heading is top-level again
    const rels = parseHeadingTree(paras(3), [2, 3, 2]);
    expect(rels!.map((r) => r.parentIndex)).toEqual([null, 0, null]);
  });

  it("keeps prose before the first heading at top level", () => {
    const rels = parseHeadingTree(paras(2), [null, 2]);
    expect(rels).toEqual([
      { paragraphIndex: 0, parentIndex: null, isHeading: false },
      { paragraphIndex: 1, parentIndex: null, isHeading: true },
    ]);
  });
});
