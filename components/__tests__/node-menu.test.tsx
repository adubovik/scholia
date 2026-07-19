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

import { MenuItems, NodeNumberMenu, RootMenu } from "@/components/NodeMenu";
import { NodeSection } from "@/components/NodeSection";
import { CollapseProvider } from "@/components/CollapseContext";
import { NotesProvider } from "@/components/NotesContext";
import { NotesDrawer } from "@/components/NotesDrawer";

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

// The section number IS the menu trigger now (the old ⋮ hint is gone).
const numberMenu = (over: Partial<React.ComponentProps<typeof NodeNumberMenu>> = {}) => (
  <NodeNumberMenu nodeId="n1" number="2.1" annotated={false} canEdit hasNote={false} hasChildren={false} onOpenNote={() => {}} onCollapseChildren={() => {}} onExpandChildren={() => {}} {...over} />
);

describe("NodeNumberMenu", () => {
  it("renders the section number as a labelled trigger", () => {
    render(numberMenu());
    const trigger = screen.getByRole("button", { name: "Section actions" });
    expect(trigger.textContent).toBe("2.1");
  });

  it("marks the number annotated (red) when the node carries a note", () => {
    render(numberMenu({ annotated: true }));
    expect(screen.getByRole("button", { name: "Section actions" }).getAttribute("data-annotated")).toBe("true");
  });

  it("runs non-clashing keyboard shortcuts when focused (Alt+↓ move, Alt+] indent)", () => {
    render(numberMenu());
    const trigger = screen.getByRole("button", { name: "Section actions" });
    fireEvent.keyDown(trigger, { key: "ArrowDown", altKey: true });
    expect(moveDown).toHaveBeenCalledWith("n1");
    fireEvent.keyDown(trigger, { key: "]", code: "BracketRight", altKey: true });
    expect(indent).toHaveBeenCalledWith("n1");
  });

  it("ignores the same keys without Alt (leaves them to Radix / the browser)", () => {
    render(numberMenu());
    fireEvent.keyDown(screen.getByRole("button", { name: "Section actions" }), { key: "ArrowDown" });
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
const ann = { id: "a1", nodeId: "n1", note: "hi", tags: [], authorId: "u1", createdAt: new Date().toISOString() };

const NUMS = new Map([["n1", "2"], ["c1", "2.1"]]);
function renderNode(node: TreeNode, canEdit: boolean, withDrawer = false) {
  return render(
    <NotesProvider entries={[]} sections={{}}>
      <CollapseProvider>
        <NodeSection node={node} depth={0} canEdit={canEdit} documentId="d1" numbers={NUMS} />
      </CollapseProvider>
      {withDrawer && <NotesDrawer documentId="d1" />}
    </NotesProvider>,
  );
}

// The section number (blue/red) replaces the old ¶ marker + ⋮ hint: it's the menu
// door when there's a menu to open, a plain identifier otherwise.
describe("NodeSection identifier", () => {
  it("shows a plain number (no menu) for a viewer on a childless, un-annotated node", () => {
    renderNode(node(), false);
    expect(screen.queryByRole("button", { name: "Section actions" })).toBeNull();
    // The heading node still shows its number "2".
    expect(screen.getByText("2")).toBeDefined();
  });

  it("turns the number red (data-annotated) when the node carries a note", () => {
    renderNode(node({ nodeAnnotation: ann }), false);
    expect(screen.getByText("2").getAttribute("data-annotated")).toBe("true");
  });

  it("makes the number a menu trigger for editors", () => {
    renderNode(node(), true);
    expect(screen.getByRole("button", { name: "Section actions" })).toBeDefined();
  });

  it("makes the number a menu trigger for viewers when the node has children (Collapse/Expand)", () => {
    renderNode(node({ children: [node({ id: "c1" })] }), false);
    expect(screen.getByRole("button", { name: "Section actions" })).toBeDefined();
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
