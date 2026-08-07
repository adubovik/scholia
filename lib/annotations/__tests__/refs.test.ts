import { describe, it, expect } from "vitest";
import { remarkSectionRefs, refHref, refFromHref } from "@/lib/annotations/refs";

// The transformer mutates the mdast tree in place; build a minimal one and run it.
type Md = { type: string; value?: string; url?: string; children?: Md[] };
const para = (...children: Md[]): Md => ({ type: "root", children: [{ type: "paragraph", children }] });
const run = (tree: Md) => {
  remarkSectionRefs()(tree);
  return tree.children![0].children!;
};

describe("remarkSectionRefs", () => {
  it("links a block reference and an inline reference in prose", () => {
    const out = run(para({ type: "text", value: "see §1.1 and §1.1_1 done" }));
    expect(out).toEqual([
      { type: "text", value: "see " },
      { type: "link", url: "#xref-1.1", children: [{ type: "text", value: "§1.1" }] },
      { type: "text", value: " and " },
      { type: "link", url: "#xref-1.1_1", children: [{ type: "text", value: "§1.1_1" }] },
      { type: "text", value: " done" },
    ]);
  });

  it("handles compound roman-numeral numbers and stops at a trailing period", () => {
    const out = run(para({ type: "text", value: "cf. §IV.Prop.LXI." }));
    expect(out).toEqual([
      { type: "text", value: "cf. " },
      { type: "link", url: "#xref-IV.Prop.LXI", children: [{ type: "text", value: "§IV.Prop.LXI" }] },
      { type: "text", value: "." },
    ]);
  });

  it("leaves code spans and existing links untouched", () => {
    const out = run(
      para(
        { type: "inlineCode", value: "§1.1" },
        { type: "link", url: "http://x", children: [{ type: "text", value: "§1.1" }] },
      ),
    );
    expect(out).toEqual([
      { type: "inlineCode", value: "§1.1" },
      { type: "link", url: "http://x", children: [{ type: "text", value: "§1.1" }] },
    ]);
  });

  it("leaves reference-free text as a single node", () => {
    const out = run(para({ type: "text", value: "no refs here" }));
    expect(out).toEqual([{ type: "text", value: "no refs here" }]);
  });
});

describe("ref href round-trip", () => {
  it("encodes and decodes the reference key", () => {
    expect(refHref("1.1_1")).toBe("#xref-1.1_1");
    expect(refFromHref("#xref-1.1_1")).toBe("1.1_1");
    expect(refFromHref("http://example.com")).toBeNull();
    expect(refFromHref(undefined)).toBeNull();
  });
});
