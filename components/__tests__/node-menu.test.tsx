import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { TreeNode } from "@/lib/tree/build";

const indent = vi.fn();
const moveDown = vi.fn();
vi.mock("@/lib/actions/tree", () => ({
  indentNode: (...a: unknown[]) => indent(...a),
  outdentNode: vi.fn(),
  moveNodeUp: vi.fn(),
  moveNodeDown: (...a: unknown[]) => moveDown(...a),
}));
// NodeSection → NodeNote pulls these in; keep them inert in jsdom.
vi.mock("@/lib/actions/nodeAnnotations", () => ({
  upsertNodeAnnotation: vi.fn(),
  deleteNodeAnnotation: vi.fn(),
}));

import { MenuItems, NodeMenuHint, RootMenu } from "@/components/NodeMenu";
import { NodeSection } from "@/components/NodeSection";
import { CollapseProvider } from "@/components/CollapseContext";

// Stub Radix's Item/Separator so we can exercise item logic without opening a
// portal-based menu in jsdom.
const StubItem = ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
  <button onClick={() => onSelect?.()}>{children}</button>
);
const StubSep = () => <hr />;

beforeEach(() => vi.clearAllMocks());

function renderItems(props: {
  canEdit: boolean;
  hasNote: boolean;
  hasChildren?: boolean;
  onOpenNote?: () => void;
  onCollapseChildren?: () => void;
  onExpandChildren?: () => void;
}) {
  return render(
    <MenuItems
      nodeId="n1"
      onOpenNote={props.onOpenNote ?? (() => {})}
      onCollapseChildren={props.onCollapseChildren ?? (() => {})}
      onExpandChildren={props.onExpandChildren ?? (() => {})}
      canEdit={props.canEdit}
      hasNote={props.hasNote}
      hasChildren={props.hasChildren ?? false}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Item={StubItem as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Separator={StubSep as any}
    />,
  );
}

describe("MenuItems", () => {
  it("hides editor actions (restructuring + note) from viewers", () => {
    renderItems({ canEdit: false, hasNote: false });
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add note" })).toBeNull();
  });

  it("labels the note action 'Edit note' when a note exists", () => {
    renderItems({ canEdit: true, hasNote: true });
    expect(screen.getByRole("button", { name: "Edit note" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Add note" })).toBeNull();
  });

  it("gives editors the restructuring actions, wired to the server actions", () => {
    renderItems({ canEdit: true, hasNote: false });
    expect(screen.getByRole("button", { name: "Move up" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Indent" }));
    expect(indent).toHaveBeenCalledWith("n1");
  });

  it("fires onOpenNote when the note action is chosen", () => {
    const onOpenNote = vi.fn();
    renderItems({ canEdit: true, hasNote: false, onOpenNote });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(onOpenNote).toHaveBeenCalledOnce();
  });

  it("offers Collapse/Expand children only when the node has children", () => {
    renderItems({ canEdit: false, hasNote: false, hasChildren: false });
    expect(screen.queryByRole("button", { name: "Collapse children" })).toBeNull();

    const onCollapseChildren = vi.fn();
    const onExpandChildren = vi.fn();
    renderItems({ canEdit: false, hasNote: false, hasChildren: true, onCollapseChildren, onExpandChildren });
    fireEvent.click(screen.getByRole("button", { name: "Collapse children" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand children" }));
    expect(onCollapseChildren).toHaveBeenCalledOnce();
    expect(onExpandChildren).toHaveBeenCalledOnce();
  });

  it("keeps shortcut hints out of the item's accessible name", () => {
    renderItems({ canEdit: true, hasNote: false });
    // aria-hidden <kbd> ⌥↑ must not fold into the name "Move up".
    expect(screen.getByRole("button", { name: "Move up" })).toBeDefined();
  });
});

describe("NodeMenuHint", () => {
  it("renders a labelled ⋯ trigger", () => {
    render(<NodeMenuHint nodeId="n1" canEdit hasNote={false} onOpenNote={() => {}} />);
    expect(screen.getByRole("button", { name: "Node actions" })).toBeDefined();
  });

  it("runs non-clashing keyboard shortcuts when focused (Alt+↓ move, Alt+] indent)", () => {
    render(<NodeMenuHint nodeId="n1" canEdit hasNote={false} onOpenNote={() => {}} />);
    const hint = screen.getByRole("button", { name: "Node actions" });
    fireEvent.keyDown(hint, { key: "ArrowDown", altKey: true });
    expect(moveDown).toHaveBeenCalledWith("n1");
    fireEvent.keyDown(hint, { key: "]", code: "BracketRight", altKey: true });
    expect(indent).toHaveBeenCalledWith("n1");
  });

  it("ignores the same keys without Alt (leaves them to Radix / the browser)", () => {
    render(<NodeMenuHint nodeId="n1" canEdit hasNote={false} onOpenNote={() => {}} />);
    const hint = screen.getByRole("button", { name: "Node actions" });
    fireEvent.keyDown(hint, { key: "ArrowDown" });
    expect(moveDown).not.toHaveBeenCalled();
  });
});

// Minimal heading node (isHeading → no SourcePassage render) keeps the graph light.
function node(over: Partial<TreeNode> = {}): TreeNode {
  return {
    id: "n1", label: null, title: "Title", text: "Title",
    sourceId: "s1", startOffset: 0, annotations: [], nodeAnnotation: null,
    children: [], ...over,
  };
}
const ann = { id: "a1", nodeId: "n1", note: "hi", tags: [], authorId: "u1" };

function renderNode(node: TreeNode, canEdit: boolean) {
  return render(
    <CollapseProvider>
      <NodeSection node={node} depth={0} canEdit={canEdit} documentId="d1" />
    </CollapseProvider>,
  );
}

describe("NodeSection gutter", () => {
  it("shows no marker or hint for a viewer on a childless, un-annotated node", () => {
    renderNode(node(), false);
    expect(screen.queryByRole("button", { name: /note/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Node actions" })).toBeNull();
  });

  it("shows the ¶ marker when a note exists and toggles the note open", () => {
    renderNode(node({ nodeAnnotation: ann }), false);
    const marker = screen.getByRole("button", { name: "Show note" });
    expect(marker.textContent).toBe("¶");
    fireEvent.click(marker);
    expect(screen.getByRole("button", { name: "Hide note" })).toBeDefined();
  });

  it("gives editors the ⋮ hint", () => {
    renderNode(node(), true);
    expect(screen.getByRole("button", { name: "Node actions" })).toBeDefined();
  });

  it("gives viewers the ⋮ hint when the node has children (for Collapse/Expand)", () => {
    renderNode(node({ children: [node({ id: "c1" })] }), false);
    expect(screen.getByRole("button", { name: "Node actions" })).toBeDefined();
  });
});

describe("RootMenu", () => {
  it("wraps the reading canvas around its children", () => {
    const { container } = render(
      <CollapseProvider>
        <RootMenu allIds={["a", "b"]}>
          <p>document body</p>
        </RootMenu>
      </CollapseProvider>,
    );
    expect(container.querySelector(".reading-canvas")).not.toBeNull();
    expect(screen.getByText("document body")).toBeDefined();
  });
});
