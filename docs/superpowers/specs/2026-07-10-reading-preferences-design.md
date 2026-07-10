# Reading preferences ("Aa" display sheet) + layout tightening

**Date:** 2026-07-10
**Status:** Approved (design)

## Problem

Two layout complaints and one missing feature on the document read view
(`app/d/[docId]`):

1. **Line ↔ pencil gap.** The gutter between a children group's vertical
   connector line and the note pencil is too wide.
2. **Block spacing.** The vertical space between sibling text blocks is too
   large, and it is not uniform — nested groups add an extra top offset, so the
   first child of a group is spaced differently from the rest.
3. **No reader controls.** There is no way to adjust typography/layout. The user
   wants an Apple-Books-style "Aa" panel exposing five preferences:
   line spacing, word spacing, space between adjacent text blocks, column width,
   and font size — each a non-numerical, stepped slider.

## Approach

Drive every tunable value through **CSS custom properties** defined in `:root`.
A client "display sheet" rewrites those variables on `document.documentElement`
at runtime (one style recalc, no re-render of the tree) and persists the choice
to `localStorage`. Fixes (1) and (2) are static edits done at the same time.

Decisions (confirmed with user):
- **Persistence:** per-device `localStorage`. Not per-document, not synced to the
  DB. Chosen to avoid the `db:push` drift hazard and to apply before first paint.
- **Form factor:** centered modal sheet (not an anchored popover). Backdrop is a
  deliberately *light* paper-tint scrim so font-size / column-width changes stay
  visible behind the sheet as the user drags.

## The CSS variable scheme

Defaults declared in `:root` (`app/globals.css`), matching today's values except
`--reading-block-gap`, which is tightened:

| Variable | Default | Consumers |
|---|---|---|
| `--reading-font-size` | `1.1875rem` | `.reading-p`, `.node-preview` |
| `--reading-line-height` | `1.72` | `.reading-p`, `.node-preview` |
| `--reading-word-spacing` | `0em` | `.reading-p`, `.node-preview` (`word-spacing`) |
| `--reading-block-gap` | `1.15rem` | `.node` `margin-top` **and** `.node-children` `margin-top` |
| `--reading-measure` | `44rem` | reading column max-width |

Consumers are rewritten to `var(--reading-*, <current-literal>)` so the file is
still correct if the variable is ever absent.

**Column-width scoping.** `.page` is shared by Home, Import, and Read. Width must
change only on the read view, so the document page's `<main>` gets a dedicated
class (e.g. `page page--read`) whose `max-width: var(--reading-measure, 44rem)`.
Home and Import keep their fixed widths.

## Fix 1 — line ↔ pencil gap (static)

`.node-children` currently uses `padding-left: 2.05rem` (comment: `1.15rem base
indent + 0.9rem pulled back` for the connector geometry). Reduce the **base
indent** component from `1.15rem` to ~`0.5rem` (→ `padding-left: 1.4rem`),
pulling each child's content — and the pencil that hugs its left edge — toward
the connector line. The `-0.9rem` margin / connector maths is unchanged. Not a
slider; final value tuned by eye in the browser.

## Fix 2 — block spacing uniformity (via the token)

- `.node { margin-top: var(--reading-block-gap); }`
- `.node-children { margin-top: var(--reading-block-gap); }` (was `0.75rem`)
- `.node:first-child { margin-top: 0; }` unchanged.

Result: sibling→sibling gap and parent→first-child gap are identical at every
depth, and both track the slider. Default `1.15rem` is tighter than today's
`1.6rem`.

## The display sheet — `components/ReadingSettings.tsx` (client)

**Trigger.** A quiet `Aa` control (mono, `--faint`, hover→`--ink`) in the
top-right of the reading column, aligned with the running-head. Rendered from
`ReadingSurface` so it sits inside the reading article.

**Sheet.** A centered modal (native `<dialog>` or role="dialog" + backdrop),
titled `DISPLAY` (mono eyebrow), parchment card, hairline border — reuses
existing tokens (`--paper`, `--field`, `--rule`, `--muted`). Light scrim
(low-opacity paper tint). Dismiss on ✕, `Esc`, and backdrop click. Focus trapped
while open; focus returns to the `Aa` trigger on close.

**Five stepped sliders.** Native `<input type="range" min=0 max=N step=1>` per
control (accessible, keyboard-operable), styled to the palette, **no numeric
readout**, icon end-caps:

| Control | End caps | CSS effect |
|---|---|---|
| Size | `A` · `A` | `--reading-font-size` |
| Line | `A` · `A` (tight/loose) | `--reading-line-height` |
| Word | `›‹` · `‹›` | `--reading-word-spacing` |
| Blocks | `▤` · `▤` | `--reading-block-gap` |
| Width | `├┤` narrow · wide | `--reading-measure` |

State is a **step index** per control. A pure function `stepsToVars(indices)`
maps indices → `{ '--reading-font-size': '1.28rem', ... }` using fixed 5-step
scales (initial values below; final scales tuned in-browser):

- size: `[1.0, 1.09, 1.1875, 1.28, 1.4]` rem — default index 2
- line: `[1.4, 1.56, 1.72, 1.9, 2.1]` — default index 2
- word: `[0, 0.05, 0.1, 0.16, 0.24]` em — default index 0
- block: `[0.7, 0.9, 1.15, 1.5, 1.9]` rem — default index 2
- width: `[32, 38, 44, 52, 62]` rem — default index 2

**Reset.** A quiet `Reset to defaults` link at the foot restores all indices to
their defaults and clears the stored value.

## Persistence & no-flash

- Persist to `localStorage["scholia:reading-prefs"]` as
  `{ size, line, word, block, width }` step indices. Malformed / out-of-range
  values fall back to defaults (clamp on read).
- An **inline `<script>`** in `app/layout.tsx` (the next-themes pattern) reads
  the key and sets the CSS vars on `document.documentElement` synchronously
  before first paint, so a customized reader never flashes the defaults. The
  same `stepsToVars` scale must be available to that script (inline the scale
  constants, or serialize them into the script) — keep the scales in one module
  and reference them from both the script source and the component to avoid
  drift.

## Data flow

```
localStorage ──(inline script, pre-paint)──▶ documentElement CSS vars
      ▲                                              ▲
      │ persist on change                            │ apply on change
      └────────────── ReadingSettings (client) ──────┘
                          │ reads on mount to sync slider positions
```

## Testing

- **Pure:** `stepsToVars` — index → unit-string map; clamping of out-of-range /
  malformed stored indices.
- **Component** (`@testing-library/react` + jsdom, colocated in `__tests__/`):
  - opening the sheet renders five sliders;
  - moving a slider writes the matching `--reading-*` var to
    `document.documentElement.style` and persists indices to `localStorage`;
  - `Reset to defaults` restores default indices and clears storage;
  - `Esc` / backdrop close the sheet and restore focus to the trigger.
- **Build:** `pnpm build` (ES2017 tsc target — the gotcha in CLAUDE.md), then a
  browser pass to tune the step scales and confirm the two static fixes by eye.

## Scope guard (YAGNI)

Out of scope: per-document overrides, DB sync across devices, color/theme
controls, and any control beyond the five named. The line↔pencil gap is a static
fix, not a configurable slider.

## Files

- `app/globals.css` — declare `--reading-*` defaults; repoint consumers; static
  gap/spacing fixes; `.page--read` width scope.
- `app/d/[docId]/page.tsx` — add `page--read` class to `<main>`.
- `components/ReadingSurface.tsx` — mount the `Aa` trigger / sheet.
- `components/ReadingSettings.tsx` — new client component (trigger + modal).
- `lib/reading/prefs.ts` (or similar) — step scales + `stepsToVars` + storage
  key/read/clamp helpers (shared by component and inline script).
- `app/layout.tsx` — pre-paint inline script.
- `components/__tests__/reading-settings.test.tsx`,
  `lib/reading/__tests__/prefs.test.ts` — tests.
