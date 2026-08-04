import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagEditor } from "@/components/TagEditor";

describe("TagEditor", () => {
  // The input is collapsed behind a + button; reveal it before typing.
  function openInput() {
    fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
    return screen.getByPlaceholderText("add tag…");
  }

  it("adds a tag on Enter via onChange", () => {
    const onChange = vi.fn();
    render(<TagEditor tags={["a"]} onChange={onChange} />);
    const input = openInput();
    fireEvent.change(input, { target: { value: "b" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("removes a tag when its chip is clicked", () => {
    const onChange = vi.fn();
    render(<TagEditor tags={["a", "b"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove tag a" }));
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("keeps the input collapsed behind + until clicked", () => {
    render(<TagEditor tags={[]} onChange={vi.fn()} />);
    expect(screen.queryByPlaceholderText("add tag…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
    expect(screen.getByPlaceholderText("add tag…")).toBeTruthy();
  });

  it("ignores a duplicate tag", () => {
    const onChange = vi.fn();
    render(<TagEditor tags={["a"]} onChange={onChange} />);
    const input = openInput();
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
