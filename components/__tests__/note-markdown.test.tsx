import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoteMarkdown } from "@/components/NoteMarkdown";
import { NotesProvider, useActiveNode, useActiveAnn } from "@/components/NotesContext";
import type { SectionTarget } from "@/lib/tree/dual";

// scrollToSection ends in scrollIntoView (which jsdom doesn't implement), deferred a
// frame via requestAnimationFrame — run the frame synchronously so the assertion sees it.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (cb(0), 0));
});

const sections: Record<string, SectionTarget> = {
  "1.1": { annId: null, nodeId: "n11" },
  "1.1_1": { annId: "a1", nodeId: "n11" },
};

// Probe the active-selection store the way the prose/panel rows do.
function ActiveProbe() {
  const node = useActiveNode("n11");
  const ann = useActiveAnn("a1");
  return <div data-testid="probe" data-node={String(node)} data-ann={String(ann)} />;
}

function renderNote(note: string) {
  return render(
    <NotesProvider entries={[]} sections={sections}>
      {/* the reading panel scrollToSection targets */}
      <div data-panel="reading">
        <div data-node-id="n11" data-ann-id="a1" />
      </div>
      <ActiveProbe />
      <NoteMarkdown note={note} />
    </NotesProvider>,
  );
}

describe("NoteMarkdown §-references", () => {
  it("renders a bare §1.1 as a clickable .xref (the reported bug)", () => {
    const { container } = renderNote("See §1.1 for context.");
    const ref = container.querySelector("button.xref");
    expect(ref?.textContent).toBe("§1.1");
  });

  it("pretty-prints the inline index as a subscript (§1.1_1 → §1.1₁)", () => {
    const { container } = renderNote("Compare §1.1_1.");
    const ref = container.querySelector("button.xref");
    expect(ref?.querySelector("sub")?.textContent).toBe("1");
    expect(ref?.textContent).toBe("§1.11"); // "§1.1" + subscript "1"
  });

  it("clicking a block reference scrolls the reading panel and selects the node", () => {
    const { getByTestId } = renderNote("See §1.1.");
    const target = document.querySelector<HTMLElement>('[data-node-id="n11"]')!;
    fireEvent.click(screen.getByRole("button", { name: "§1.1" }));
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(getByTestId("probe").dataset.node).toBe("true");
  });

  it("clicking an inline reference selects only the highlight, not its text block", () => {
    const { getByTestId } = renderNote("Compare §1.1_1.");
    fireEvent.click(screen.getByRole("button"));
    const probe = getByTestId("probe");
    expect(probe.dataset.ann).toBe("true"); // the annotation is selected
    expect(probe.dataset.node).toBe("false"); // its text block is NOT embossed
  });

  it("leaves a real markdown link a real link", () => {
    const { container } = renderNote("[docs](http://example.com)");
    expect(container.querySelector("button.xref")).toBeNull();
    expect(container.querySelector('a[href="http://example.com"]')).not.toBeNull();
  });
});
