import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SourcePassage } from "@/components/SourcePassage";
import type { InlineAnnotationView } from "@/lib/annotations/types";

const ann = (id: string, s: number, e: number, color: InlineAnnotationView["color"]): InlineAnnotationView => ({
  id, startOffset: s, endOffset: e, color, note: null, tags: [], authorId: "u",
});

describe("SourcePassage", () => {
  it("renders bare text with a data-char-start span", () => {
    const { container } = render(<SourcePassage text="Hello" sourceId="s1" startOffset={0} annotations={[]} />);
    const spans = container.querySelectorAll("span[data-char-start]");
    expect(spans).toHaveLength(1);
    expect(spans[0].getAttribute("data-source-id")).toBe("s1");
    expect(spans[0].textContent).toBe("Hello");
  });

  it("splits overlapping annotations into stacked highlight spans", () => {
    const anns = [ann("a", 0, 4, "yellow"), ann("b", 2, 6, "pink")];
    const { container } = render(<SourcePassage text="abcdef" sourceId="s1" startOffset={0} annotations={anns} />);
    const hls = container.querySelectorAll("span.hl");
    // segments: [0,2) a, [2,4) a+b, [4,6) b  → three highlighted spans
    expect(hls).toHaveLength(3);
    // the overlap segment carries a box-shadow (second underline)
    const overlap = Array.from(hls).find((s) => s.textContent === "cd")!;
    expect((overlap as HTMLElement).style.boxShadow).not.toBe("");
  });
});
