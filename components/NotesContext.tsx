"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { NoteEntry } from "@/lib/annotations/entries";

// Two contexts on purpose. The reading tree (SourcePassage / NodeSection) only
// ever needs the ACTIONS — a value that never changes — so opening the drawer or
// flipping a filter never re-renders the (book-sized) prose. Only the drawer,
// header, and main-margin wrapper subscribe to the reactive STATE. Same rationale
// as CollapseContext: keep the hot tree out of the re-render path.

export interface NotesActions {
  /** In-text highlight / node marker → open the drawer on that card. */
  openAnnotation: (id: string) => void;
  /** Node menu "add note" → open the drawer with a fresh node-note composer. */
  composeNode: (nodeId: string) => void;
  /** Drawer card → scroll the prose to the annotation and flash it. */
  locate: (entry: NoteEntry) => void;
  toggleDrawer: () => void;
  closeDrawer: () => void;
  toggleLeft: () => void;
  closeLeft: () => void;
  setPanelWidth: (w: number) => void;
  setFilterTag: (tag: string | null) => void;
}

export interface NotesState {
  entries: NoteEntry[];
  drawerOpen: boolean;
  leftOpen: boolean;
  activeId: string | null;
  composeNodeId: string | null;
  panelWidth: number;
  filterTag: string | null;
}

const ActionsCtx = createContext<NotesActions | null>(null);
const StateCtx = createContext<NotesState | null>(null);

// Scroll a target into view and flash it. Pure DOM so the tree never re-renders
// on locate — a class is added, then removed after the animation window.
function flash(el: HTMLElement) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("note-flash");
  window.setTimeout(() => el.classList.remove("note-flash"), 900);
}

export function NotesProvider({
  entries,
  children,
}: {
  entries: NoteEntry[];
  children: ReactNode;
}) {
  const [state, setState] = useState<Omit<NotesState, "entries">>({
    drawerOpen: false,
    leftOpen: false,
    activeId: null,
    composeNodeId: null,
    panelWidth: 480,
    filterTag: null,
  });

  // Default the panel to half the viewport once we're on the client. Reading
  // window during render would break SSR, so the one-shot mount effect is the path.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount viewport read
    setState((s) => ({ ...s, panelWidth: Math.round(window.innerWidth / 2) }));
  }, []);

  // Actions close over the stable setState, so the object is built exactly once
  // (lazy initializer) and its identity never changes — the whole point of the
  // split: the prose tree consumes only this and never re-renders on state.
  const [actions] = useState<NotesActions>(() => ({
    openAnnotation: (id) =>
      setState((s) => ({ ...s, drawerOpen: true, activeId: id, composeNodeId: null })),
    composeNode: (nodeId) =>
      setState((s) => ({ ...s, drawerOpen: true, composeNodeId: nodeId, activeId: null })),
    locate: (entry) => {
      const sel =
        entry.kind === "inline"
          ? `[data-ann-id~="${entry.id}"]` // spans carry a space-joined id list
          : `[data-node-id="${entry.nodeId}"]`;
      const el = document.querySelector<HTMLElement>(sel);
      if (el) flash(el);
      setState((s) => ({ ...s, activeId: entry.id }));
    },
    toggleDrawer: () => setState((s) => ({ ...s, drawerOpen: !s.drawerOpen })),
    closeDrawer: () => setState((s) => ({ ...s, drawerOpen: false })),
    toggleLeft: () => setState((s) => ({ ...s, leftOpen: !s.leftOpen })),
    closeLeft: () => setState((s) => ({ ...s, leftOpen: false })),
    setPanelWidth: (w) => setState((s) => ({ ...s, panelWidth: w })),
    setFilterTag: (tag) => setState((s) => ({ ...s, filterTag: s.filterTag === tag ? null : tag })),
  }));

  return (
    <ActionsCtx.Provider value={actions}>
      <StateCtx.Provider value={{ ...state, entries }}>{children}</StateCtx.Provider>
    </ActionsCtx.Provider>
  );
}

export function useNotesActions(): NotesActions {
  const ctx = useContext(ActionsCtx);
  if (!ctx) throw new Error("useNotesActions must be used within a NotesProvider");
  return ctx;
}

export function useNotesState(): NotesState {
  const ctx = useContext(StateCtx);
  if (!ctx) throw new Error("useNotesState must be used within a NotesProvider");
  return ctx;
}
