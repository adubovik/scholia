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
  dualMode,
  onToggleMode,
  children,
}: {
  title?: string;
  meta?: DocMeta; // absent = home (no document): render the bare shifting column, no running-head
  dualMode?: boolean; // annotation-first view active? (undefined = toggle not shown)
  onToggleMode?: () => void;
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
            {onToggleMode && (
              <button
                className="reading-headbtn reading-headbtn--icon reading-modebtn"
                data-dual={dualMode || undefined}
                aria-pressed={dualMode}
                aria-label={dualMode ? "Reading-first view" : "Annotation-first view"}
                title={dualMode ? "Reading-first view" : "Annotation-first view"}
                onClick={onToggleMode}
              >
                {/* Two stacked rules with a swap arrow — text ⇄ annotation. */}
                <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
                  <path d="M1 3h7M1 7h5M1 11h7" strokeLinecap="round" />
                  <path d="M11 4.5l2.5-2 2.5 2M13.5 2.5v9M15.5 9.5L13 11.5 10.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
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
