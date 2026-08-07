"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { InviteSettings } from "./InviteSettings";
import { NewDocModal } from "./NewDocModal";
import { useNotesActions, useNotesState } from "./NotesContext";
import { makeEdgeHandler } from "./useEdgeDrag";
import type { InviteView } from "@/lib/data/invites";

export interface LibraryDoc {
  id: string;
  title: string;
  author: string;
  nodeCount: number;
  highlightCount: number;
  noteCount: number;
}

/** Left slide-in library: brand, new/invite actions, and the catalog. Toggled by
 * an edge tab mirroring the notes drawer on the right. */
export function LibraryDrawer({
  docs,
  currentId,
  canInvite,
  invites,
}: {
  docs: LibraryDoc[];
  currentId: string | null;
  canInvite: boolean;
  invites: InviteView[];
}) {
  const { leftOpen, leftWidth, ready } = useNotesState();
  const { toggleLeft, closeLeft, setLeftWidth } = useNotesActions();
  const [newOpen, setNewOpen] = useState(false);
  // ponytail: route-gated demo chrome (badge + storage-free link). Promote to a prop
  // if a second demo-like, DB-less surface ever appears.
  const isDemo = usePathname() === "/demo";

  // Edge handle: click (when closed) toggles; drag (when open) resizes — mirror of the
  // right drawer, measured from the left viewport edge.
  const onHandleDown = makeEdgeHandler({
    side: "left",
    open: leftOpen,
    minW: 260,
    onResize: setLeftWidth,
    onClose: closeLeft,
    onToggle: toggleLeft,
  });

  return (
    <>
      {newOpen && <NewDocModal onClose={() => setNewOpen(false)} />}

      {leftOpen && <div className="notes-backdrop notes-backdrop--left" onClick={closeLeft} />}

      <button
        className="notes-edge notes-edge--left"
        aria-label="Toggle library"
        data-ready={ready}
        style={{ left: leftOpen ? leftWidth : 0, cursor: leftOpen ? "col-resize" : "pointer" }}
        onPointerDown={onHandleDown}
      >
        <span className="notes-edge-grip" />
      </button>

      <aside className="library-drawer" data-open={leftOpen} data-ready={ready} style={{ width: leftWidth }} aria-hidden={!leftOpen}>
        <div className="library-head">
          <div className="library-brand-row">
            <div>
              <div className="library-brand">Scholia{isDemo && <span className="library-brand-badge">Demo</span>}</div>
              <div className="library-tagline">Close reading &amp; marginal annotation.</div>
            </div>
            <button className="glyph" aria-label="Close" onClick={closeLeft}>✕</button>
          </div>
          <div className="library-actions">
            {canInvite && <InviteSettings invites={invites} />}
            <button type="button" className="btn btn--ghost library-new" aria-label="Add a text" title="Add a text" onClick={() => setNewOpen(true)}>＋</button>
          </div>
        </div>

        <nav className="library-list">
          {docs.map((d) => (
            <Link
              key={d.id}
              href={isDemo ? "/demo" : `/d/${d.id}`}
              className={d.id === currentId ? "library-row library-row--current" : "library-row"}
            >
              <span className="library-row-main">
                <span className="library-row-title">{d.title}</span>
                <span className="library-row-author">{d.author}</span>
              </span>
              <span className="library-row-stats">
                <span className="lib-stat" title={`${d.nodeCount} text nodes`}>§ {d.nodeCount}</span>
                <span className="lib-stat" title={`${d.highlightCount} highlights`}><span className="stat-hl" />{d.highlightCount}</span>
                <span className="lib-stat" title={`${d.noteCount} notes`}>✎ {d.noteCount}</span>
              </span>
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
