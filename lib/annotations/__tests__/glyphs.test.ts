import { describe, it, expect } from "vitest";
import { glyphsInTags, displayTags, isGlyphTag, toggleGlyphTag, orderGlyphs } from "@/lib/annotations/glyphs";

describe("glyph system tags", () => {
  it("recognises only the three ':' preset tags", () => {
    expect(isGlyphTag(":summary")).toBe(true);
    expect(isGlyphTag(":question")).toBe(true);
    expect(isGlyphTag(":bogus")).toBe(false);
    expect(isGlyphTag("summary")).toBe(false); // needs the colon
  });

  it("splits a tag list into glyphs (canonical order) and display tags", () => {
    const tags = ["greek", ":insight", "kant", ":summary"];
    expect(glyphsInTags(tags)).toEqual(["summary", "insight"]); // ≡ ? ! order
    expect(displayTags(tags)).toEqual(["greek", "kant"]);
  });

  it("toggles a glyph's system tag on and off", () => {
    expect(toggleGlyphTag(["greek"], "question")).toEqual(["greek", ":question"]);
    expect(toggleGlyphTag(["greek", ":question"], "question")).toEqual(["greek"]);
  });

  it("orders + drops unknown glyph names for the pill", () => {
    expect(orderGlyphs(["insight", "summary", "bogus"])).toEqual(["summary", "insight"]);
  });
});
