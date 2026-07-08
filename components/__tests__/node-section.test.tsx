import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeSection } from "@/components/NodeSection";
import type { TreeNode } from "@/lib/tree/build";

const node: TreeNode = {
  id: "a", label: "1", title: null, text: "Parent prose.", sourceId: "s1", startOffset: 0, annotations: [],
  children: [{ id: "b", label: "1.1", title: null, text: "Child prose.", sourceId: "s1", startOffset: 100, annotations: [], children: [] }],
};

describe("NodeSection", () => {
  it("toggles child visibility when the collapse glyph is clicked", () => {
    render(<NodeSection node={node} depth={0} canEdit={false} />);
    expect(screen.getByText("Child prose.")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByText("Child prose.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Child prose.")).toBeDefined();
  });
});
