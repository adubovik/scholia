"use client";

import { forwardRef, useState, type HTMLAttributes, type ReactNode } from "react";
import type { TreeNode } from "@/lib/tree/build";
import { firstSentence } from "@/lib/tree/firstSentence";
import { SourcePassage } from "./SourcePassage";
import { LayerBands } from "./LayerBands";
import { NodeContextMenu, NodeNumber, ChildCount, NumText } from "./NodeMenu";
import { DeleteNodeSheet, EditTextSheet, canEditText } from "./NodeEdit";
import { useCollapse, useCollapsed } from "./CollapseContext";
import { useNotesActions, usePanelCentred, useActiveNode } from "./NotesContext";
import { useLayersOptional, useVisibleLayers } from "./LayerContext";
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
  // The two sheets the node menu opens. Local state: the menu is rendered by this
  // node, so nothing else needs to know which passage is being edited or dropped.
  const [sheet, setSheet] = useState<null | "edit" | "delete">(null);
  const { openAnnotation, toggleAnnotation, composeNode } = useNotesActions();
  // Centred reading panel toggles the drawer on re-click; the drawer copy just selects.
  const select = usePanelCentred() ? toggleAnnotation : openAnnotation;
  const collapsed = useCollapsed(node.id);
  const hasChildren = node.children.length > 0;
  const hasText = Boolean(node.text);
  // A node's own body text ALWAYS renders as a run-in passage — same serif, reading
  // size, justification and flow as a childless leaf — whether or not it has children.
  // (A paragraph that merely carries a footnote child must still read as prose, not as
  // an indented head.) The one exception is a legacy heading whose whole range IS its
  // title (stored as both title+text): that shows as a head line, not as prose.
  const isHeadingByTitle = node.title !== null && node.title.trim() === node.text.trim();
  const showsSource = hasText && !isHeadingByTitle;
  // The bar's "original" chip switched off swaps the source prose out for the views
  // stacked beneath it — but only where there IS one to read: an untranslated node
  // keeps its original rather than going blank (which also covers "all chips off").
  const layers = useLayersOptional();
  const views = useVisibleLayers(node.id, node.layerNotes);
  const hideOriginal = layers !== null && !layers.showOriginal && views.length > 0;
  const runIn = showsSource && !hideOriginal;
  // With the original switched off, the first view takes over its slot outright —
  // same column, same run-in number, same justified prose, only tinted. Collapsed,
  // there is no prose to lead, so the number falls back to a head line.
  const leadsWithView = showsSource && hideOriginal && !collapsed;
  const showHead = !runIn && !leadsWithView; // heading, or a bodyless structural container → id (+ title) on its own line
  // The head, when shown, carries only the legacy title beside the id; a node's own
  // prose never sits in the head now — it flows below as a passage via runIn.
  const headTitle = node.title ?? null;
  // Foldable when there's a passage to fold and/or a subtree to hide. Keyed off the
  // node's real content, not runIn — collapsing still hides the views.
  const collapsible = showsSource || hasChildren;

  // Compound id path (IV.Prop.LXI full / LXI short — the toggle picks). A run-in
  // passage shows it as a prefix; a head shows it on its own line.
  const num = numbers.get(node.id) ?? "";
  const short = numbersShort.get(node.id) ?? num;

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
    layerNotes: node.layerNotes,
    canEditText: canEditText(node),
    hasText,
    onOpenNote: openNote,
    onEditText: () => setSheet("edit"),
    onDelete: () => setSheet("delete"),
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
        runIn={!showHead}
        nodeId={node.id}
        canEdit={canEdit}
        glyphs={nodeAnn ? glyphsInTags(nodeAnn.tags) : []}
        onHighlightNote={nodeAnn ? () => select(nodeAnn.id, node.id) : undefined}
      />
    ) : (
      <span className={showHead ? "node-num-id" : "node-num-id node-num-id--runin"}>
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

      {runIn &&
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

      {/* The alternative renditions, stacked under the original and ruled off from it.
          Inside the node's own menu region, so right-clicking a band still offers that
          view's "Edit …" — but with no highlight affordances of its own: annotations
          anchor to source offsets, and a translation is not the source. */}
      {!collapsed && (
        <LayerBands
          nodeId={node.id}
          layerNotes={node.layerNotes}
          canEdit={canEdit}
          documentId={documentId}
          lead={leadsWithView ? numberEl : undefined}
        />
      )}
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

        {canEdit && sheet === "edit" && (
          <EditTextSheet node={node} number={num || "—"} onClose={() => setSheet(null)} />
        )}
        {canEdit && sheet === "delete" && (
          <DeleteNodeSheet node={node} number={num || "—"} onClose={() => setSheet(null)} />
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
