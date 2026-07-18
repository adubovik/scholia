"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";

// Collapse state lives in an external store (a mutable Set + listeners) rather
// than React state, so the context value's identity never changes. That's the
// whole point: a Context whose value changes on every toggle re-renders *every*
// consumer — for a book-sized tree, one collapse click re-rendered all nodes
// (~270ms on 300 nodes, seconds on thousands). Here the provider never
// re-renders; each node subscribes to only its own id via useSyncExternalStore
// and re-renders only when its own collapsed bit flips.
// Absent from the set = expanded (the prior default).
type CollapseStore = {
  subscribe: (cb: () => void) => () => void;
  isCollapsed: (id: string) => boolean;
  toggle: (id: string) => void;
  setMany: (ids: string[], collapsed: boolean) => void;
};

const Ctx = createContext<CollapseStore | null>(null);

function createStore(): CollapseStore {
  const collapsed = new Set<string>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    isCollapsed: (id) => collapsed.has(id),
    toggle(id) {
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
      emit();
    },
    setMany(ids, value) {
      for (const id of ids) {
        if (value) collapsed.add(id);
        else collapsed.delete(id);
      }
      emit();
    },
  };
}

export function CollapseProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

function useStore() {
  const store = useContext(Ctx);
  if (!store) throw new Error("useCollapse must be used within a CollapseProvider");
  return store;
}

// Reactive read: subscribes to this id only. useSyncExternalStore bails out of a
// re-render when the boolean snapshot is unchanged, so toggling node A leaves
// every other node untouched.
export function useCollapsed(id: string): boolean {
  const store = useStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.isCollapsed(id),
    () => false, // server snapshot: nothing is collapsed during SSR
  );
}

// Actions only — stable across the store's lifetime, no re-render on change.
export function useCollapse() {
  const store = useStore();
  return { toggle: store.toggle, setMany: store.setMany };
}
