"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { NoteEntry } from "@/lib/annotations/entries";

// Three contexts, split by re-render cost.
//  • ActionsCtx — a value that never changes; the prose tree consumes only this,
//    so opening the drawer / filtering never re-renders the (book-sized) tree.
//  • StateCtx   — reactive drawer/chrome state (open, width, filter); only the
//    drawer + chrome subscribe.
//  • the active-selection STORE — an external store (mutable + listeners, like
//    CollapseContext) so a highlight span or node block subscribes to just "am I
//    the active one?" and re-renders alone when the selection moves. Exactly one
//    annotation/node is active at a time; it persists until the next selection.

export interface NotesActions {
  /** In-text highlight / node identifier / freshly-saved note → open the drawer on
   * that card + mark it (and its block) active. nodeId null = highlight only, no block.
   * `edit` opens the card's editor straight away — what a just-created highlight and
   * the menu's "Edit note" both want, so creating either kind of note lands you in
   * a focused textarea rather than a card you have to click ✎ on. */
  openAnnotation: (annId: string, nodeId: string | null, edit?: boolean) => void;
  /** Node menu "add note" → reveal the node in the annotation tree with an open composer. */
  composeNode: (nodeId: string) => void;
  /** Close whatever the node menu opened (edit/compose), once the tree has handled it. */
  stopEditing: () => void;
  /** Drawer card → scroll the prose to the annotation, mark active. */
  locate: (entry: NoteEntry) => void;
  /** §cross-reference → scroll the prose to a section by its number. */
  scrollToSection: (num: string) => void;
  toggleDrawer: () => void;
  closeDrawer: () => void;
  toggleLeft: () => void;
  closeLeft: () => void;
  setPanelWidth: (w: number) => void;
  setFilterTag: (tag: string | null) => void;
  /** Toggle a preset-glyph filter section; ANDs with the tag filter. */
  toggleFilterGlyph: (glyph: string) => void;
  /** The "All" chip — clear both the tag and glyph filters at once. */
  clearFilters: () => void;
}

export interface NotesState {
  entries: NoteEntry[];
  sections: Record<string, string>; // section number → node id (for §link validation)
  drawerOpen: boolean;
  leftOpen: boolean;
  composeNodeId: string | null;
  editingId: string | null; // card whose editor should be open (see openAnnotation)
  panelWidth: number;
  filterTag: string | null;
  filterGlyphs: string[]; // active preset-glyph filters (AND); [] = no glyph filter
}

interface ActiveStore {
  subscribe: (cb: () => void) => () => void;
  getAnn: () => string | null;
  getNode: () => string | null;
  set: (annId: string | null, nodeId: string | null) => void;
}

// Each route mounts its own NotesProvider, so the library-drawer state is stashed
// in sessionStorage to survive navigation (open on home → click a doc → stays open).
const LEFT_KEY = "scholia:leftOpen";

const ActionsCtx = createContext<NotesActions | null>(null);
const StateCtx = createContext<NotesState | null>(null);
const ActiveCtx = createContext<ActiveStore | null>(null);

function createActiveStore(): ActiveStore {
  let annId: string | null = null;
  let nodeId: string | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getAnn: () => annId,
    getNode: () => nodeId,
    set(a, n) {
      annId = a;
      nodeId = n;
      listeners.forEach((l) => l());
    },
  };
}

function scrollProseTo(el: HTMLElement) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Cross-panel select: scroll both the reading panel and the annotation panel to the
// selected annotation, so a click in one lines the other up. Panels are marked with
// data-panel; each is searched independently (their node ids collide across trees, so
// scoping by panel is what keeps the right one). Deferred a frame so a just-opened
// drawer has laid out.
function scrollPanels(annId: string | null, nodeId: string | null) {
  requestAnimationFrame(() => {
    const esc = (s: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s);
    const find = (panel: string, sels: string[]) => {
      const root = document.querySelector(`[data-panel="${panel}"]`);
      for (const sel of sels) {
        const el = root?.querySelector<HTMLElement>(sel);
        if (el) return el;
      }
      return null;
    };
    // Reading panel: the highlight span, else the node block.
    find("reading", [
      annId ? `[data-ann-id~="${esc(annId)}"]` : "",
      nodeId ? `[data-node-id="${esc(nodeId)}"]` : "",
    ].filter(Boolean))?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Annotation panel: the dual row keyed by the annotation id, else by the node id.
    find("annotation", [
      annId ? `[data-node-id="${esc(annId)}"]` : "",
      nodeId ? `[data-node-id="${esc(nodeId)}"]` : "",
    ].filter(Boolean))?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

export function NotesProvider({
  entries,
  sections,
  initialLeftOpen = false,
  children,
}: {
  entries: NoteEntry[];
  sections: Record<string, string>; // section number → node id, for §links
  initialLeftOpen?: boolean; // home (no document open) starts with the library showing
  children: ReactNode;
}) {
  const [state, setState] = useState<Omit<NotesState, "entries" | "sections">>({
    drawerOpen: false,
    leftOpen: initialLeftOpen,
    composeNodeId: null,
    editingId: null,
    panelWidth: 480,
    filterTag: null,
    filterGlyphs: [],
  });
  const [active] = useState(createActiveStore);

  useEffect(() => {
    const stored = sessionStorage.getItem(LEFT_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount viewport + storage read
    setState((s) => ({
      ...s,
      panelWidth: Math.round(window.innerWidth / 2),
      // Home forces the library open; elsewhere restore the last choice so
      // navigating from the drawer doesn't slam it shut.
      leftOpen: initialLeftOpen ? true : stored === "1",
    }));
    if (initialLeftOpen) sessionStorage.setItem(LEFT_KEY, "1");
  }, [initialLeftOpen]);

  const [actions] = useState<NotesActions>(() => ({
    openAnnotation: (annId, nodeId, edit = false) => {
      active.set(annId, nodeId);
      setState((s) => ({ ...s, drawerOpen: true, composeNodeId: null, editingId: edit ? annId : null }));
      scrollPanels(annId, nodeId);
    },
    composeNode: (nodeId) => {
      active.set(null, nodeId);
      setState((s) => ({ ...s, drawerOpen: true, composeNodeId: nodeId, editingId: null }));
      scrollPanels(null, nodeId);
    },
    stopEditing: () => setState((s) => ({ ...s, composeNodeId: null, editingId: null })),
    locate: (entry) => {
      active.set(entry.id, entry.nodeId);
      const sel =
        entry.kind === "inline"
          ? `[data-ann-id~="${entry.id}"]` // spans carry a space-joined id list
          : `[data-node-id="${entry.nodeId}"]`;
      const el = document.querySelector<HTMLElement>(sel);
      if (el) scrollProseTo(el);
    },
    scrollToSection: (num) => {
      const nodeId = sections[num];
      if (!nodeId) return;
      active.set(null, nodeId);
      const el = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`);
      if (el) scrollProseTo(el);
    },
    toggleDrawer: () => setState((s) => ({ ...s, drawerOpen: !s.drawerOpen })),
    closeDrawer: () => setState((s) => ({ ...s, drawerOpen: false })),
    toggleLeft: () =>
      setState((s) => {
        const leftOpen = !s.leftOpen;
        sessionStorage.setItem(LEFT_KEY, leftOpen ? "1" : "0");
        return { ...s, leftOpen };
      }),
    closeLeft: () => {
      sessionStorage.setItem(LEFT_KEY, "0");
      setState((s) => ({ ...s, leftOpen: false }));
    },
    setPanelWidth: (w) => setState((s) => ({ ...s, panelWidth: w })),
    setFilterTag: (tag) => setState((s) => ({ ...s, filterTag: s.filterTag === tag ? null : tag })),
    toggleFilterGlyph: (glyph) =>
      setState((s) => ({
        ...s,
        filterGlyphs: s.filterGlyphs.includes(glyph)
          ? s.filterGlyphs.filter((g) => g !== glyph)
          : [...s.filterGlyphs, glyph],
      })),
    clearFilters: () => setState((s) => ({ ...s, filterTag: null, filterGlyphs: [] })),
  }));

  return (
    <ActionsCtx.Provider value={actions}>
      <ActiveCtx.Provider value={active}>
        <StateCtx.Provider value={{ ...state, entries, sections }}>{children}</StateCtx.Provider>
      </ActiveCtx.Provider>
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

function useActiveStore(): ActiveStore {
  const ctx = useContext(ActiveCtx);
  if (!ctx) throw new Error("active hooks must be used within a NotesProvider");
  return ctx;
}

/** Is this inline annotation the active (filled/selected) one? Subscribes per-id. */
export function useActiveAnn(id: string): boolean {
  const store = useActiveStore();
  return useSyncExternalStore(store.subscribe, () => store.getAnn() === id, () => false);
}

/** The active annotation id IF it covers this segment, else null. A segment fills
 * with the active highlight's colour when this returns its id; returning null for
 * every non-covered segment means selection changes only re-render the (≤2) segments
 * whose membership actually flips. Multi-segment highlights fill across every segment. */
export function useActiveAnnInSet(ids: string[]): string | null {
  const store = useActiveStore();
  const key = ids.join(" ");
  return useSyncExternalStore(
    store.subscribe,
    () => {
      const a = store.getAnn();
      return a !== null && key.split(" ").includes(a) ? a : null;
    },
    () => null,
  );
}

/** Is this node block the active (embossed) one? Subscribes per-node. */
export function useActiveNode(id: string): boolean {
  const store = useActiveStore();
  return useSyncExternalStore(store.subscribe, () => store.getNode() === id, () => false);
}

/** The current active annotation id (for the drawer's scroll-to-card effect). */
export function useActiveAnnId(): string | null {
  const store = useActiveStore();
  return useSyncExternalStore(store.subscribe, store.getAnn, () => null);
}
