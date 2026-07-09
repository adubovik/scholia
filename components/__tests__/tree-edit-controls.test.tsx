import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TreeEditControls } from "@/components/TreeEditControls";

describe("TreeEditControls", () => {
  it("shows an 'Add note' pencil and no move/indent controls for viewers", () => {
    render(<TreeEditControls nodeId="n1" canEdit={false} hasNote={false} onOpenNote={() => {}} />);
    expect(screen.getByRole("button", { name: "Add note" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
  });

  it("marks the pencil 'Note' and fires onOpenNote when a note exists", () => {
    const onOpenNote = vi.fn();
    render(<TreeEditControls nodeId="n1" canEdit={false} hasNote onOpenNote={onOpenNote} />);
    const pencil = screen.getByRole("button", { name: "Note" });
    expect(pencil.className).toContain("note-pencil--set");
    fireEvent.click(pencil);
    expect(onOpenNote).toHaveBeenCalledOnce();
  });

  it("renders the move/indent grid for editors", () => {
    render(<TreeEditControls nodeId="n1" canEdit hasNote={false} onOpenNote={() => {}} />);
    expect(screen.getByRole("button", { name: "Move up" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Indent" })).toBeDefined();
  });
});
