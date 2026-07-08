import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InlineNote } from "@/components/InlineNote";
import type { InlineAnnotationView } from "@/lib/annotations/types";

const update = vi.fn(async () => {});
const remove = vi.fn(async () => {});
vi.mock("@/lib/actions/annotations", () => ({
  updateInlineAnnotation: (...a: unknown[]) => update(...a),
  deleteInlineAnnotation: (...a: unknown[]) => remove(...a),
}));

const withNote: InlineAnnotationView = {
  id: "x", startOffset: 0, endOffset: 5, color: "yellow", note: "**bold** note", tags: ["tag1"], authorId: "u",
};

describe("InlineNote", () => {
  it("renders the Markdown note and tags in view mode", () => {
    render(<InlineNote annotation={withNote} canEdit={false} onClose={() => {}} />);
    expect(screen.getByText("bold").tagName.toLowerCase()).toBe("strong");
    expect(screen.getByText("tag1")).toBeDefined();
  });

  it("saves an edited note when canEdit", () => {
    render(<InlineNote annotation={withNote} canEdit onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByPlaceholderText("Note (Markdown)…"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(update).toHaveBeenCalledWith({ id: "x", note: "changed", tags: ["tag1"] });
  });
});
