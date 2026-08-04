import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  NotesProvider,
  CentredPanel,
  useNotesActions,
  useNotesState,
  usePanelCentred,
} from "@/components/NotesContext";

// scrollIntoView isn't implemented in jsdom; the open path calls it via scrollPanels.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

/** Mirrors how a panel row picks its click action: toggle (close-on-re-click) when
 * centred, plain open (never closes) when it's the drawer copy. */
function Probe({ prefix = "" }: { prefix?: string }) {
  const { openAnnotation, toggleAnnotation } = useNotesActions();
  const select = usePanelCentred() ? toggleAnnotation : openAnnotation;
  const { drawerOpen } = useNotesState();
  return (
    <>
      <span data-testid={`${prefix}open`}>{drawerOpen ? "open" : "closed"}</span>
      <button onClick={() => select("a1", null)}>{prefix}a1</button>
      <button onClick={() => select("a2", null)}>{prefix}a2</button>
    </>
  );
}

const openState = (prefix = "") => screen.getByTestId(`${prefix}open`).textContent;

/** A centred probe (toggles) alongside a drawer-copy probe (never closes) — both under
 * the same provider, so they share one drawerOpen. */
function renderProbes() {
  return render(
    <NotesProvider entries={[]} sections={{}}>
      <CentredPanel>
        <Probe />
      </CentredPanel>
      <Probe prefix="drawer-" />
    </NotesProvider>,
  );
}

describe("centred-panel annotation click ⇄ drawer", () => {
  it("opens, then a second click on the same annotation closes the drawer, and a third reopens", () => {
    renderProbes();
    expect(openState()).toBe("closed");

    fireEvent.click(screen.getByText("a1"));
    expect(openState()).toBe("open");

    fireEvent.click(screen.getByText("a1"));
    expect(openState()).toBe("closed");

    fireEvent.click(screen.getByText("a1"));
    expect(openState()).toBe("open");
  });

  it("clicking a different annotation while open re-selects without closing", () => {
    renderProbes();
    fireEvent.click(screen.getByText("a1"));
    fireEvent.click(screen.getByText("a2"));
    expect(openState()).toBe("open");
  });

  it("a drawer-copy row never closes the drawer it lives in (re-click keeps it open)", () => {
    renderProbes();
    fireEvent.click(screen.getByText("drawer-a1")); // opens + selects a1
    expect(openState()).toBe("open");
    fireEvent.click(screen.getByText("drawer-a1")); // re-click must NOT close
    expect(openState()).toBe("open");
  });
});
