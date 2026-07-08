import { describe, it, expect } from "vitest";
import { parseNumberedTree } from "@/lib/tree/numbering";

const P = (...texts: string[]) => texts.map((text) => ({ text }));

describe("parseNumberedTree", () => {
  it("returns null for empty input", () => {
    expect(parseNumberedTree([])).toBeNull();
  });

  it("builds Tractatus decimal nesting, climbing to the nearest existing ancestor", () => {
    const rels = parseNumberedTree(P(
      "1 The world is all that is the case.",
      "1.1 The world is the totality of facts.",
      "1.11 The facts in logical space are the world.",
      "1.2 The world divides into facts.",
      "2 What is the case is a fact.",
      "2.01 An atomic fact is a combination of objects.",
    ));
    expect(rels).not.toBeNull();
    const byLabel = Object.fromEntries(rels!.map((r) => [r.label, r.parentLabel]));
    expect(byLabel).toEqual({
      "1": null,
      "1.1": "1",
      "1.11": "1.1",
      "1.2": "1",
      "2": null,
      "2.01": "2", // 2.0 absent → climb to 2
    });
  });

  it("reports proseStart just past the label token", () => {
    const rels = parseNumberedTree(P("1.1 The world."))!;
    expect(rels[0].proseStart).toBe(4); // "1.1 ".length
    expect("1.1 The world.".slice(rels[0].proseStart)).toBe("The world.");
  });

  it("returns null for ordinary prose (not every paragraph is numbered)", () => {
    expect(parseNumberedTree(P("1 A numbered line.", "Then a plain paragraph."))).toBeNull();
  });

  it("returns null for multi-dot section numbering (out of scope)", () => {
    expect(parseNumberedTree(P("1 A.", "1.2.3 B."))).toBeNull();
  });

  it("returns null on duplicate labels", () => {
    expect(parseNumberedTree(P("1 A.", "1 B."))).toBeNull();
  });
});
