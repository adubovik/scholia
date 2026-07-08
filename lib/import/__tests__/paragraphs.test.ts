import { describe, it, expect } from "vitest";
import { normalizeText, paragraphize } from "@/lib/import/paragraphs";

describe("normalizeText", () => {
  it("converts CRLF and CR to LF", () => {
    expect(normalizeText("a\r\nb\rc")).toBe("a\nb\nc");
  });
});

describe("paragraphize", () => {
  it("splits on blank lines and reports offsets into the input", () => {
    const input = "First para.\n\nSecond para.";
    const paras = paragraphize(input);
    expect(paras.map(p => p.text)).toEqual(["First para.", "Second para."]);
    expect(input.slice(paras[0].start, paras[0].end)).toBe("First para.");
    expect(input.slice(paras[1].start, paras[1].end)).toBe("Second para.");
  });

  it("treats runs of blank lines (with spaces/tabs) as one separator and trims", () => {
    const input = "  A line\nstill A\n \t\n\n  B line  ";
    const paras = paragraphize(input);
    expect(paras.map(p => p.text)).toEqual(["A line\nstill A", "B line"]);
    for (const p of paras) expect(input.slice(p.start, p.end)).toBe(p.text);
  });

  it("returns [] for blank input", () => {
    expect(paragraphize("   \n\n  ")).toEqual([]);
  });
});
