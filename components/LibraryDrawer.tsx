"use client";

import { useState } from "react";
import Link from "next/link";
import { InviteSettings } from "./InviteSettings";
import { NewDocModal } from "./NewDocModal";
import { useNotesActions, useNotesState } from "./NotesContext";
import type { InviteView } from "@/lib/data/invites";

export interface LibraryDoc {
  id: string;
  title: string;
  author: string;
  paragraphs: number;
  notes: number;
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
  currentId: string;
  canInvite: boolean;
  invites: InviteView[];
}) {
  const { leftOpen } = useNotesState();
  const { toggleLeft, closeLeft } = useNotesActions();
  const [newOpen, setNewOpen] = useState(false);

  return (
    <>
      {newOpen && <NewDocModal onClose={() => setNewOpen(false)} />}

      {leftOpen && <div className="notes-backdrop notes-backdrop--left" onClick={closeLeft} />}

      <button
        className="notes-edge notes-edge--left"
        aria-label="Toggle library"
        style={{ left: leftOpen ? 300 : 0 }}
        onClick={toggleLeft}
      >
        <span className="notes-edge-grip" />
      </button>

      <aside className="library-drawer" data-open={leftOpen} aria-hidden={!leftOpen}>
        <div className="library-head">
          <div className="library-brand-row">
            <div>
              <div className="library-brand">Scholia</div>
              <div className="library-tagline">Close reading &amp; marginal annotation.</div>
            </div>
            <button className="glyph" aria-label="Close" onClick={closeLeft}>✕</button>
          </div>
          <div className="library-actions">
            {canInvite && <InviteSettings invites={invites} />}
            <button type="button" className="btn btn--ghost library-new" onClick={() => setNewOpen(true)}>＋ New</button>
          </div>
        </div>

        <nav className="library-list">
          {docs.map((d) => (
            <Link
              key={d.id}
              href={`/d/${d.id}`}
              className={d.id === currentId ? "library-row library-row--current" : "library-row"}
            >
              <span className="library-row-title">{d.title}</span>
              <span className="library-row-author">{d.author}</span>
              <span className="library-row-stats">
                {d.paragraphs} ¶ · {d.notes} {d.notes === 1 ? "note" : "notes"}
              </span>
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
