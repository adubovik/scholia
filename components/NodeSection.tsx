"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import type { TreeNode } from "@/lib/tree/build";
import { firstSentence } from "@/lib/tree/firstSentence";
import { SourcePassage } from "./SourcePassage";
import { NodeContextMenu, NodeNumber, ChildCount, NumText } from "./NodeMenu";
import { useCollapse, useCollapsed } from "./CollapseContext";
import { useNotesActions, usePanelCentred, useActiveNode } from "./NotesContext";
import { glyphsInTags } from "@/lib/annotations/glyphs";

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
  numbersShort,
}: {
  node: TreeNode;
  depth: number;
  canEdit: boolean;
  documentId: string;
  numbers: Map<string, string>; // full compound id path (IV.Prop.LXI)
  numbersShort: Map<string, string>; // own segment (LXI); toggle picks which shows
}) {
  const { toggle, setMany } = useCollapse();
  const { openAnnotation, toggleAnnotation, composeNode } = useNotesActions();
  // Centred reading panel toggles the drawer on re-click; the drawer copy just selects.
  const select = usePanelCentred() ? toggleAnnotation : openAnnotation;
  const collapsed = useCollapsed(node.id);
  const hasChildren = node.children.length > 0;
  const hasText = Boolean(node.text);
  // A "container" renders as a head (its id + own remaining text on their own line),
  // not as a run-in paragraph. Two ways to be one: it has structural children, or —
  // legacy import — its whole range IS its title (heading stored as both title+text).
  // For AI-imported nodes the `cut` already stripped the id from the text, so a
  // division like "PART I" keeps just its subtitle ("CONCERNING GOD.") as own text,
  // shown in the head next to the id.
  const isHeadingByTitle = node.title !== null && node.title.trim() === node.text.trim();
  const isContainer = hasChildren || isHeadingByTitle;
  // What renders beside the id in the head: the legacy title, else a container's own
  // leftover text (division subtitle). Leaf paragraphs render their text as a passage.
  const headTitle = node.title ?? (hasChildren && hasText ? node.text : null);
  // Collapse governs the node's own body text AND its children. Containers carry no
  // passage of their own, so they're collapsible only when they have children.
  const collapsible = hasChildren || (hasText && !isContainer);

  // Compound id path (IV.Prop.LXI full / LXI short — the toggle picks). A leaf
  // paragraph shows it as a run-in prefix; a container shows it in a head.
  const num = numbers.get(node.id) ?? "";
  const short = numbersShort.get(node.id) ?? num;
  const runIn = hasText && !isContainer;
  const showHead = !runIn; // container or bodyless → number (+ title) on its own line

  // Collapsed preview: first sentence + "…" when content is actually hidden.
  const preview = hasText ? firstSentence(node.text) : "";
  const truncated = preview.length < node.text.trim().length || hasChildren;

  const nodeAnn = node.nodeAnnotation;
  const hasNote = nodeAnn !== null;
  // Node notes live in the drawer: the menu's "Edit note" opens the existing card
  // straight into its editor; "Add note" on a fresh node opens the composer. (The
  // section-number click below is the read-only path — it only marks the card.)
  const openNote = () => (nodeAnn ? openAnnotation(nodeAnn.id, node.id, true) : composeNode(node.id));
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
        numberShort={short}
        childCount={node.children.length}
        annotated={hasNote}
        runIn={runIn}
        nodeId={node.id}
        canEdit={canEdit}
        glyphs={nodeAnn ? glyphsInTags(nodeAnn.tags) : []}
        onHighlightNote={nodeAnn ? () => select(nodeAnn.id, node.id) : undefined}
      />
    ) : (
      <span className={runIn ? "node-num-id node-num-id--runin" : "node-num-id"}>
        <NumText full={num} short={short} />
        <ChildCount n={node.children.length} />
      </span>
    ));
  const plainNumberEl = num && (
    <span className="node-num-id node-num-id--runin" data-annotated={hasNote || undefined}>
      <NumText full={num} short={short} />
      <ChildCount n={node.children.length} />
    </span>
  );

  const self: ReactNode = (
    <>
      {showHead && (num || headTitle) && (
        <div className="node-head">
          {numberEl}
          {headTitle && <span className="node-title">{headTitle}</span>}
        </div>
      )}

      {hasText && !isContainer &&
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
    <section className="node" style={{ marginLeft: depth ? "0.4rem" : undefined }} data-node-id={node.id}>
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
                numbersShort={numbersShort}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
