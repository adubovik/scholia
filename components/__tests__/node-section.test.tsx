import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeSection } from "@/components/NodeSection";
import { CollapseProvider } from "@/components/CollapseContext";
import { NotesProvider } from "@/components/NotesContext";
import type { TreeNode } from "@/lib/tree/build";

// NodeSection reads collapse + notes actions from providers, and its SourcePassage
// reads notes actions too — both wrappers are required.
const NUMS = new Map([["a", "1"], ["b", "1.1"], ["x", "1"], ["h", "1"], ["p", "1.1"]]);
// short = own segment; the reading column carries both (toggle picks which shows).
const NUMS_SHORT = new Map([["a", "1"], ["b", "1"], ["x", "1"], ["h", "1"], ["p", "1"]]);
const renderNode = (n: TreeNode) =>
  render(
    <NotesProvider entries={[]} sections={{}}>
      <CollapseProvider>
        <NodeSection node={n} depth={0} canEdit={false} documentId="d1" numbers={NUMS} numbersShort={NUMS_SHORT} />
      </CollapseProvider>
    </NotesProvider>,
  );

const node: TreeNode = {
  id: "a", label: "1", alias: null, title: null, text: "Parent prose.", sourceId: "s1", startOffset: 0, annotations: [], layerNotes: [], nodeAnnotation: null,
  children: [{ id: "b", label: "1.1", alias: null, title: null, text: "Child prose.", sourceId: "s1", startOffset: 100, annotations: [], layerNotes: [], nodeAnnotation: null, children: [] }],
};

const leaf: TreeNode = {
  id: "x", label: null, alias: null, title: null, text: "First one. Second two.", sourceId: "s1",
  startOffset: 0, annotations: [], layerNotes: [], nodeAnnotation: null, children: [],
};

// A heading node: its title equals its own range text (import stores the heading
// as both), with prose nested as a child.
const heading: TreeNode = {
  id: "h", label: null, alias: null, title: "CHAPTER I", text: "CHAPTER I", sourceId: "s1", startOffset: 0,
  annotations: [], layerNotes: [], nodeAnnotation: null,
  children: [{ id: "p", label: null, alias: null, title: null, text: "Chapter one prose.", sourceId: "s1", startOffset: 20, annotations: [], layerNotes: [], nodeAnnotation: null, children: [] }],
};

// Three direct children (each with a child of its own, to prove the count is direct
// children only and not the whole subtree).
const many: TreeNode = {
  id: "a", label: "1", alias: null, title: null, text: "", sourceId: "s1", startOffset: 0, annotations: [], layerNotes: [], nodeAnnotation: null,
  children: ["b", "c", "d"].map((id) => ({
    id, label: null, alias: null, title: null, text: `${id} prose.`, sourceId: "s1", startOffset: 100,
    annotations: [], layerNotes: [], nodeAnnotation: null,
    children: [{ id: `${id}1`, label: null, alias: null, title: null, text: "grandchild.", sourceId: "s1", startOffset: 200, annotations: [], layerNotes: [], nodeAnnotation: null, children: [] }],
  })),
};

describe("child count", () => {
  it("shows the number of direct children", () => {
    const { container } = renderNode(many);
    expect(container.querySelector(".node-num-count")?.textContent).toBe("·3");
  });

  // Not just "the text ·1 is absent" — no element at all, so a single child adds
  // nothing to the identifier whatever it might have rendered.
  it("stays silent for a single child", () => {
    const { container } = renderNode(node);
    expect(container.querySelector(".node-num-count")).toBeNull();
  });

  it("stays silent for a leaf", () => {
    const { container } = renderNode(leaf);
    expect(container.querySelector(".node-num-count")).toBeNull();
  });
});

describe("NodeSection", () => {
  it("renders a heading node's text once (as its head, no duplicate passage)", () => {
    renderNode(heading);
    // The heading appears exactly once, and its child prose still renders.
    expect(screen.getAllByText("CHAPTER I")).toHaveLength(1);
    expect(screen.getByText("Chapter one prose.")).toBeDefined();
  });

  it("toggles child visibility when the parent collapse glyph is clicked", () => {
    renderNode(node);
    expect(screen.getByText("Child prose.")).toBeDefined();

    // Parent is first in the DOM; the child now has its own toggle too.
    fireEvent.click(screen.getAllByRole("button", { name: "Collapse" })[0]);
    expect(screen.queryByText("Child prose.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Child prose.")).toBeDefined();
  });

  it("collapses a text-only top-level node to its first sentence", () => {
    renderNode(leaf);
    expect(screen.getByText(/Second two\./)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByText(/Second two\./)).toBeNull();
    expect(screen.getByText(/First one\./)).toBeDefined();
  });

  it("expands again when the collapsed preview is clicked", () => {
    renderNode(leaf);
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    fireEvent.click(screen.getByText(/First one\./));
    expect(screen.getByText(/Second two\./)).toBeDefined();
  });
});
