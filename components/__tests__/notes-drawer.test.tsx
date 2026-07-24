import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotesDrawer } from "@/components/NotesDrawer";
import { NotesProvider, useNotesActions } from "@/components/NotesContext";
import type { NoteEntry } from "@/lib/annotations/entries";

vi.mock("@/lib/actions/annotations", () => ({
  updateInlineAnnotation: vi.fn(),
  deleteInlineAnnotation: vi.fn(),
}));
vi.mock("@/lib/actions/nodeAnnotations", () => ({
  upsertNodeAnnotation: vi.fn(),
  deleteNodeAnnotation: vi.fn(),
}));

// jsdom has no scroll implementation; the drawer scrolls its list on selection.
beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
});

const entry = (id: string, nodeId: string, label: string): NoteEntry => ({
  id, kind: "node", nodeId, nodeLabel: label, nodeTitle: null,
  color: null, snippet: "", note: "note text", tags: [],
  createdAt: new Date().toISOString(),
});

// n2a ("2.1") exists in the tree but has no annotation yet — the case that decides
// where an unsaved composer goes.
const SECTIONS = { "1": "n1", "2": "n2", "2.1": "n2a", "3": "n3" };
const ENTRIES = [entry("a1", "n1", "1"), entry("a2", "n2", "2"), entry("a3", "n3", "3")];

/** Buttons that drive the context the way the prose and the popover do. */
function Trigger() {
  const { composeNode, openAnnotation } = useNotesActions();
  return (
    <>
      <button onClick={() => composeNode("n2a")}>compose</button>
      <button onClick={() => openAnnotation("a2", "n2", true)}>open-editing</button>
    </>
  );
}

function renderDrawer() {
  return render(
    <NotesProvider entries={ENTRIES} sections={SECTIONS}>
      <Trigger />
      <NotesDrawer documentId="d1" />
    </NotesProvider>,
  );
}

const cardOrder = (c: HTMLElement) =>
  [...c.querySelectorAll("[data-card-id]")].map((el) => el.getAttribute("data-card-id"));

describe("NotesDrawer", () => {
  it("slots a new node-note composer into document order, not at the top", () => {
    const { container } = renderDrawer();
    expect(cardOrder(container)).toEqual(["a1", "a2", "a3"]);

    fireEvent.click(screen.getByText("compose"));
    // §2.1 sits after §2 and before §3
    expect(cardOrder(container)).toEqual(["a1", "a2", "compose", "a3"]);
  });

  it("opens the composer focused", () => {
    renderDrawer();
    fireEvent.click(screen.getByText("compose"));
    expect(document.activeElement).toBe(screen.getByPlaceholderText("Note (Markdown)…"));
  });

  it("opens an existing card straight into a focused editor when asked", () => {
    const { container } = renderDrawer();
    expect(container.querySelector("textarea")).toBeNull();

    fireEvent.click(screen.getByText("open-editing"));
    const textarea = container.querySelector("textarea");
    expect(textarea?.value).toBe("note text");
    expect(document.activeElement).toBe(textarea);
  });

  it("closes the editor again on Cancel", () => {
    const { container } = renderDrawer();
    fireEvent.click(screen.getByText("open-editing"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(container.querySelector("textarea")).toBeNull();
  });
});
