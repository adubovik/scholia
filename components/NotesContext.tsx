"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { NoteEntry } from "@/lib/annotations/entries";
import type { SectionTarget } from "@/lib/tree/dual";

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
  /** Reading-panel click on a highlight / node-note number → open+select like
   * openAnnotation, but a second click on the one already selected closes the drawer
   * (a toggle). No `edit` — the reading panel never opens the editor. */
  toggleAnnotation: (annId: string, nodeId: string | null) => void;
  /** Node menu "add note" → reveal the node in the annotation tree with an open composer. */
  composeNode: (nodeId: string) => void;
  /** Close whatever the node menu opened (edit/compose), once the tree has handled it. */
  stopEditing: () => void;
  /** Drawer card → scroll the prose to the annotation, mark active. */
  locate: (entry: NoteEntry) => void;
  /** §cross-reference → scroll the prose to a block ("1.1") or inline highlight
   * ("1.1_1") by its reference key, and select it. */
  scrollToSection: (ref: string) => void;
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
  sections: Record<string, SectionTarget>; // §reference key → block/highlight target
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
// Whether a component renders in the CENTRED panel (vs. its drawer copy). Only a
// centred-panel click toggles the drawer shut on re-select — a row *inside* the drawer
// must never close the drawer it lives in. Default false; ReadingWorkspace wraps the
// centre slot in <CentredPanel>. The value is a constant, so consumers never re-render
// for it (safe to read from the book-sized reading tree).
const CentredCtx = createContext(false);

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
  sections: Record<string, SectionTarget>; // §reference key → block/highlight target
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

  // Mirror drawerOpen into a ref so the (never-rebuilt) actions can read the live
  // value in a click handler — the reading tree consumes only actions, so it must
  // not subscribe to drawer state.
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = state.drawerOpen;
  }, [state.drawerOpen]);

  // Same trick for the §-reference index: the actions are built once (useState), but
  // `sections` changes when the document revalidates, so read it live from a ref.
  const sectionsRef = useRef(sections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

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
    toggleAnnotation: (annId, nodeId) => {
      // Already the selected one AND the drawer's open → this click closes it. Leave
      // the selection as-is so the next click on the same target reopens.
      if (openRef.current && active.getAnn() === annId && active.getNode() === nodeId) {
        setState((s) => ({ ...s, drawerOpen: false }));
        return;
      }
      active.set(annId, nodeId);
      setState((s) => ({ ...s, drawerOpen: true, composeNodeId: null, editingId: null }));
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
    scrollToSection: (ref) => {
      const target = sectionsRef.current[ref];
      if (!target) return;
      // Inline ref → select only the highlight (node id null), exactly like clicking the
      // span, so its whole text block isn't embossed too. Block ref → select the node.
      const nodeId = target.annId ? null : target.nodeId;
      active.set(target.annId, nodeId);
      scrollPanels(target.annId, nodeId);
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

/** Marks its subtree as the centred panel — the one whose annotation clicks toggle
 * the drawer. ReadingWorkspace wraps only the centre slot; the drawer copy inherits
 * the default (false). */
export function CentredPanel({ children }: { children: ReactNode }) {
  return <CentredCtx.Provider value={true}>{children}</CentredCtx.Provider>;
}

/** True when in the centred panel — picks toggleAnnotation over openAnnotation so a
 * re-click closes the drawer instead of just re-selecting. */
export function usePanelCentred(): boolean {
  return useContext(CentredCtx);
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
