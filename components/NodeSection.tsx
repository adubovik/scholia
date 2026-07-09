"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/tree/build";
import { SourcePassage } from "./SourcePassage";
import { TreeEditControls } from "./TreeEditControls";

export function NodeSection({ node, depth, canEdit }: { node: TreeNode; depth: number; canEdit: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;
  // Leaf prose nodes need no header chrome — the paragraph flows on its own.
  const showHead = hasChildren || Boolean(node.label) || Boolean(node.title);

  return (
    <section className="node" style={{ marginLeft: depth ? "1.25rem" : undefined }} data-node-id={node.id}>
      {canEdit && <TreeEditControls nodeId={node.id} />}

      {showHead && (
        <div className="node-head">
          {hasChildren && (
            <button
              className="glyph"
              aria-label={collapsed ? "Expand" : "Collapse"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? "▸" : "▾"}
            </button>
          )}
          {node.label && <span className="node-label">{node.label}</span>}
          {node.title && <span className="node-title">{node.title}</span>}
        </div>
      )}

      {node.text && (
        <SourcePassage
          text={node.text}
          sourceId={node.sourceId}
          startOffset={node.startOffset}
          annotations={node.annotations}
          canEdit={canEdit}
        />
      )}

      {!collapsed && hasChildren && (
        <div className="node-children">
          {node.children.map((child) => (
            <NodeSection key={child.id} node={child} depth={depth + 1} canEdit={canEdit} />
          ))}
        </div>
      )}
    </section>
  );
}
