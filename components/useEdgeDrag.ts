import type { PointerEvent } from "react";

const MIN_W = 320;
const MIN_ROOM = 320; // px kept clear for the rest of the viewport

/**
 * Shared edge-tab pointer logic for both drawers. A click (no real movement) toggles
 * the drawer open/closed; a drag while open resizes it, and dragging in past the min
 * collapses it shut. `side` picks which viewport edge the width is measured from —
 * the right drawer grows leftward, the library grows rightward.
 */
export function makeEdgeHandler(opts: {
  side: "left" | "right";
  open: boolean;
  minW?: number;
  onResize: (w: number) => void;
  onClose: () => void;
  onToggle: () => void;
}) {
  const { side, open, minW = MIN_W, onResize, onClose, onToggle } = opts;
  return (e: PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    let moved = false;
    function onMove(ev: globalThis.PointerEvent) {
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      if (!open) return;
      const w = side === "right" ? window.innerWidth - ev.clientX : ev.clientX;
      if (w < minW - 60) {
        cleanup();
        onClose();
        return;
      }
      onResize(Math.max(minW, Math.min(w, window.innerWidth - MIN_ROOM)));
    }
    function onUp() {
      cleanup();
      if (!moved) onToggle();
    }
    function cleanup() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };
}
