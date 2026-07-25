"use client";

import type { CSSProperties, ReactNode } from "react";
import { ReadingSettings } from "./ReadingSettings";
import { DocInfo, type DocMeta } from "./DocInfo";
import { useNotesActions, useNotesState } from "./NotesContext";

const LIBRARY_W = 300;

/** The reading column plus its running-head. Reads drawer state to shift the
 * column left/right when a drawer opens (desktop only — a media query pins it
 * centred on mobile, where drawers become sheets). */
export function ReadingChrome({
  title,
  meta,
  children,
}: {
  title?: string;
  meta?: DocMeta; // absent = home (no document): render the bare shifting column, no running-head
  children: ReactNode;
}) {
  const { entries, leftOpen, drawerOpen, panelWidth } = useNotesState();
  const { toggleDrawer } = useNotesActions();

  const style = {
    "--shift-left": leftOpen ? `${LIBRARY_W}px` : "0px",
    "--shift-right": drawerOpen ? `${panelWidth}px` : "0px",
  } as CSSProperties;

  // Right drawer expands the column to fill the freed space; the left library just
  // nudges the same-width column to stay centred in what's left (item 1).
  const mode = drawerOpen ? "right" : leftOpen ? "left" : "default";

  return (
    <main className="page page--read reading-main" data-mode={mode} style={style}>
      {meta && (
        <div className="reading-head">
          <h1 className="reading-title">{title}</h1>
          <div className="reading-head-actions">
            <ReadingSettings triggerClassName="reading-headbtn" />
            <DocInfo meta={meta} />
            <button className="reading-notesbtn" aria-label={`Notes (${entries.length})`} onClick={toggleDrawer}>
              {entries.length}
            </button>
          </div>
        </div>
      )}
      {children}
    </main>
  );
}
