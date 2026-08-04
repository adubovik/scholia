"use client";

import { useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DualNode } from "@/lib/tree/dual";
import { firstSentence } from "@/lib/tree/firstSentence";
import { NoteEditor } from "./NoteEditor";
import { GlyphPill } from "./GlyphPill";
import { displayTags, glyphsInTags } from "@/lib/annotations/glyphs";
import { updateInlineAnnotation } from "@/lib/actions/annotations";
import { upsertNodeAnnotation, deleteNodeAnnotation } from "@/lib/actions/nodeAnnotations";
import { useCollapse, useCollapsed } from "./CollapseContext";
import { useNotesActions, useNotesState, useActiveNode, useActiveAnn } from "./NotesContext";

/**
 * One row of the annotation-first tree — rendered like the reading column (serif,
 * foldable) but showing annotations. A note (node or inline) is the prose, editable in
 * place with the full editor (tags/glyphs/colour); a bare highlight shows its span,
 * dimmed; a note-less node kept for its subtree is a dim skeleton you can still add a
 * note to. Reacts to the reading-view node menu: `editingId`/`composeNodeId` from
 * context open this row's editor, so "Edit note"/"Add note" land here.
 */
export function DualNodeSection({
  node,
  depth,
  canEdit,
  documentId,
}: {
  node: DualNode;
  depth: number;
  canEdit: boolean;
  documentId: string;
}) {
  const { toggle } = useCollapse();
  const collapsed = useCollapsed(node.id);
  const { openAnnotation, setFilterTag, stopEditing } = useNotesActions();
  const { editingId, composeNodeId } = useNotesState();
  // A node row is active when its owning node is selected; an inline row (keyed by the
  // annotation id) is active when that annotation is selected — so clicking a highlight
  // embosses the inline row, not just its parent node (item 4). Both hooks run every
  // render (rules-of-hooks); node.id only ever matches one of the two stores.
  const activeNode = useActiveNode(node.id);
  const activeAnn = useActiveAnn(node.id);
  const active = activeNode || activeAnn;

  const hasChildren = node.children.length > 0;
  const isInline = node.kind === "inline";
  const hasNote = node.note.trim() !== "";
  const isSkeleton = !isInline && node.noteId === null; // note-less node kept for its subtree
  const glyphs = glyphsInTags(node.tags);
  const tags = displayTags(node.tags);

  // The reading-view node menu drives editing through context: "Edit note" sets
  // editingId to the annotation id; "Add note" sets composeNodeId to the node id.
  const shouldEdit =
    (editingId !== null && editingId === node.noteId) ||
    (!isInline && composeNodeId === node.nodeId);
  const [override, setOverride] = useState<boolean | null>(null);
  const editing = canEdit && (override ?? shouldEdit);

  function close() {
    setOverride(false);
    stopEditing();
  }

  async function save({ note, tags, color }: { note: string; tags: string[]; color: string | null }) {
    const body = note.trim();
    if (isInline) {
      await updateInlineAnnotation({ id: node.noteId!, note: body || null, tags, color: color ?? undefined });
    } else if (body) {
      await upsertNodeAnnotation({ documentId, nodeId: node.nodeId, note: body, tags });
    } else if (node.noteId) {
      await deleteNodeAnnotation(node.noteId);
    }
    close();
  }

  async function remove() {
    // Clear the note but keep the highlight (a highlight is removed in reading view).
    if (isInline) await updateInlineAnnotation({ id: node.noteId!, note: null });
    else if (node.noteId) await deleteNodeAnnotation(node.noteId);
    close();
  }

  const numberEl = node.number && (
    <button
      className="node-num-id node-num-id--runin"
      aria-label={`Section ${node.number} in the text`}
      onClick={() => openAnnotation(node.id, node.id)}
    >
      {node.number}
    </button>
  );

  const metaEl = tags.length > 0 && (
    <div className="dual-meta">
      {tags.map((t) => (
        <button key={t} className="chip" onClick={() => setFilterTag(t)}>#{t}</button>
      ))}
    </div>
  );

  const controls = canEdit && (
    <span className="dual-controls">
      <EditControl label={hasNote ? "Edit note" : "Add note"} onClick={() => setOverride(true)} />
      {hasNote && <RemoveControl onClick={remove} />}
    </span>
  );

  return (
    <section className="node" style={{ marginLeft: depth ? "0.4rem" : undefined }} data-node-id={node.id}>
      <div className="node-toggle-col">
        {hasChildren && (
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
        <div className={active ? "dual-block dual-block--active" : "dual-block"}>
          {editing ? (
            <NoteEditor
              kind={node.kind}
              note={node.note}
              tags={node.tags}
              color={node.color}
              canDelete={hasNote}
              onSave={save}
              onCancel={close}
              onDelete={remove}
            />
          ) : isSkeleton ? (
            <div className="dual-skel">
              {numberEl}
              <span className="dual-skel-label">{node.title ?? firstSentence(node.source)}</span>
              {canEdit && (
                <span className="dual-controls">
                  <EditControl label="Add note" onClick={() => setOverride(true)} />
                </span>
              )}
            </div>
          ) : isInline ? (
            <div className="dual-note">
              {/* The highlighted span itself, painted like the reading column (filled or
                  underlined per the display setting) and preceded by its glyphs — the
                  note, if any, reads underneath it (items 1–3). */}
              <div className="dual-quote">
                {glyphs.length > 0 && <GlyphPill glyphs={glyphs} className="glyph-pill--inline" />}
                <span
                  className="hl"
                  style={node.color ? ({ "--seg-hl": `var(--hl-${node.color})` } as CSSProperties) : undefined}
                  onClick={() => openAnnotation(node.id, null)}
                >
                  {node.source}
                </span>
              </div>
              {hasNote && <ReactMarkdown remarkPlugins={[remarkGfm]}>{node.note}</ReactMarkdown>}
              {metaEl}
              {controls}
            </div>
          ) : (
            <div className="dual-note">
              {numberEl}
              {glyphs.length > 0 && <GlyphPill glyphs={glyphs} className="glyph-pill--lead" />}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{node.note}</ReactMarkdown>
              {metaEl}
              {controls}
            </div>
          )}
        </div>

        {!collapsed && hasChildren && (
          <div className="node-children">
            {node.children.map((child) => (
              <DualNodeSection
                key={child.id}
                node={child}
                depth={depth + 1}
                canEdit={canEdit}
                documentId={documentId}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EditControl({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="dual-ctl" aria-label={label} title={label} onClick={onClick}>
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.1" style={{ display: "block" }}>
        <path d="M9.2 2.4l2.4 2.4M2 12l0.4-2.6 6.4-6.4 2.4 2.4-6.4 6.4L2 12z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function RemoveControl({ onClick }: { onClick: () => void }) {
  return (
    <button className="dual-ctl dual-ctl--danger" aria-label="Delete note" title="Delete note" onClick={onClick}>
      <svg width="12" height="12" viewBox="0 0 12 13" fill="none" stroke="currentColor" strokeWidth="1.1" style={{ display: "block" }}>
        <path d="M1 3.2h10M4.2 3.2V1.8h3.6v1.4M2.4 3.2l0.7 8.3h5.8l0.7-8.3M4.7 5.4v4M7.3 5.4v4" />
      </svg>
    </button>
  );
}
