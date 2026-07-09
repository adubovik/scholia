import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourcePassage } from "@/components/SourcePassage";
import type { InlineAnnotationView } from "@/lib/annotations/types";

vi.mock("@/lib/actions/annotations", () => ({
  updateInlineAnnotation: async () => {},
  deleteInlineAnnotation: async () => {},
}));

const ann = (id: string, s: number, e: number, color: InlineAnnotationView["color"]): InlineAnnotationView => ({
  id, startOffset: s, endOffset: e, color, note: null, tags: [], authorId: "u",
});

describe("SourcePassage", () => {
  it("renders bare text with a data-char-start span", () => {
    const { container } = render(<SourcePassage text="Hello" sourceId="s1" startOffset={0} annotations={[]} canEdit={false} />);
    const spans = container.querySelectorAll("span[data-char-start]");
    expect(spans).toHaveLength(1);
    expect(spans[0].getAttribute("data-source-id")).toBe("s1");
    expect(spans[0].textContent).toBe("Hello");
  });

  it("splits overlapping annotations into stacked highlight spans", () => {
    const anns = [ann("a", 0, 4, "yellow"), ann("b", 2, 6, "pink")];
    const { container } = render(<SourcePassage text="abcdef" sourceId="s1" startOffset={0} annotations={anns} canEdit={false} />);
    const hls = container.querySelectorAll("span.hl");
    // segments: [0,2) a, [2,4) a+b, [4,6) b  → three highlighted spans
    expect(hls).toHaveLength(3);
    // the overlap segment carries a box-shadow (second underline)
    const overlap = Array.from(hls).find((s) => s.textContent === "cd")!;
    expect((overlap as HTMLElement).style.boxShadow).not.toBe("");
  });

  it("opens a note when a single-annotation span is clicked", () => {
    const anns = [ann("a", 0, 4, "yellow")];
    render(<SourcePassage text="abcdef" sourceId="s1" startOffset={0} annotations={anns} canEdit={false} />);
    fireEvent.click(screen.getByText("abcd"));
    expect(document.querySelector(".inline-note")).not.toBeNull();
  });

  it("shows a picker when an overlapping span is clicked", () => {
    const anns = [ann("a", 0, 4, "yellow"), ann("b", 2, 6, "pink")];
    render(<SourcePassage text="abcdef" sourceId="s1" startOffset={0} annotations={anns} canEdit={false} />);
    fireEvent.click(screen.getByText("cd")); // overlap region: two annotations
    expect(document.querySelector(".note-picker")).not.toBeNull();
  });

  it("opening an overlap picker closes a previously open note", () => {
    const anns = [ann("a", 0, 6, "yellow"), ann("b", 2, 4, "pink")];
    render(<SourcePassage text="abcdef" sourceId="s1" startOffset={0} annotations={anns} canEdit={false} />);
    // Click "ab" to open annotation 'a' (single annotation)
    fireEvent.click(screen.getByText("ab"));
    expect(document.querySelector(".inline-note")).not.toBeNull();
    // Click "cd" to show the picker (two annotations: a and b)
    fireEvent.click(screen.getByText("cd"));
    expect(document.querySelector(".note-picker")).not.toBeNull();
    expect(document.querySelector(".inline-note")).toBeNull();
  });
});
