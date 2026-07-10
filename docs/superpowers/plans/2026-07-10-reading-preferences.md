# Reading Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Apple-Books-style "Aa" display sheet that live-tunes five reading preferences (font size, line spacing, word spacing, block spacing, column width) via CSS custom properties persisted to localStorage, and tighten two static layout issues (line↔pencil gap, block spacing uniformity).

**Architecture:** Every tunable value is a `--reading-*` CSS variable declared in `:root`. A client modal rewrites those variables on `document.documentElement` and persists step-indices to localStorage; a pre-paint inline script re-applies them before first paint to avoid a flash of defaults. All scale/mapping logic lives in one shared module (`lib/reading/prefs.ts`) so the component and the inline script never drift.

**Tech Stack:** Next.js 16 App Router, React client components, native `<input type=range>`, CSS custom properties, Vitest + @testing-library/react (jsdom).

## Global Constraints

- Path alias `@/*` → repo root.
- Tests are colocated in `__tests__/` next to the code; use plain `expect` + testing-library queries (NO jest-dom matchers — `.toBeDefined()`, `.toBeNull()`, `screen.getByRole`).
- `pnpm build` runs `tsc` against **ES2017** and catches errors Vitest won't — run it before claiming done.
- Persistence is per-device localStorage only. No DB, no schema change, no per-document scope.
- Only the five named controls. The line↔pencil gap is a static fix, NOT a slider.
- Reuse existing palette tokens (`--paper --field --rule --muted --faint --ink`) and the `--mono`/`--serif` fonts. No new colors.

---

### Task 1: Shared prefs module (`lib/reading/prefs.ts`)

**Files:**
- Create: `lib/reading/prefs.ts`
- Test: `lib/reading/__tests__/prefs.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `STORAGE_KEY: string`
  - `type PrefKey = "size" | "line" | "word" | "block" | "width"`
  - `type PrefIndices = Record<PrefKey, number>`
  - `CONTROLS: Record<PrefKey, { cssVar: string; steps: string[]; default: number }>`
  - `DEFAULT_INDICES: PrefIndices`
  - `stepsToVars(indices: PrefIndices): Record<string, string>`
  - `clampIndices(raw: unknown): PrefIndices`
  - `readStoredIndices(): PrefIndices`
  - `writeStoredIndices(indices: PrefIndices): void`
  - `clearStoredIndices(): void`
  - `preloadScript(): string`

- [ ] **Step 1: Write the failing test**

Create `lib/reading/__tests__/prefs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  STORAGE_KEY, DEFAULT_INDICES,
  stepsToVars, clampIndices, readStoredIndices, writeStoredIndices,
  clearStoredIndices, preloadScript,
} from "@/lib/reading/prefs";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("style");
});

describe("stepsToVars", () => {
  it("maps default indices to the current literals", () => {
    expect(stepsToVars(DEFAULT_INDICES)).toEqual({
      "--reading-font-size": "1.1875rem",
      "--reading-line-height": "1.72",
      "--reading-word-spacing": "0em",
      "--reading-block-gap": "1.15rem",
      "--reading-measure": "44rem",
    });
  });
  it("maps a raised size index to the larger step", () => {
    expect(stepsToVars({ ...DEFAULT_INDICES, size: 4 })["--reading-font-size"]).toBe("1.4rem");
  });
});

describe("clampIndices", () => {
  it("returns defaults for garbage input", () => {
    expect(clampIndices(null)).toEqual(DEFAULT_INDICES);
    expect(clampIndices({ size: 99, line: -1, word: "x" })).toEqual(DEFAULT_INDICES);
  });
  it("keeps in-range integers", () => {
    expect(clampIndices({ ...DEFAULT_INDICES, block: 4 }).block).toBe(4);
  });
});

describe("storage round-trip", () => {
  it("writes then reads clamped indices", () => {
    writeStoredIndices({ ...DEFAULT_INDICES, width: 0 });
    expect(readStoredIndices().width).toBe(0);
  });
  it("reads defaults when empty", () => {
    expect(readStoredIndices()).toEqual(DEFAULT_INDICES);
  });
  it("clears storage", () => {
    writeStoredIndices({ ...DEFAULT_INDICES, width: 0 });
    clearStoredIndices();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("preloadScript", () => {
  it("applies stored vars to documentElement", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_INDICES, size: 4 }));
    // eslint-disable-next-line no-eval
    eval(preloadScript());
    expect(document.documentElement.style.getPropertyValue("--reading-font-size")).toBe("1.4rem");
  });
  it("references the storage key", () => {
    expect(preloadScript()).toContain(STORAGE_KEY);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test prefs`
Expected: FAIL — cannot resolve `@/lib/reading/prefs`.

- [ ] **Step 3: Write the implementation**

Create `lib/reading/prefs.ts`:

```ts
// Per-device reading preferences. Every tunable value is a --reading-* CSS
// variable; this module is the single source of truth for the step scales and
// the localStorage shape, shared by the settings UI and the pre-paint script.

export const STORAGE_KEY = "scholia:reading-prefs";

export type PrefKey = "size" | "line" | "word" | "block" | "width";

// steps are pre-formatted CSS values (line-height is unitless) so mapping is a
// plain lookup. Index `default` reproduces today's look (except block, tightened).
export const CONTROLS: Record<PrefKey, { cssVar: string; steps: string[]; default: number }> = {
  size:  { cssVar: "--reading-font-size",    steps: ["1rem", "1.09rem", "1.1875rem", "1.28rem", "1.4rem"], default: 2 },
  line:  { cssVar: "--reading-line-height",  steps: ["1.4", "1.56", "1.72", "1.9", "2.1"], default: 2 },
  word:  { cssVar: "--reading-word-spacing", steps: ["0em", "0.05em", "0.1em", "0.16em", "0.24em"], default: 0 },
  block: { cssVar: "--reading-block-gap",    steps: ["0.7rem", "0.9rem", "1.15rem", "1.5rem", "1.9rem"], default: 2 },
  width: { cssVar: "--reading-measure",      steps: ["32rem", "38rem", "44rem", "52rem", "62rem"], default: 2 },
};

const KEYS = Object.keys(CONTROLS) as PrefKey[];

export type PrefIndices = Record<PrefKey, number>;

export const DEFAULT_INDICES: PrefIndices = KEYS.reduce((acc, k) => {
  acc[k] = CONTROLS[k].default;
  return acc;
}, {} as PrefIndices);

export function clampIndices(raw: unknown): PrefIndices {
  const obj = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};
  return KEYS.reduce((acc, k) => {
    const v = obj[k];
    const max = CONTROLS[k].steps.length - 1;
    acc[k] = typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : CONTROLS[k].default;
    return acc;
  }, {} as PrefIndices);
}

export function stepsToVars(indices: PrefIndices): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const k of KEYS) vars[CONTROLS[k].cssVar] = CONTROLS[k].steps[indices[k]];
  return vars;
}

export function readStoredIndices(): PrefIndices {
  if (typeof localStorage === "undefined") return { ...DEFAULT_INDICES };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return clampIndices(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_INDICES };
  }
}

export function writeStoredIndices(indices: PrefIndices): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(indices));
  } catch {
    /* private-mode / quota — preferences are best-effort */
  }
}

export function clearStoredIndices(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// Self-contained IIFE string for a pre-paint <script>. It can't import this
// module (it runs before the bundle), so the scales are serialized in. Kept
// here, next to CONTROLS, so the two copies are generated from one source.
export function preloadScript(): string {
  const map = KEYS.reduce((acc, k) => {
    acc[k] = { v: CONTROLS[k].cssVar, s: CONTROLS[k].steps, d: CONTROLS[k].default };
    return acc;
  }, {} as Record<string, { v: string; s: string[]; d: number }>);
  return `(function(){try{var C=${JSON.stringify(map)},K=${JSON.stringify(STORAGE_KEY)};` +
    `var raw=localStorage.getItem(K),p=raw?JSON.parse(raw):{},d=document.documentElement;` +
    `for(var k in C){var c=C[k],i=p&&typeof p[k]==="number"&&p[k]>=0&&p[k]<c.s.length?p[k]:c.d;` +
    `d.style.setProperty(c.v,c.s[i]);}}catch(e){}})();`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test prefs`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/reading/prefs.ts lib/reading/__tests__/prefs.test.ts
git commit -m "feat(reading): prefs module — step scales, storage, pre-paint script

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: CSS variables + static layout fixes

**Files:**
- Modify: `app/globals.css` (`:root`, `.reading-p`, `.node-preview`, `.node`, `.node-children`; add `.page--read`)
- Modify: `app/d/[docId]/page.tsx:11`

**Interfaces:**
- Consumes: nothing.
- Produces: the `--reading-*` variables the settings UI (Task 3) and script (Task 4) will rewrite; the `.page--read` width scope.

This task is presentational — its gate is a clean `pnpm build`; visual confirmation is deferred to Task 5.

- [ ] **Step 1: Declare the variables**

In `app/globals.css`, inside `:root` (after the `--mono` line, before the closing `}` at line ~20), add:

```css
  /* reading surface — live-tunable via the Aa display sheet */
  --reading-font-size:    1.1875rem;
  --reading-line-height:  1.72;
  --reading-word-spacing: 0em;
  --reading-block-gap:    1.15rem;  /* tightened from 1.6rem; uniform at all depths */
  --reading-measure:      44rem;
```

- [ ] **Step 2: Repoint the prose consumers**

Replace the `.reading-p` rule (currently `globals.css:152-161`) so the three tunables read variables:

```css
.reading-p {
  font-size: var(--reading-font-size);
  line-height: var(--reading-line-height);
  word-spacing: var(--reading-word-spacing);
  margin: 0 0 1.4rem;
  color: var(--ink);
  text-align: justify;
  hyphens: auto;
  text-wrap: pretty;
  hanging-punctuation: first last;
}
```

In the `.node-preview` rule (currently `globals.css:366-380`), replace the `font-size: 1.1875rem;` and `line-height: 1.72;` lines and add word-spacing so it stays identical to `.reading-p`:

```css
  font-size: var(--reading-font-size);
  line-height: var(--reading-line-height);
  word-spacing: var(--reading-word-spacing);
```

- [ ] **Step 3: Repoint block spacing + tighten the pencil gutter**

Change `.node` (currently `globals.css:348`) margin-top to the token:

```css
.node { position: relative; margin-top: var(--reading-block-gap); display: flex; align-items: baseline; gap: 0.35rem; }
```

Change `.node-children` (currently `globals.css:413-423`). Replace `padding-left: 2.05rem;` and `margin-top: 0.75rem;`:

```css
.node-children {
  border-left: 1px solid var(--rule);
  /* Drop the connector straight down from the toggle triangle (see -0.9rem note
     below). Base child indent tightened 1.15rem → 0.5rem to close the gap
     between the connector line and each child's note pencil. */
  margin-left: -0.9rem;
  padding-left: 1.4rem; /* 0.5rem base indent + 0.9rem pulled back */
  margin-top: var(--reading-block-gap); /* uniform block spacing at every depth */
}
```

- [ ] **Step 4: Scope the column width to the read view only**

`.page` is shared by Home/Import/Read, so add a read-only override. After the `.page` rule (currently `globals.css:33-37`), add:

```css
/* Only the read view's width is user-tunable; Home and Import keep 44rem. */
.page--read { max-width: var(--reading-measure, 44rem); }
```

Add `position: relative` to `.reading` (currently `globals.css:140`) so the Aa trigger can anchor to it:

```css
.reading { position: relative; padding-top: 0.5rem; }
```

- [ ] **Step 5: Apply the read class to the document page**

In `app/d/[docId]/page.tsx`, change line 11:

```tsx
    <main className="page page--read">
```

- [ ] **Step 6: Verify the build**

Run: `pnpm build`
Expected: build succeeds (compiled successfully). Existing tests still green: `pnpm test`.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css app/d/\[docId\]/page.tsx
git commit -m "style(reading): --reading-* vars; tighten pencil gutter + unify block gap

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: ReadingSettings component + mount + sheet styles

**Files:**
- Create: `components/ReadingSettings.tsx`
- Test: `components/__tests__/reading-settings.test.tsx`
- Modify: `components/ReadingSurface.tsx`
- Modify: `app/globals.css` (append Aa / sheet styles)

**Interfaces:**
- Consumes (from Task 1): `CONTROLS`, `DEFAULT_INDICES`, `PrefKey`, `PrefIndices`, `stepsToVars`, `readStoredIndices`, `writeStoredIndices`, `clearStoredIndices`.
- Produces: `<ReadingSettings />` (no props) mounted inside the `.reading` article.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/reading-settings.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReadingSettings } from "@/components/ReadingSettings";
import { STORAGE_KEY } from "@/lib/reading/prefs";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("style");
});

function openSheet() {
  render(<ReadingSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Display settings" }));
}

describe("ReadingSettings", () => {
  it("opens the sheet with five sliders", () => {
    openSheet();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getAllByRole("slider")).toHaveLength(5);
  });

  it("applies a slider change to the CSS var and persists it", () => {
    openSheet();
    fireEvent.change(screen.getByRole("slider", { name: "Size" }), { target: { value: "4" } });
    expect(document.documentElement.style.getPropertyValue("--reading-font-size")).toBe("1.4rem");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).size).toBe(4);
  });

  it("resets to defaults and clears storage", () => {
    openSheet();
    fireEvent.change(screen.getByRole("slider", { name: "Size" }), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(document.documentElement.style.getPropertyValue("--reading-font-size")).toBe("1.1875rem");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("closes on Escape", () => {
    openSheet();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test reading-settings`
Expected: FAIL — cannot resolve `@/components/ReadingSettings`.

- [ ] **Step 3: Write the component**

Create `components/ReadingSettings.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  CONTROLS, DEFAULT_INDICES, stepsToVars,
  readStoredIndices, writeStoredIndices, clearStoredIndices,
  type PrefKey, type PrefIndices,
} from "@/lib/reading/prefs";

// Display order + end-cap glyphs (small→large / tight→loose). Labels double as
// each slider's accessible name.
const ROWS: { key: PrefKey; label: string; lo: string; hi: string }[] = [
  { key: "size",  label: "Size",   lo: "A",  hi: "A"  },
  { key: "line",  label: "Line",   lo: "A",  hi: "A"  },
  { key: "word",  label: "Word",   lo: "›‹", hi: "‹›" },
  { key: "block", label: "Blocks", lo: "▤", hi: "▤" },
  { key: "width", label: "Width",  lo: "├┤", hi: "┃ ┃" },
];

function applyVars(indices: PrefIndices) {
  const vars = stepsToVars(indices);
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value);
  }
}

export function ReadingSettings() {
  const [open, setOpen] = useState(false);
  const [indices, setIndices] = useState<PrefIndices>(DEFAULT_INDICES);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // The pre-paint script already applied stored prefs to the CSS vars; on mount
  // we only mirror them into slider positions.
  useEffect(() => {
    setIndices(readStoredIndices());
  }, []);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function setOne(key: PrefKey, value: number) {
    const next = { ...indices, [key]: value };
    setIndices(next);
    applyVars(next);
    writeStoredIndices(next);
  }

  function reset() {
    setIndices(DEFAULT_INDICES);
    applyVars(DEFAULT_INDICES);
    clearStoredIndices();
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        className="reading-aa"
        aria-label="Display settings"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Aa
      </button>

      {open && (
        <div className="aa-backdrop" onClick={close}>
          <div
            className="aa-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Display settings"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aa-head">
              <span className="aa-eyebrow">Display</span>
              <button className="glyph" aria-label="Close" onClick={close}>✕</button>
            </div>

            {ROWS.map(({ key, label, lo, hi }) => (
              <label key={key} className="aa-row">
                <span className="aa-label">{label}</span>
                <span className="aa-cap" aria-hidden="true">{lo}</span>
                <input
                  type="range"
                  min={0}
                  max={CONTROLS[key].steps.length - 1}
                  step={1}
                  value={indices[key]}
                  aria-label={label}
                  onChange={(e) => setOne(key, Number(e.target.value))}
                />
                <span className="aa-cap" aria-hidden="true">{hi}</span>
              </label>
            ))}

            <button className="link-btn" onClick={reset}>Reset to defaults</button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test reading-settings`
Expected: PASS (four cases).

- [ ] **Step 5: Mount it in the reading surface**

In `components/ReadingSurface.tsx`, import and render it inside the article, just after the title. Replace the article block:

```tsx
import { NodeSection } from "./NodeSection";
import { SelectionPopover } from "./SelectionPopover";
import { ReadingSettings } from "./ReadingSettings";
import type { TreeNode } from "@/lib/tree/build";

export function ReadingSurface({
  title,
  tree,
  canEdit,
  documentId,
}: {
  title: string;
  tree: TreeNode[];
  canEdit: boolean;
  documentId: string;
}) {
  return (
    <>
      <article id="reading-root" className="reading">
        <ReadingSettings />
        <h1 className="reading-title">{title}</h1>
        {tree.map((node) => (
          <NodeSection key={node.id} node={node} depth={0} canEdit={canEdit} documentId={documentId} />
        ))}
      </article>
      <SelectionPopover documentId={documentId} rootId="reading-root" />
    </>
  );
}
```

- [ ] **Step 6: Append the sheet styles**

At the end of `app/globals.css`, add:

```css
/* ── Reading preferences (Aa display sheet) ──────────────── */
/* Quiet trigger in the reading column's top-right corner, on the running-head. */
.reading-aa {
  position: absolute;
  top: 0;
  right: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--mono);
  font-size: 0.85rem;
  letter-spacing: 0.02em;
  color: var(--faint);
  padding: 0.1rem 0.3rem;
  transition: color 0.12s;
}
.reading-aa:hover,
.reading-aa:focus-visible { color: var(--ink); }

/* Light paper scrim — deliberately not a heavy dim, so font-size and column
   width changes stay visible in the prose behind the sheet as you drag. */
.aa-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(246, 243, 236, 0.55);
}
.aa-sheet {
  width: min(24rem, calc(100vw - 2rem));
  background: var(--paper);
  border: 1px solid var(--rule);
  box-shadow: 0 10px 34px rgba(28, 26, 21, 0.14);
  padding: 1.25rem 1.35rem 1rem;
}
.aa-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.aa-eyebrow {
  font-family: var(--mono);
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}
.aa-row {
  display: grid;
  grid-template-columns: 3.2rem 1.4rem 1fr 1.6rem;
  align-items: center;
  gap: 0.6rem;
  margin: 0.7rem 0;
}
.aa-label {
  font-family: var(--mono);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.aa-cap {
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--faint);
  text-align: center;
  line-height: 1;
}
.aa-row input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 2px;
  background: var(--rule);
  cursor: pointer;
}
.aa-row input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 50%;
  background: var(--muted);
  border: 1px solid var(--paper);
}
.aa-row input[type="range"]::-moz-range-thumb {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 50%;
  background: var(--muted);
  border: 1px solid var(--paper);
}
.aa-row input[type="range"]:focus-visible { outline: 1.5px solid var(--muted); outline-offset: 3px; }
.aa-sheet .link-btn { margin-top: 0.9rem; }
```

- [ ] **Step 7: Verify tests + build**

Run: `pnpm test reading-settings` → PASS. Then `pnpm build` → succeeds.

- [ ] **Step 8: Commit**

```bash
git add components/ReadingSettings.tsx components/__tests__/reading-settings.test.tsx components/ReadingSurface.tsx app/globals.css
git commit -m "feat(reading): Aa display sheet with five stepped preference sliders

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Pre-paint inline script (no flash of defaults)

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes (from Task 1): `preloadScript()`.
- Produces: nothing (integration wiring).

- [ ] **Step 1: Wire the script into the root layout**

In `app/layout.tsx`, import the helper and inject a `<head>` script that runs before body paint. Add the import near the top:

```tsx
import { preloadScript } from "@/lib/reading/prefs";
```

Then change the `tree` markup to include a `<head>` with the script:

```tsx
  const tree = (
    <html
      lang="en"
      className={`${serif.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        {/* Apply stored reading prefs to CSS vars before first paint (next-themes
            pattern) so a customized reader never flashes the defaults. */}
        <script dangerouslySetInnerHTML={{ __html: preloadScript() }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: build succeeds. `pnpm test` still green.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(reading): pre-paint script applies stored prefs before first paint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Browser verification + scale tuning

**Files:**
- Possibly modify: `lib/reading/prefs.ts` (step scale values only), `app/globals.css` (gutter/gap literals only).

**Interfaces:** none.

This is the visual-confirmation gate. No code is written blind — adjust only concrete numbers after seeing them.

- [ ] **Step 1: Run the dev server and open a document**

Run: `pnpm dev`, open a document at `/d/<id>` (seed/import one if needed).

- [ ] **Step 2: Confirm the two static fixes**

- The gap between each children group's connector line and the note pencils is visibly tighter than before.
- Sibling spacing is uniform: the gap between a parent's head and its first child equals the gap between two siblings, at both top level and nested levels.

- [ ] **Step 3: Exercise the Aa sheet**

- Click `Aa` (top-right of the reading column) → sheet opens over a light scrim; prose still legible behind it.
- Drag each of the five sliders; confirm the live effect (font size, line height, word spacing, block gap, column width). Width change is visible at the column edges even with the sheet open.
- `Reset to defaults` returns everything to the default look.
- Reload the page → your last settings persist with no flash of the default layout.
- `Esc` and backdrop-click both close the sheet; focus returns to the `Aa` button.

- [ ] **Step 4: Tune scales if needed**

If any step range feels wrong (e.g. block gap still too loose at default, or width max too narrow), adjust only the `steps` arrays in `CONTROLS` (`lib/reading/prefs.ts`) and/or the static gutter literal in `.node-children`. Re-run `pnpm test` (the default-index test asserts the *default* literals — if you change a default step value, update `stepsToVars`'s expected values in `prefs.test.ts` to match).

- [ ] **Step 5: Final gate + commit (only if step 4 changed anything)**

Run: `pnpm test` → PASS. `pnpm build` → succeeds.

```bash
git add lib/reading/prefs.ts lib/reading/__tests__/prefs.test.ts app/globals.css
git commit -m "style(reading): tune preference step scales after visual pass

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- CSS variable scheme (all five vars + defaults) → Task 2 ✓
- Column-width scoping to read view → Task 2 (`.page--read`) ✓
- Fix 1 (line↔pencil gap) → Task 2 step 3 ✓
- Fix 2 (block spacing uniformity + tighter default) → Task 2 step 3 ✓
- Display sheet: trigger, modal, five stepped sliders, icon end-caps, Reset → Task 3 ✓
- Light scrim for live preview → Task 3 step 6 (`.aa-backdrop` 0.55 alpha) ✓
- Focus return to trigger / Esc / backdrop close → Task 3 component + test ✓
- localStorage persistence + clamp on read → Task 1 ✓
- Pre-paint no-flash script, single source of truth → Task 1 (`preloadScript`) + Task 4 ✓
- Tests: `stepsToVars`, clamp, storage, component behaviors, build → Tasks 1, 3 ✓
- Visual tuning gate → Task 5 ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; the only "adjust later" is Task 5, which is an explicit human-in-the-loop tuning gate, not a code gap.

**Type consistency:** `PrefKey`, `PrefIndices`, `CONTROLS`, `DEFAULT_INDICES`, `stepsToVars`, `readStoredIndices`, `writeStoredIndices`, `clearStoredIndices`, `preloadScript`, `STORAGE_KEY` are defined once in Task 1 and consumed with identical names/signatures in Tasks 3 and 4. The component's `applyVars` helper is local to `ReadingSettings.tsx`. Slider accessible names ("Size"/"Line"/"Word"/"Blocks"/"Width") match between component `ROWS` and the tests.
