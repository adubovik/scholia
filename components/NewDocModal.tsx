"use client";

import { useRouter } from "next/navigation";
import { ImportForm } from "./ImportForm";

/** "Add to the library" as a modal over the reading screen (replacing the old
 * standalone /new route). Full-screen backdrop above the drawers; closes and
 * navigates to the new document on import. Rendered only while open (the host
 * gates it) so useRouter is never called on a closed, unmounted modal. */
export function NewDocModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  return (
    <div className="newdoc-backdrop" onClick={onClose}>
      <div
        className="newdoc-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Add to the library"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="newdoc-head">
          <div>
            <p className="import-eyebrow">New text</p>
            <h2 className="newdoc-title">Add to the library</h2>
          </div>
          <button className="glyph" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="newdoc-rule" />
        <ImportForm onDone={(id) => { onClose(); router.push(`/d/${id}`); }} />
      </div>
    </div>
  );
}
