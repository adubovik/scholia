"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import type { TreeNode } from "@/lib/tree/build";
import { firstSentence } from "@/lib/tree/firstSentence";
import { SourcePassage } from "./SourcePassage";
import { NodeContextMenu, NodeNumber } from "./NodeMenu";
import { useCollapse, useCollapsed } from "./CollapseContext";
import { useNotesActions, useActiveNode } from "./NotesContext";

// Every id beneath this node (not the node itself) — the target of Collapse/Expand
// children.
const descendantIds = (n: TreeNode): string[] =>
  n.children.flatMap((c) => [c.id, ...descendantIds(c)]);

// Isolated emboss wrapper: subscribes to the active-selection store on its own, so
// selecting a node (item 5/6) repaints only this thin div — the node's content is
// passed through as a stable child element and never re-renders. forwardRef so
// Radix's ContextMenu.Trigger `asChild` can attach its ref + right-click handler.
const NodeSelf = forwardRef<HTMLDivElement, { nodeId: string } & HTMLAttributes<HTMLDivElement>>(
  function NodeSelf({ nodeId, children, ...rest }, ref) {
    const active = useActiveNode(nodeId);
    return (
      <div ref={ref} className={active ? "node-self node-self--active" : "node-self"} {...rest}>
        {children}
      </div>
    );
  },
);

export function NodeSection({
  node,
  depth,
  canEdit,
  documentId,
  numbers,
}: {
  node: TreeNode;
  depth: number;
  canEdit: boolean;
  documentId: string;
  numbers: Map<string, string>;
}) {
  const { toggle, setMany } = useCollapse();
  const { openAnnotation, composeNode } = useNotesActions();
  const collapsed = useCollapsed(node.id);
  const hasChildren = node.children.length > 0;
  const hasText = Boolean(node.text);
  // A heading node's whole range IS its title (import stores the heading text as
  // both): the title renders in the head, so rendering the passage too would
  // duplicate it. Its prose lives in the children, not its own body.
  const isHeading = node.title !== null && node.title.trim() === node.text.trim();
  // Collapse governs the node's own body text AND its children. Headings carry no
  // body of their own, so they're collapsible only when they have children.
  const collapsible = hasChildren || (hasText && !isHeading);

  // Hierarchical section number (1, 2.1, 3.1.1) derived from tree position. A body
  // paragraph shows it as a run-in prefix; a heading/container shows it in a head.
  const num = numbers.get(node.id) ?? "";
  const runIn = hasText && !isHeading;
  const showHead = !runIn; // heading or bodyless container → number (+ title) on its own line

  // Collapsed preview: first sentence + "…" when content is actually hidden.
  const preview = hasText ? firstSentence(node.text) : "";
  const truncated = preview.length < node.text.trim().length || hasChildren;

  const nodeAnn = node.nodeAnnotation;
  const hasNote = nodeAnn !== null;
  // Node notes live in the drawer: opening an existing one scrolls to its card +
  // marks it active; "add note" on a fresh node opens the drawer's composer.
  const openNote = () => (nodeAnn ? openAnnotation(nodeAnn.id, node.id) : composeNode(node.id));
  // The menu carries editor actions (canEdit) and/or the view-only Collapse/Expand
  // children (any reader, when there's a subtree to fold).
  const showMenu = canEdit || hasChildren;
  const menuProps = {
    nodeId: node.id,
    canEdit,
    hasNote,
    hasChildren,
    onOpenNote: openNote,
    onCollapseChildren: () => setMany(descendantIds(node), true),
    onExpandChildren: () => setMany(descendantIds(node), false),
  };

  // The section identifier: blue (red when annotated) number. Left-click highlights
  // the node's note when it has one; right-click opens the node menu (NodeContextMenu).
  // A button when interactive (menu/editor keys or note), else a plain span — which is
  // also what the collapsed preview uses (no button-in-button).
  const numberEl =
    num &&
    (showMenu || hasNote ? (
      <NodeNumber
        number={num}
        annotated={hasNote}
        runIn={runIn}
        nodeId={node.id}
        canEdit={canEdit}
        onHighlightNote={nodeAnn ? () => openAnnotation(nodeAnn.id, node.id) : undefined}
      />
    ) : (
      <span className={runIn ? "node-num-id node-num-id--runin" : "node-num-id"}>{num}</span>
    ));
  const plainNumberEl = num && (
    <span className="node-num-id node-num-id--runin" data-annotated={hasNote || undefined}>
      {num}
    </span>
  );

  const self: ReactNode = (
    <>
      {showHead && (num || node.title) && (
        <div className="node-head">
          {numberEl}
          {node.title && <span className="node-title">{node.title}</span>}
        </div>
      )}

      {hasText && !isHeading &&
        (collapsed ? (
          <button className="node-preview" onClick={() => setMany([node.id], false)}>
            {plainNumberEl}
            {preview}
            {truncated ? " …" : ""}
          </button>
        ) : (
          <SourcePassage
            text={node.text}
            sourceId={node.sourceId}
            nodeId={node.id}
            startOffset={node.startOffset}
            annotations={node.annotations}
            canEdit={canEdit}
            prefix={runIn ? numberEl : undefined}
          />
        ))}
    </>
  );

  return (
    <section className="node" style={{ marginLeft: depth ? "1.25rem" : undefined }} data-node-id={node.id}>
      <div className="node-toggle-col">
        {collapsible && (
          <button
            className="node-toggle"
            aria-label={collapsed ? "Expand" : "Collapse"}
            aria-expanded={!collapsed}
            onClick={() => toggle(node.id)}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        )}
      </div>

      <div className="node-body">
        {showMenu ? (
          <NodeContextMenu {...menuProps}>
            <NodeSelf nodeId={node.id}>{self}</NodeSelf>
          </NodeContextMenu>
        ) : (
          <NodeSelf nodeId={node.id}>{self}</NodeSelf>
        )}

        {!collapsed && hasChildren && (
          <div className="node-children">
            {node.children.map((child) => (
              <NodeSection
                key={child.id}
                node={child}
                depth={depth + 1}
                canEdit={canEdit}
                documentId={documentId}
                numbers={numbers}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
