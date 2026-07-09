"use client";

export function NodeAnnotationMarker({ hasNote, onOpen }: { hasNote: boolean; onOpen: () => void }) {
  return (
    <button
      className={hasNote ? "node-note-dot node-note-dot--set" : "node-note-dot"}
      aria-label={hasNote ? "Note" : "Add note"}
      onClick={onOpen}
    >
      {hasNote ? "●" : "◦"}
    </button>
  );
}
