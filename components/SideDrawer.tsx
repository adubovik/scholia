"use client";

import { type ReactNode } from "react";
import { useNotesActions, useNotesState } from "./NotesContext";

const MIN_W = 320;

/**
 * The right-hand drawer shell: fixed panel, draggable edge handle, backdrop. It holds
 * whichever panel isn't centred (annotations by default, the reading text when the
 * view is swapped). Open/close + width live in NotesContext, shared with the running
 * head's toggle and the reading column's data-mode shift. Content is `children`; the
 * shell is agnostic to what it is.
 */
export function SideDrawer({ title, children }: { title: ReactNode; children: ReactNode }) {
  const { drawerOpen, panelWidth } = useNotesState();
  const { closeDrawer, toggleDrawer, setPanelWidth } = useNotesActions();

  // Edge handle: click (when closed) toggles; drag (when open) resizes.
  function onHandleDown(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const wasOpen = drawerOpen;
    let moved = false;
    function onMove(ev: PointerEvent) {
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      if (!wasOpen) return;
      const w = window.innerWidth - ev.clientX;
      if (w < MIN_W - 60) { cleanup(); closeDrawer(); return; }
      setPanelWidth(Math.max(MIN_W, Math.min(w, window.innerWidth - 320)));
    }
    function onUp() {
      cleanup();
      if (!moved) toggleDrawer();
    }
    function cleanup() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return (
    <>
      {drawerOpen && <div className="notes-backdrop" onClick={closeDrawer} />}

      <button
        className="notes-edge"
        aria-label="Toggle drawer"
        style={{ right: drawerOpen ? panelWidth : 0, cursor: drawerOpen ? "col-resize" : "pointer" }}
        onPointerDown={onHandleDown}
      >
        <span className="notes-edge-grip" />
      </button>

      <aside className="notes-drawer" data-open={drawerOpen} style={{ width: panelWidth }} aria-hidden={!drawerOpen}>
        <div className="notes-head">
          <span className="notes-title">{title}</span>
          <button className="glyph" aria-label="Close" onClick={closeDrawer}>✕</button>
        </div>
        <div className="notes-list drawer-scroll">{children}</div>
      </aside>
    </>
  );
}
