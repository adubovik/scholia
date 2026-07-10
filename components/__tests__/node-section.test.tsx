import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeSection } from "@/components/NodeSection";
import type { TreeNode } from "@/lib/tree/build";

const node: TreeNode = {
  id: "a", label: "1", title: null, text: "Parent prose.", sourceId: "s1", startOffset: 0, annotations: [], nodeAnnotation: null,
  children: [{ id: "b", label: "1.1", title: null, text: "Child prose.", sourceId: "s1", startOffset: 100, annotations: [], nodeAnnotation: null, children: [] }],
};

const leaf: TreeNode = {
  id: "x", label: null, title: null, text: "First one. Second two.", sourceId: "s1",
  startOffset: 0, annotations: [], nodeAnnotation: null, children: [],
};

// A heading node: its title equals its own range text (import stores the heading
// as both), with prose nested as a child.
const heading: TreeNode = {
  id: "h", label: null, title: "CHAPTER I", text: "CHAPTER I", sourceId: "s1", startOffset: 0,
  annotations: [], nodeAnnotation: null,
  children: [{ id: "p", label: null, title: null, text: "Chapter one prose.", sourceId: "s1", startOffset: 20, annotations: [], nodeAnnotation: null, children: [] }],
};

describe("NodeSection", () => {
  it("renders a heading node's text once (as its head, no duplicate passage)", () => {
    render(<NodeSection node={heading} depth={0} canEdit={false} documentId="d1" />);
    // The heading appears exactly once, and its child prose still renders.
    expect(screen.getAllByText("CHAPTER I")).toHaveLength(1);
    expect(screen.getByText("Chapter one prose.")).toBeDefined();
  });

  it("toggles child visibility when the parent collapse glyph is clicked", () => {
    render(<NodeSection node={node} depth={0} canEdit={false} documentId="d1" />);
    expect(screen.getByText("Child prose.")).toBeDefined();

    // Parent is first in the DOM; the child now has its own toggle too.
    fireEvent.click(screen.getAllByRole("button", { name: "Collapse" })[0]);
    expect(screen.queryByText("Child prose.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Child prose.")).toBeDefined();
  });

  it("collapses a text-only top-level node to its first sentence", () => {
    render(<NodeSection node={leaf} depth={0} canEdit={false} documentId="d1" />);
    expect(screen.getByText(/Second two\./)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByText(/Second two\./)).toBeNull();
    expect(screen.getByText(/First one\./)).toBeDefined();
  });

  it("expands again when the collapsed preview is clicked", () => {
    render(<NodeSection node={leaf} depth={0} canEdit={false} documentId="d1" />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    fireEvent.click(screen.getByText(/First one\./));
    expect(screen.getByText(/Second two\./)).toBeDefined();
  });
});
