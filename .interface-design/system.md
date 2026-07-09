# Scholia — Interface Design System

Close-reading & annotation app (product name = "scholia" = ancient marginal
commentary). This file records the decided design direction so future UI work
stays consistent. If a value is defined here, hold to it.

## Direction & feel

A **fine printed critical edition**: ink on warm parchment, hairline rules, a
mono "apparatus" for numbering and notes. Austere, calm, scholarly. The reader
is close-reading dense prose (Russell, Wittgenstein) and marking it like
marginalia. **Not** app-y, not sans, not bright. The **prose is always the
focal point**; everything else recedes to a quiet apparatus tier.

Austere invariant (from `docs/design/02-frontend-and-permissions.md`): black,
white, and the four highlighter pastels are the ONLY colors. No decorative
color, no gradients.

## Depth strategy — borders only

Hairline 1px rules; **no shadows, no border-radius** anywhere. Structure comes
from whitespace + tonal shift + rules, never elevation. This is a committed
constraint — do not introduce shadows or rounded corners. The one bordered
overlay (selection popover) uses a 1px `--muted` border, not a shadow.

## Spacing

Base unit **4px**. Reading rhythm: `1.6rem` between top-level nodes, `1.4rem`
between paragraphs, `0.75rem` inside note editors. Padding symmetrical. Page:
`max-width: 44rem`, `padding: 3rem 1.25rem` (reading measure ≈ 70ch at 19px —
wide enough to breathe, still readable).

## Color tokens (warm printed page)

```
--ink:    #1c1a15   /* primary text (prose)      */
--muted:  #6f6754   /* labels, numbering, chrome  */
--faint:  #b3a88f   /* running heads, leaf meta   */
--paper:  #f6f3ec   /* parchment background       */
--field:  #fbf9f4   /* inset control surface (inputs are slightly lighter here) */
--rule:   #e6dfce   /* warm hairline separators   */
--error:  #9b2c2c   /* rare accent: destructive   */
--hl-yellow #f2e6a8 · --hl-pink #f0cdd6 · --hl-green #cfe6c9 · --hl-blue #cdd9ee  /* the ONLY color; fixed by spec */
```
One hue family (warm neutral); shift lightness across ink→muted→faint→rule→paper.
Distribution ~60/30/10: parchment dominates, ink text, pastels are the scarce accent.

## Typography

- **Serif — Newsreader** (`--serif`, next/font, normal + italic): the reading
  body and document/list titles that are content. Wired in `app/layout.tsx`.
- **Mono — IBM Plex Mono** (`--mono`, weights 400/500): the "apparatus" —
  node numbering/labels, node titles, inline notes, tags, buttons, tabs,
  running-head title, error text.
- Three text tiers via **weight + color**, not size alone: `ink` (prose,
  focal) / `muted` (labels) / `faint` (running head, leaf meta).
- Reading body: **19px / 1.72**, `text-wrap: pretty`, `hanging-punctuation`.
- Numbers (node labels) use `font-variant-numeric: tabular-nums`.
- Fonts swap in one place (`app/layout.tsx`); alternatives if revisiting the
  serif: Source Serif 4 (neutral), Spectral (condensed/elegant), Literata (warm).

## Focal pattern

Reading surface leads with the prose. The **document title is demoted** to a
small tracked mono running-header (`0.7rem`, `--faint`, uppercase, hairline
under) — a printed-edition header, not a banner. This also absorbs ugly
imported boilerplate titles gracefully.

## Component patterns (values worth keeping)

- **Reading paragraph** (`.reading-p`) — serif `19px` · line-height `1.72` ·
  `1.4rem` bottom margin · `text-wrap: pretty`.
- **Running-head title** (`.reading-title`) — mono `0.7rem/500` · uppercase ·
  `0.16em` tracking · `--faint` · 1px `--rule` underline.
- **Node header** (`.node-head`) — rendered ONLY when structural (has children,
  label, or title); leaf prose nodes have no header chrome. Collapse glyph
  `▾/▸` carries `aria-expanded`. Label: mono `0.72rem` tabular `--muted`.
- **Restructure controls** (`.tree-controls`) — a compact **2×2 pad** (bordered
  paper chip, `0.95rem` glyphs) in the left gutter, anchored by its RIGHT edge
  (`right: 100%; margin-right: 0.6rem`) so it can never overlap the collapse
  triangle regardless of control count. `opacity 0` → revealed on `.node:hover`
  / `:focus-within`; hidden `<860px` (tree editing is desktop-only). Never
  reserve inline space. Grid order: row 1 = move ↑↓, row 2 = outdent/indent ⇤⇥.
- **Inline note** (`.inline-note`) — SIGNATURE: the left rule (`2px`) takes the
  annotation's highlighter color (`borderLeftColor: var(--hl-<color>)` inline),
  tying the marginal note to its span. Mono `0.82rem/1.55`, no card/shadow.
- **Note actions** — `.btn` (mono, uppercase, ink fill) for Save; `.link-btn`
  (mono, uppercase, muted→ink) for Edit/Cancel/Close; `.link-btn--danger`
  (→ `--error` on hover) for Delete.
- **Recolor swatches** (`.swatch`) — `1.15rem` square · 1px `rgba(28,26,21,.15)`
  border · `scale(1.12)` on hover · `.swatch--active` = 1.5px `--ink` outline
  marking the current color (also `aria-pressed`).
- **Selection popover** (`.selection-popover`) — 4 swatches, `--paper` fill,
  1px `--muted` border, no shadow.
- **Buttons** (`.btn`) — mono `0.72rem` · uppercase · `0.08em` tracking · ink
  fill · `translateY(0.5px)` on `:active`.

## Motion

Minimal, ≤120ms color/opacity transitions on hover/reveal only. No entrance
animation on the reading surface (repeated close-reading — motion would nag).

## Checks to re-run when editing UI here

- **Swap test:** replace Newsreader with a system sans — the scholarly feel
  must collapse. If nothing changes, type isn't doing its job.
- **Squint test:** prose blocks lead; title + apparatus recede; no harsh lines.
- **Token test:** variable names evoke printed page / ink / highlighter, not a
  generic template.
