import { describe, it, expect } from "vitest";
import { planNodes, type ParaInput } from "@/lib/tree/plan";

// Deterministic ids: n0, n1, n2, ... in paragraph order.
function counter() {
  let i = 0;
  return () => `n${i++}`;
}

// Build ParaInput[] with contiguous offsets separated by a 2-char gap ("\n\n").
function paras(...texts: string[]): ParaInput[] {
  const out: ParaInput[] = [];
  let cursor = 0;
  for (const text of texts) {
    out.push({ start: cursor, end: cursor + text.length, text });
    cursor += text.length + 2;
  }
  return out;
}

describe("planNodes", () => {
  it("flat text → one top-level node per paragraph, whole-paragraph ranges", () => {
    const input = paras("First.", "Second.");
    const nodes = planNodes(input, counter());
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.parentId)).toEqual([null, null]);
    expect(nodes.map((n) => n.position)).toEqual([0, 1]);
    expect(nodes.map((n) => n.label)).toEqual([null, null]);
    expect(nodes[0]).toMatchObject({ id: "n0", startOffset: input[0].start, endOffset: input[0].end });
    expect(nodes[1]).toMatchObject({ id: "n1", startOffset: input[1].start, endOffset: input[1].end });
  });

  it("numbered text → nested nodes, labels set, range starts past the label", () => {
    const input = paras("1 A.", "1.1 B.", "1.2 C.", "2 D.");
    const nodes = planNodes(input, counter());
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    // ids follow paragraph order: n0="1", n1="1.1", n2="1.2", n3="2"
    expect(byId["n0"]).toMatchObject({ label: "1", parentId: null, position: 0 });
    expect(byId["n1"]).toMatchObject({ label: "1.1", parentId: "n0", position: 0 });
    expect(byId["n2"]).toMatchObject({ label: "1.2", parentId: "n0", position: 1 });
    expect(byId["n3"]).toMatchObject({ label: "2", parentId: null, position: 1 });
    // "1.1 B." → prose starts at offset 4 within the paragraph
    expect(byId["n1"].startOffset).toBe(input[1].start + 4);
    expect(byId["n1"].endOffset).toBe(input[1].end);
  });
});

describe("planNodes — heading structure", () => {
  it("nests prose under heading nodes and titles the headings", () => {
    const input = paras("CHAPTER I", "Opening prose.", "More prose.", "CHAPTER II", "Next chapter prose.");
    const nodes = planNodes(input, counter(), [2, null, null, 2, null]);

    expect(nodes.map((n) => n.parentId)).toEqual([null, "n0", "n0", null, "n3"]);
    expect(nodes.map((n) => n.title)).toEqual(["CHAPTER I", null, null, "CHAPTER II", null]);
    // sibling positions reset per parent, assigned in document order
    expect(nodes.map((n) => n.position)).toEqual([0, 0, 1, 1, 0]);
    // heading node range covers the whole heading paragraph
    expect(nodes[0]).toMatchObject({ startOffset: input[0].start, endOffset: input[0].end });
  });

  it("prefers numbered structure over heading levels when both could apply", () => {
    const input = paras("1 First.", "2 Second.");
    const nodes = planNodes(input, counter(), [2, 2]);
    // numbered mode strips the label from the range (proseStart > 0)
    expect(nodes[0].startOffset).toBeGreaterThan(input[0].start);
    expect(nodes.map((n) => n.title)).toEqual([null, null]);
  });

  it("falls back to flat when headingLevels are all null", () => {
    const input = paras("First.", "Second.");
    const nodes = planNodes(input, counter(), [null, null]);
    expect(nodes.map((n) => n.parentId)).toEqual([null, null]);
    expect(nodes.map((n) => n.title)).toEqual([null, null]);
  });
});
