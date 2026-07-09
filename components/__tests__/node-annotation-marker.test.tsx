import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeAnnotationMarker } from "@/components/NodeAnnotationMarker";

describe("NodeAnnotationMarker", () => {
  it("renders a hollow 'Add note' dot when there is no note", () => {
    render(<NodeAnnotationMarker hasNote={false} onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: "Add note" })).toBeDefined();
  });

  it("renders a solid 'Note' dot when a note exists and fires onOpen", () => {
    const onOpen = vi.fn();
    render(<NodeAnnotationMarker hasNote onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
