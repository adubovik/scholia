"use client";

import { useMemo } from "react";
import { CollapseProvider } from "./CollapseContext";
import { DualNodeSection } from "./DualNodeSection";
import { GlyphToggle } from "./GlyphPill";
import { useNotesActions, useNotesState } from "./NotesContext";
import { useLayersOptional } from "./LayerContext";
import { visibleDual, dualTags, type DualNode } from "@/lib/tree/dual";

/**
 * The annotation panel: the filter chips + the annotation tree. Sits in the right
 * drawer by default, centre-stage when the view is swapped. Filtering (tag + preset
 * glyphs) and the compose target come from NotesContext — the same state the old card
 * drawer used — so `visibleDual` prunes/reveals the tree without a refetch.
 */
export function AnnotationPanel({ nodes, canEdit, documentId }: { nodes: DualNode[]; canEdit: boolean; documentId: string }) {
  const { filterTag, filterGlyphs, composeNodeId } = useNotesState();
  const { setFilterTag, toggleFilterGlyph, clearFilters } = useNotesActions();

  // Selected views both add rows (a node with only a translation earns one) and take
  // them away (deselect the view and it prunes back out).
  const layerCtx = useLayersOptional();
  const layerIds = useMemo(() => layerCtx?.selected.map((l) => l.id) ?? [], [layerCtx?.selected]);
  const composeLayerNode = layerCtx?.composing?.nodeId ?? null;

  const { tags, anyGlyphs } = useMemo(() => dualTags(nodes), [nodes]);
  const forceIds = useMemo(
    () => new Set([composeNodeId, composeLayerNode].filter((x): x is string => x !== null)),
    [composeNodeId, composeLayerNode],
  );
  const visible = useMemo(
    () => visibleDual(nodes, { filterTag, filterGlyphs, forceIds, layerIds }),
    [nodes, filterTag, filterGlyphs, forceIds, layerIds],
  );
  const filtersActive = filterTag !== null || filterGlyphs.length > 0;

  return (
    <div className="annot-panel" data-panel="annotation">
      {(tags.length > 0 || anyGlyphs) && (
        <div className="notes-filters annot-filters">
          <button className={filtersActive ? "chip" : "chip chip--active"} onClick={clearFilters}>All</button>
          {anyGlyphs && <GlyphToggle active={filterGlyphs} onToggle={toggleFilterGlyph} />}
          {tags.map((t) => (
            <button key={t} className={filterTag === t ? "chip chip--active" : "chip"} onClick={() => setFilterTag(t)}>
              #{t}
            </button>
          ))}
        </div>
      )}
      <CollapseProvider>
        {visible.length === 0 ? (
          <div className="notes-empty">{filtersActive ? "No annotations match this filter." : "No annotations yet."}</div>
        ) : (
          visible.map((n) => <DualNodeSection key={n.id} node={n} depth={0} canEdit={canEdit} documentId={documentId} />)
        )}
      </CollapseProvider>
    </div>
  );
}
