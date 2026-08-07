"use client";

import { type ReactNode } from "react";
import { useNotesActions, useNotesState } from "./NotesContext";
import { makeEdgeHandler } from "./useEdgeDrag";

/**
 * The right-hand drawer shell: fixed panel, draggable edge handle, backdrop. It holds
 * whichever panel isn't centred (annotations by default, the reading text when the
 * view is swapped). Open/close + width live in NotesContext, shared with the running
 * head's toggle and the reading column's data-mode shift. Content is `children`; the
 * shell is agnostic to what it is.
 */
export function SideDrawer({ title, children }: { title: ReactNode; children: ReactNode }) {
  const { drawerOpen, panelWidth, ready } = useNotesState();
  const { closeDrawer, toggleDrawer, setPanelWidth } = useNotesActions();

  // Edge handle: click (when closed) toggles; drag (when open) resizes.
  const onHandleDown = makeEdgeHandler({
    side: "right",
    open: drawerOpen,
    onResize: setPanelWidth,
    onClose: closeDrawer,
    onToggle: toggleDrawer,
  });

  return (
    <>
      {drawerOpen && <div className="notes-backdrop" onClick={closeDrawer} />}

      <button
        className="notes-edge"
        aria-label="Toggle drawer"
        data-ready={ready}
        style={{ right: drawerOpen ? panelWidth : 0, cursor: drawerOpen ? "col-resize" : "pointer" }}
        onPointerDown={onHandleDown}
      >
        <span className="notes-edge-grip" />
      </button>

      <aside className="notes-drawer" data-open={drawerOpen} data-ready={ready} style={{ width: panelWidth }} aria-hidden={!drawerOpen}>
        <div className="notes-head">
          <span className="notes-title">{title}</span>
          <button className="glyph" aria-label="Close" onClick={closeDrawer}>✕</button>
        </div>
        <div className="notes-list drawer-scroll">{children}</div>
      </aside>
    </>
  );
}
