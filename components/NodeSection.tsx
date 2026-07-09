"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/tree/build";
import { firstSentence } from "@/lib/tree/firstSentence";
import { SourcePassage } from "./SourcePassage";
import { TreeEditControls } from "./TreeEditControls";
import { NodeNote } from "./NodeNote";

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
  const [collapsed, setCollapsed] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const hasText = Boolean(node.text);
  // Collapse now governs the node's own text AND its children, so any node with
  // text or children is collapsible — including top-level prose nodes.
  const collapsible = hasChildren || hasText;
  // Leaf prose nodes need no header chrome — the paragraph flows on its own.
  const showHead = hasChildren || Boolean(node.label) || Boolean(node.title);

  // Collapsed preview: first sentence + "…" when content is actually hidden.
  const preview = hasText ? firstSentence(node.text) : "";
  const truncated = preview.length < node.text.trim().length || hasChildren;

  return (
    <section className="node" style={{ marginLeft: depth ? "1.25rem" : undefined }} data-node-id={node.id}>
      <TreeEditControls
        nodeId={node.id}
        canEdit={canEdit}
        hasNote={node.nodeAnnotation !== null}
        onOpenNote={() => setNoteOpen(true)}
      />

      <div className="node-toggle-col">
        {collapsible && (
          <button
            className="node-toggle"
            aria-label={collapsed ? "Expand" : "Collapse"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        )}
      </div>

      <div className="node-body">
        {showHead && (
          <div className="node-head">
            {node.label && <span className="node-label">{node.label}</span>}
            {node.title && <span className="node-title">{node.title}</span>}
          </div>
        )}

        {hasText &&
          (collapsed ? (
            <button className="node-preview" onClick={() => setCollapsed(false)}>
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
