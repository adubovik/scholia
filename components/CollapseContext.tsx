"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

// Collapse state lifted out of individual NodeSections into one Set of collapsed
// node ids, so a node can fold/unfold its whole subtree ("Collapse/Expand
// children") — something local per-node useState couldn't reach across siblings.
// Absent from the set = expanded (the prior default).
type CollapseCtx = {
  isCollapsed: (id: string) => boolean;
  toggle: (id: string) => void;
  setMany: (ids: string[], collapsed: boolean) => void;
};

const Ctx = createContext<CollapseCtx | null>(null);

export function CollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const isCollapsed = useCallback((id: string) => collapsed.has(id), [collapsed]);
  const toggle = useCallback(
    (id: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const setMany = useCallback(
    (ids: string[], value: boolean) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (value) next.add(id);
          else next.delete(id);
        }
        return next;
      }),
    [],
  );

  return <Ctx.Provider value={{ isCollapsed, toggle, setMany }}>{children}</Ctx.Provider>;
}

export function useCollapse() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCollapse must be used within a CollapseProvider");
  return ctx;
}
