import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagEditor } from "@/components/TagEditor";

describe("TagEditor", () => {
  it("adds a tag on Enter via onChange", () => {
    const onChange = vi.fn();
    render(<TagEditor tags={["a"]} onChange={onChange} />);
    const input = screen.getByPlaceholderText("tag");
    fireEvent.change(input, { target: { value: "b" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("removes a tag when its chip is clicked", () => {
    const onChange = vi.fn();
    render(<TagEditor tags={["a", "b"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "a ×" }));
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("ignores a duplicate tag", () => {
    const onChange = vi.fn();
    render(<TagEditor tags={["a"]} onChange={onChange} />);
    const input = screen.getByPlaceholderText("tag");
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
