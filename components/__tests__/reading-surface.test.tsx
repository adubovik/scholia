import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadingSurface } from "@/components/ReadingSurface";
import type { TreeNode } from "@/lib/tree/build";

const tree: TreeNode[] = [
  {
    id: "a", label: "1", alias: null, title: null, text: "Root prose.", sourceId: "s1", startOffset: 0, annotations: [], nodeAnnotation: null,
    children: [{ id: "b", label: "1.1", alias: null, title: null, text: "Child prose.", sourceId: "s1", startOffset: 0, annotations: [], nodeAnnotation: null, children: [] }],
  },
];

describe("ReadingSurface", () => {
  it("renders the title, node labels, and nested prose", () => {
    render(
      <ReadingSurface
        document={{
          title: "Tractatus",
          author: "Wittgenstein",
          sourceUrl: null,
          tree,
          documentId: "d1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }}
        canEdit={false}
        docs={[{ id: "d1", title: "Tractatus", author: "", nodeCount: 2, highlightCount: 0, noteCount: 0 }]}
        canInvite={false}
        invites={[]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Tractatus" })).toBeDefined();
    expect(screen.getByText("Root prose.")).toBeDefined();
    expect(screen.getByText("Child prose.")).toBeDefined();
    expect(screen.getByText("1.1")).toBeDefined();
  });

  it("renders the empty home surface (no document) with a pick-a-text hint", () => {
    render(
      <ReadingSurface
        canEdit
        docs={[{ id: "d1", title: "Tractatus", author: "", nodeCount: 2, highlightCount: 0, noteCount: 0 }]}
        canInvite={false}
        invites={[]}
      />,
    );
    expect(screen.getByText("No text open.")).toBeDefined();
    expect(screen.queryByText("Root prose.")).toBeNull();
  });
});
