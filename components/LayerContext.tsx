"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LayerNoteView, LayerView } from "@/lib/annotations/types";

/**
 * Which alternative renditions ("views" in the UI, layers in the code) are on screen,
 * and which one is being written. Deliberately NOT part of NotesContext: that context
 * is split by re-render cost so the book-sized tree consumes only its never-changing
 * actions, whereas every layer band in the tree *must* repaint when a chip is toggled.
 * Mixing the two would make opening the drawer re-render the whole document.
 */
export interface LayerCtx {
  layers: LayerView[];
  /** Selected layers, in bar order — what the bands render, and what prunes the
   * annotation tree. Always a subset of `layers`, so ids left over from a deleted
   * layer (or another document) just fall out. */
  selected: LayerView[];
  showOriginal: boolean;
  /** The band whose editor is open: one node's text in one layer. */
  composing: { nodeId: string; layerId: string } | null;
  /** The create/rename sheet. `layer` null = create; `nodeId` = compose there after. */
  sheet: { layer: LayerView | null; nodeId: string | null } | null;
  toggleLayer: (id: string) => void;
  toggleOriginal: () => void;
  compose: (nodeId: string, layerId: string) => void;
  stopComposing: () => void;
  openSheet: (layer: LayerView | null, nodeId?: string | null) => void;
  closeSheet: () => void;
  /** A view was just created: show it, and drop straight into writing this node's text. */
  created: (layerId: string, nodeId: string | null) => void;
}

const Ctx = createContext<LayerCtx | null>(null);
const KEY = "scholia:layers";

export function useLayers(): LayerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLayers outside LayerProvider");
  return ctx;
}

/** Layer state without requiring a provider — for the reading tree, which also renders
 * inside surfaces that have none (the demo's static shell, tests). */
export function useLayersOptional(): LayerCtx | null {
  return useContext(Ctx);
}

/** The views that actually put a band on this node: selected, and either holding text
 *  for it or with an open composer. One source of truth for "is there a view to read
 *  here" — it decides whether a band replaces the original passage (reading-first) or
 *  the rundown (annotation-first), and whether a node note takes the ₀ subscript that
 *  says it is no longer the only thing standing in for the passage. Empty without a
 *  provider, like useLayersOptional. */
export function useVisibleLayers(nodeId: string, layerNotes: LayerNoteView[]): LayerView[] {
  const ctx = useContext(Ctx);
  if (!ctx) return [];
  return ctx.selected.filter(
    (l) =>
      layerNotes.some((n) => n.layerId === l.id) ||
      (ctx.composing?.nodeId === nodeId && ctx.composing.layerId === l.id),
  );
}

export function LayerProvider({ layers, children }: { layers: LayerView[]; children: ReactNode }) {
  const [active, setActive] = useState<string[]>([]);
  const [showOriginal, setShowOriginal] = useState(true);
  const [composing, setComposing] = useState<{ nodeId: string; layerId: string } | null>(null);
  const [sheet, setSheet] = useState<{ layer: LayerView | null; nodeId: string | null } | null>(null);

  // Default (SSR-safe): original only. Mirror the stored choice after mount, same
  // pattern as the reading-first/annotation-first toggle.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const v = JSON.parse(raw) as { active?: string[]; original?: boolean };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration mirror of stored pref
      if (Array.isArray(v.active)) setActive(v.active);
      if (v.original === false) setShowOriginal(false);
    } catch {
      // corrupt entry: fall back to the default selection
    }
  }, []);

  const value = useMemo<LayerCtx>(() => {
    const save = (a: string[], o: boolean) =>
      localStorage.setItem(KEY, JSON.stringify({ active: a, original: o }));
    return {
      layers,
      // Ordered by the bar, not by click order, so bands stack the same way everywhere.
      selected: layers.filter((l) => active.includes(l.id)),
      showOriginal,
      composing,
      sheet,
      toggleLayer: (id) =>
        setActive((prev) => {
          const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
          save(next, showOriginal);
          return next;
        }),
      toggleOriginal: () =>
        setShowOriginal((prev) => {
          save(active, !prev);
          return !prev;
        }),
      compose: (nodeId, layerId) => {
        // Writing in a view implies showing it — otherwise "Add summarization" would
        // open an editor inside a band the bar has switched off.
        setActive((prev) => {
          if (prev.includes(layerId)) return prev;
          const next = [...prev, layerId];
          save(next, showOriginal);
          return next;
        });
        setComposing({ nodeId, layerId });
      },
      stopComposing: () => setComposing(null),
      openSheet: (layer, nodeId = null) => setSheet({ layer, nodeId }),
      closeSheet: () => setSheet(null),
      created: (layerId, nodeId) => {
        setActive((prev) => {
          const next = prev.includes(layerId) ? prev : [...prev, layerId];
          save(next, showOriginal);
          return next;
        });
        setSheet(null);
        if (nodeId) setComposing({ nodeId, layerId });
      },
    };
  }, [layers, active, showOriginal, composing, sheet]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
