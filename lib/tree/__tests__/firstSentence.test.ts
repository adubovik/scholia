import { describe, it, expect } from "vitest";
import { firstSentence } from "@/lib/tree/firstSentence";

describe("firstSentence", () => {
  it("returns text up to the first period boundary", () => {
    expect(firstSentence("Hello world. Second sentence.")).toBe("Hello world.");
  });

  it("handles ! and ? boundaries", () => {
    expect(firstSentence("Really? Yes.")).toBe("Really?");
    expect(firstSentence("Stop! Go.")).toBe("Stop!");
  });

  it("returns the whole string when there is no boundary", () => {
    expect(firstSentence("no terminal punctuation")).toBe("no terminal punctuation");
  });

  it("keeps a terminal period at end of string", () => {
    expect(firstSentence("Only one.")).toBe("Only one.");
  });

  it("trims surrounding whitespace", () => {
    expect(firstSentence("  Leading. Trailing.  ")).toBe("Leading.");
  });

  it("spans newlines within the first sentence", () => {
    expect(firstSentence("Line one\nstill one. Two.")).toBe("Line one\nstill one.");
  });
});
