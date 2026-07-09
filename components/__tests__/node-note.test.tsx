import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeNote } from "@/components/NodeNote";
import type { NodeAnnotationView } from "@/lib/annotations/types";

const upsert = vi.fn(async () => "id1");
const remove = vi.fn(async () => {});
vi.mock("@/lib/actions/nodeAnnotations", () => ({
  upsertNodeAnnotation: (...a: unknown[]) => upsert(...a),
  deleteNodeAnnotation: (...a: unknown[]) => remove(...a),
}));

const withNote: NodeAnnotationView = {
  id: "x", nodeId: "n1", note: "**bold** node note", tags: ["tag1"], authorId: "u",
};

describe("NodeNote", () => {
  it("renders the Markdown note and tags in view mode", () => {
    render(<NodeNote documentId="d1" nodeId="n1" annotation={withNote} canEdit={false} onClose={() => {}} />);
    expect(screen.getByText("bold").tagName.toLowerCase()).toBe("strong");
    expect(screen.getByText("tag1")).toBeDefined();
  });

  it("opens in edit mode for a node with no note and upserts on Save", () => {
    render(<NodeNote documentId="d1" nodeId="n1" annotation={null} canEdit onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Note (Markdown)…"), { target: { value: "new note" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(upsert).toHaveBeenCalledWith({ documentId: "d1", nodeId: "n1", note: "new note", tags: [] });
  });
});
