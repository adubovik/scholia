"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/tree/build";
import { SourcePassage } from "./SourcePassage";
import { TreeEditControls } from "./TreeEditControls";

export function NodeSection({ node, depth, canEdit }: { node: TreeNode; depth: number; canEdit: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <section className="node" style={{ marginLeft: depth ? "1.5rem" : undefined }} data-node-id={node.id}>
      <div className="node-head">
        {hasChildren ? (
          <button
            className="glyph"
            aria-label={collapsed ? "Expand" : "Collapse"}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="glyph glyph-leaf" aria-hidden>·</span>
        )}
        {node.label && <span className="node-label">{node.label}</span>}
        {node.title && <span className="node-title">{node.title}</span>}
        {canEdit && <TreeEditControls nodeId={node.id} />}
      </div>

      {node.text && <SourcePassage text={node.text} />}

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
