"use client";

/** The hover controls shared by every editable note surface — the annotation tree's
 * rows (DualNodeSection) and the layer bands (LayerBands). Extracted so the bands can
 * reuse them without importing from the component that renders them. */

export function EditControl({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="dual-ctl" aria-label={label} title={label} onClick={onClick}>
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.1" style={{ display: "block" }}>
        <path d="M9.2 2.4l2.4 2.4M2 12l0.4-2.6 6.4-6.4 2.4 2.4-6.4 6.4L2 12z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function RemoveControl({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="dual-ctl dual-ctl--danger" aria-label={label} title={label} onClick={onClick}>
      <svg width="12" height="12" viewBox="0 0 12 13" fill="none" stroke="currentColor" strokeWidth="1.1" style={{ display: "block" }}>
        <path d="M1 3.2h10M4.2 3.2V1.8h3.6v1.4M2.4 3.2l0.7 8.3h5.8l0.7-8.3M4.7 5.4v4M7.3 5.4v4" />
      </svg>
    </button>
  );
}

export function ConfirmControl({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="dual-ctl dual-ctl--danger" aria-label={label} title={label} onClick={onClick}>
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: "block" }}>
        <path d="M2.5 7.5l3 3 6-7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function CancelControl({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="dual-ctl" aria-label={label} title={label} onClick={onClick}>
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: "block" }}>
        <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" strokeLinecap="round" />
      </svg>
    </button>
  );
}
