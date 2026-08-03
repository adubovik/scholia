import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnnotationPanel } from "@/components/AnnotationPanel";
import { NotesProvider, useNotesActions } from "@/components/NotesContext";
import type { DualNode } from "@/lib/tree/dual";

vi.mock("@/lib/actions/annotations", () => ({
  updateInlineAnnotation: vi.fn(),
  deleteInlineAnnotation: vi.fn(),
}));
vi.mock("@/lib/actions/nodeAnnotations", () => ({
  upsertNodeAnnotation: vi.fn(),
  deleteNodeAnnotation: vi.fn(),
}));

// scrollIntoView isn't implemented in jsdom; cross-panel scroll calls it.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const dnode = (over: Partial<DualNode>): DualNode => ({
  id: "n1", number: "1", kind: "node", nodeId: "n1", noteId: "a1",
  note: "note text", tags: [], color: null, source: "src", title: null, children: [], ...over,
});

/** Drives the context the way the reading-view node menu does. */
function Trigger() {
  const { openAnnotation } = useNotesActions();
  return <button onClick={() => openAnnotation("a1", "n1", true)}>edit-note</button>;
}

function renderPanel(nodes: DualNode[]) {
  return render(
    <NotesProvider entries={[]} sections={{}}>
      <Trigger />
      <AnnotationPanel nodes={nodes} canEdit documentId="d1" />
    </NotesProvider>,
  );
}

describe("AnnotationPanel", () => {
  it("opens the matching note's editor, focused, when the menu asks (openAnnotation edit)", () => {
    const { container } = renderPanel([dnode({})]);
    expect(container.querySelector("textarea")).toBeNull();

    fireEvent.click(screen.getByText("edit-note"));
    const textarea = container.querySelector("textarea");
    expect(textarea?.value).toBe("note text");
    expect(document.activeElement).toBe(textarea);
  });

  it("closes the editor again on Cancel", () => {
    const { container } = renderPanel([dnode({})]);
    fireEvent.click(screen.getByText("edit-note"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("filters the tree by tag", () => {
    renderPanel([
      dnode({ id: "n1", nodeId: "n1", noteId: "a1", note: "keep me", tags: ["foo"] }),
      dnode({ id: "n2", nodeId: "n2", noteId: "a2", note: "hide me", tags: ["bar"], number: "2" }),
    ]);
    expect(screen.getByText("keep me")).toBeDefined();
    expect(screen.getByText("hide me")).toBeDefined();

    // The filter-row chip is the first "#foo" button (the note's own meta chip is second).
    fireEvent.click(screen.getAllByRole("button", { name: "#foo" })[0]);
    expect(screen.getByText("keep me")).toBeDefined();
    expect(screen.queryByText("hide me")).toBeNull();
  });
});
