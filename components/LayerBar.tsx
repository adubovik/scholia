"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import type { LayerView } from "@/lib/annotations/types";
import { deleteLayer } from "@/lib/actions/layers";
import { useLayers } from "./LayerContext";

/**
 * The view selector — (original | summarization | french) — sitting above whichever
 * panel is centred. Multi-select: each chip toggles its band on or off, so you can
 * read two renditions side by side or the original alone.
 *
 * Annotation-first drops the "original" chip: that slot is the node's note (or a
 * rundown of its text), which is the whole point of that view — there is no original
 * prose to switch off. Nothing renders until a document actually has a view; the
 * flow that makes the first one is the node menu's "Create a view…".
 */
export function LayerBar({ dualMode, canEdit }: { dualMode: boolean; canEdit: boolean }) {
  const { layers, selected, showOriginal, toggleLayer, toggleOriginal, openSheet } = useLayers();
  if (layers.length === 0) return null;
  const on = new Set(selected.map((l) => l.id));

  return (
    <div className="layer-bar" role="group" aria-label="Views">
      {!dualMode && (
        <button
          className={showOriginal ? "layer-chip layer-chip--on" : "layer-chip"}
          aria-pressed={showOriginal}
          onClick={toggleOriginal}
        >
          original
        </button>
      )}
      {layers.map((l) =>
        canEdit ? (
          <ChipMenu key={l.id} layer={l}>
            <Chip layer={l} on={on.has(l.id)} onToggle={() => toggleLayer(l.id)} />
          </ChipMenu>
        ) : (
          <Chip key={l.id} layer={l} on={on.has(l.id)} onToggle={() => toggleLayer(l.id)} />
        ),
      )}
      {canEdit && (
        <button className="layer-chip layer-chip--add" aria-label="Create a view" onClick={() => openSheet(null)}>
          ＋
        </button>
      )}
    </div>
  );
}

function Chip({ layer, on, onToggle, ...rest }: { layer: LayerView; on: boolean; onToggle: () => void }) {
  return (
    <button
      className={on ? "layer-chip layer-chip--on" : "layer-chip"}
      data-layer-color={layer.color}
      aria-pressed={on}
      onClick={onToggle}
      {...rest}
    >
      {layer.name}
    </button>
  );
}

// Right-click a chip to rename, recolour or drop the view — the same place you turn
// it on, so there's no separate settings surface for something this small.
function ChipMenu({ layer, children }: { layer: LayerView; children: React.ReactNode }) {
  const { openSheet } = useLayers();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild onContextMenu={(e) => e.stopPropagation()}>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="node-menu" collisionPadding={8}>
          <ContextMenu.Item className="node-menu-item" onSelect={() => openSheet(layer)}>
            <span className="node-menu-label">Rename view…</span>
          </ContextMenu.Item>
          <ContextMenu.Separator className="node-menu-sep" />
          <ContextMenu.Item className="node-menu-item" onSelect={() => deleteLayer(layer.id)}>
            <span className="node-menu-label">Delete view</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
