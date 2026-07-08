import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadingSurface } from "@/components/ReadingSurface";
import type { TreeNode } from "@/lib/tree/build";

const tree: TreeNode[] = [
  {
    id: "a", label: "1", title: null, text: "Root prose.",
    children: [{ id: "b", label: "1.1", title: null, text: "Child prose.", children: [] }],
  },
];

describe("ReadingSurface", () => {
  it("renders the title, node labels, and nested prose", () => {
    render(<ReadingSurface title="Tractatus" tree={tree} canEdit={false} />);
    expect(screen.getByRole("heading", { name: "Tractatus" })).toBeDefined();
    expect(screen.getByText("Root prose.")).toBeDefined();
    expect(screen.getByText("Child prose.")).toBeDefined();
    expect(screen.getByText("1.1")).toBeDefined();
  });
});
