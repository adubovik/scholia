import { describe, it, expect } from "vitest";
import { fromMarkup, isMarkupEditable, toMarkup } from "@/lib/annotations/markup";

// A node at source offset 100 reading "Text text blah something and something else".
const NODE = "Text text blah something and something else";
const START = 100;
const at = (id: string, s: number, e: number) => ({ id, startOffset: START + s, endOffset: START + e });
const A = at("a", 15, 24); // "something"
const B = at("b", 29, 43); // "something else"

describe("isMarkupEditable", () => {
  const end = START + NODE.length;
  it("accepts highlights that sit apart inside the node", () => {
    expect(isMarkupEditable([B, A], START, end)).toBe(true);
    expect(isMarkupEditable([], START, end)).toBe(true);
  });
  it("rejects an overlapping pair — the syntax cannot write one", () => {
    expect(isMarkupEditable([A, at("c", 20, 30)], START, end)).toBe(false);
  });
  it("rejects a highlight running past the node's own range", () => {
    expect(isMarkupEditable([at("c", 40, 60)], START, end)).toBe(false);
    expect(isMarkupEditable([at("c", -3, 4)], START, end)).toBe(false);
  });
  it("treats touching highlights as editable (end is exclusive)", () => {
    expect(isMarkupEditable([at("c", 0, 4), at("d", 4, 9)], START, end)).toBe(true);
  });
});

describe("toMarkup", () => {
  it("numbers markers by where they read, not by input order", () => {
    expect(toMarkup(NODE, START, [B, A])).toBe("Text text blah [something][1] and [something else][2]");
  });
  it("returns the plain text unchanged when there is nothing to mark", () => {
    expect(toMarkup(NODE, START, [])).toBe(NODE);
  });
});

describe("fromMarkup", () => {
  const parse = (s: string, n = 2) => fromMarkup(s, n);

  it("round-trips an untouched passage", () => {
    const r = parse(toMarkup(NODE, START, [A, B]));
    expect(r).toEqual({
      ok: true,
      text: NODE,
      spans: [{ index: 1, start: 15, end: 24 }, { index: 2, start: 29, end: 43 }],
    });
  });

  it("re-anchors a highlight that the edit moved", () => {
    const r = parse("Well, [something else][2] and [something][1]");
    expect(r.ok && r.text).toBe("Well, something else and something");
    expect(r.ok && r.spans).toEqual([
      { index: 2, start: 6, end: 20 },
      { index: 1, start: 25, end: 34 },
    ]);
  });

  it("follows a rewrite of the highlighted words themselves", () => {
    const r = parse("Text text blah [summat][1] and [something else][2]");
    expect(r.ok && r.spans[0]).toEqual({ index: 1, start: 15, end: 21 });
  });

  it("refuses a removed, duplicated, invented or emptied highlight", () => {
    expect(parse("Text [something][1] and nothing")).toMatchObject({ ok: false });
    expect(parse("[a][1] [b][1] [c][2]")).toMatchObject({ ok: false });
    expect(parse("[a][1] [b][2] [c][3]")).toMatchObject({ ok: false });
    expect(parse("[][1] [b][2]")).toMatchObject({ ok: false });
  });

  it("leaves a bare editorial bracket alone", () => {
    const r = fromMarkup("Caesar [sic] crossed [the river][1]", 1);
    expect(r.ok && r.text).toBe("Caesar [sic] crossed the river");
    expect(r.ok && r.spans).toEqual([{ index: 1, start: 21, end: 30 }]);
  });
});
