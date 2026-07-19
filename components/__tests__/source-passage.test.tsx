import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourcePassage } from "@/components/SourcePassage";
import { NotesProvider } from "@/components/NotesContext";
import { NotesDrawer } from "@/components/NotesDrawer";
import type { InlineAnnotationView } from "@/lib/annotations/types";

vi.mock("@/lib/actions/annotations", () => ({
  updateInlineAnnotation: async () => {},
  deleteInlineAnnotation: async () => {},
}));

const ann = (id: string, s: number, e: number, color: InlineAnnotationView["color"]): InlineAnnotationView => ({
  id, startOffset: s, endOffset: e, color, note: null, tags: [], authorId: "u", createdAt: new Date().toISOString(),
});

function renderPassage(anns: InlineAnnotationView[], text = "abcdef") {
  return render(
    <NotesProvider entries={[]}>
      <SourcePassage text={text} sourceId="s1" startOffset={0} annotations={anns} />
      <NotesDrawer documentId="d1" />
    </NotesProvider>,
  );
}

describe("SourcePassage", () => {
  it("renders bare text with a data-char-start span", () => {
    const { container } = renderPassage([], "Hello");
    const spans = container.querySelectorAll("span[data-char-start]");
    expect(spans).toHaveLength(1);
    expect(spans[0].getAttribute("data-source-id")).toBe("s1");
    expect(spans[0].textContent).toBe("Hello");
  });

  it("splits overlapping annotations into stacked highlight spans", () => {
    const { container } = renderPassage([ann("a", 0, 4, "yellow"), ann("b", 2, 6, "pink")]);
    const hls = container.querySelectorAll("span.hl");
    // segments: [0,2) a, [2,4) a+b, [4,6) b  → three highlighted spans
    expect(hls).toHaveLength(3);
    const overlap = Array.from(hls).find((s) => s.textContent === "cd")!;
    expect((overlap as HTMLElement).style.boxShadow).not.toBe("");
  });

  it("tags each highlight span with its annotation ids for locate()", () => {
    const { container } = renderPassage([ann("a", 0, 4, "yellow"), ann("b", 2, 6, "pink")]);
    const overlap = Array.from(container.querySelectorAll("span.hl")).find((s) => s.textContent === "cd")!;
    expect(overlap.getAttribute("data-ann-id")).toBe("a b");
  });

  it("opens the notes drawer when a highlight is clicked", () => {
    renderPassage([ann("a", 0, 4, "yellow")]);
    expect(document.querySelector('.notes-drawer[data-open="true"]')).toBeNull();
    fireEvent.click(screen.getByText("abcd"));
    expect(document.querySelector('.notes-drawer[data-open="true"]')).not.toBeNull();
  });
});
