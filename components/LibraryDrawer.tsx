"use client";

import Link from "next/link";
import { InviteSettings } from "./InviteSettings";
import { useNotesActions, useNotesState } from "./NotesContext";
import type { InviteView } from "@/lib/data/invites";

export interface LibraryDoc {
  id: string;
  title: string;
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

  return (
    <>
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
            <Link href="/new" className="btn btn--ghost library-new">＋ New</Link>
          </div>
        </div>

        <nav className="library-list">
          {docs.map((d) => (
            <Link
              key={d.id}
              href={`/d/${d.id}`}
              className={d.id === currentId ? "library-row library-row--current" : "library-row"}
            >
              {d.title}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
