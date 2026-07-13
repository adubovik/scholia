"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/tree/build";
import { firstSentence } from "@/lib/tree/firstSentence";
import { SourcePassage } from "./SourcePassage";
import { NodeContextMenu, NodeMenuHint } from "./NodeMenu";
import { NodeNote } from "./NodeNote";
import { useCollapse, useCollapsed } from "./CollapseContext";

// Every id beneath this node (not the node itself) — the target of Collapse/Expand
// children.
const descendantIds = (n: TreeNode): string[] =>
  n.children.flatMap((c) => [c.id, ...descendantIds(c)]);

export function NodeSection({
  node,
  depth,
  canEdit,
  documentId,
}: {
  node: TreeNode;
  depth: number;
  canEdit: boolean;
  documentId: string;
}) {
  const { toggle, setMany } = useCollapse();
  const collapsed = useCollapsed(node.id);
  const [noteOpen, setNoteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const hasText = Boolean(node.text);
  // A heading node's whole range IS its title (import stores the heading text as
  // both): the title renders in the head, so rendering the passage too would
  // duplicate it. Its prose lives in the children, not its own body — mirroring
  // how a numbered node shows its label in the head and prose in the body.
  const isHeading = node.title !== null && node.title.trim() === node.text.trim();
  // Collapse governs the node's own body text AND its children. Headings carry
  // no body of their own, so they're collapsible only when they have children.
  const collapsible = hasChildren || (hasText && !isHeading);
  // Leaf prose nodes need no header chrome — the paragraph flows on its own.
  const showHead = hasChildren || Boolean(node.label) || Boolean(node.title);

  // Collapsed preview: first sentence + "…" when content is actually hidden.
  const preview = hasText ? firstSentence(node.text) : "";
  const truncated = preview.length < node.text.trim().length || hasChildren;

  const hasNote = node.nodeAnnotation !== null;
  // The menu carries editor actions (canEdit) and/or the view-only Collapse/Expand
  // children (any reader, when there's a subtree to fold), so it shows whenever
  // either applies.
  const showMenu = canEdit || hasChildren;
  const menuProps = {
    nodeId: node.id,
    canEdit,
    hasNote,
    hasChildren,
    onOpenNote: () => setNoteOpen((o) => !o),
    onCollapseChildren: () => setMany(descendantIds(node), true),
    onExpandChildren: () => setMany(descendantIds(node), false),
  };

  // The node's OWN head + passage — the right-click surface. Kept separate from
  // .node-children so nested context-menu triggers never fight over one event,
  // and off the SourcePassage's text-selection gesture only via right-click
  // (left-click drag selection is untouched by Radix's contextmenu trigger).
  const self = (
    <div className={menuOpen ? "node-self node-self--active" : "node-self"}>
      {showHead && (
        <div className="node-head">
          {node.label && <span className="node-label">{node.label}</span>}
          {node.title && <span className="node-title">{node.title}</span>}
        </div>
      )}

      {hasText && !isHeading &&
        (collapsed ? (
          <button className="node-preview" onClick={() => setMany([node.id], false)}>
            {preview}
            {truncated ? " …" : ""}
          </button>
        ) : (
          <SourcePassage
            text={node.text}
            sourceId={node.sourceId}
            startOffset={node.startOffset}
            annotations={node.annotations}
            canEdit={canEdit}
          />
        ))}
    </div>
  );

  return (
    <section className="node" style={{ marginLeft: depth ? "1.25rem" : undefined }} data-node-id={node.id}>
      {(hasNote || showMenu) && (
        <div className="node-gutter">
          {hasNote && (
            <button
              className="node-marker"
              aria-label={noteOpen ? "Hide note" : "Show note"}
              aria-expanded={noteOpen}
              onClick={() => setNoteOpen((o) => !o)}
            >
              ¶
            </button>
          )}
          {showMenu && <NodeMenuHint {...menuProps} onOpenChange={setMenuOpen} />}
        </div>
      )}

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
          <NodeContextMenu {...menuProps} onOpenChange={setMenuOpen}>
            {self}
          </NodeContextMenu>
        ) : (
          self
        )}

        {noteOpen && (
          <NodeNote
            documentId={documentId}
            nodeId={node.id}
            annotation={node.nodeAnnotation}
            canEdit={canEdit}
            onClose={() => setNoteOpen(false)}
          />
        )}

        {!collapsed && hasChildren && (
          <div className="node-children">
            {node.children.map((child) => (
              <NodeSection key={child.id} node={child} depth={depth + 1} canEdit={canEdit} documentId={documentId} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
