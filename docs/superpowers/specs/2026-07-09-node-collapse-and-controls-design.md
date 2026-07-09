# Node collapse + gutter controls redesign

**Date:** 2026-07-09
**Status:** Approved design

## Summary

Three UI changes to the reading surface node tree:

1. Make every node collapsible (including top-level prose nodes). Collapsing a node
   with text shows only its first sentence + `…`; collapsing hides children.
2. Move the collapse triangle to the left of the node's text and enlarge it.
3. Replace the always-on black/white node-annotation dot with a `✎` pencil grouped
   into the restructuring-controls cluster, emphasized when a note exists.

## Motivation

The current collapse toggle only appears on nodes with children and only hides
children — the node's own prose always stays. The triangle (`0.72rem`, shared faint
`.glyph` style) is barely noticeable. The node-annotation dot sits in an
out-of-the-way gutter slot separate from the other node controls.

## Requirement 1 — Unified collapse

- The existing `collapsed` state in `NodeSection` now governs both the node's own
  text rendering **and** its children.
- The toggle is shown whenever `hasChildren || node.text` (so top-level prose nodes
  get it too).
- **Collapsed, node has own text:** render a plain preview — `firstSentence(text)`
  followed by `…` when content is actually hidden — as a clickable element. Clicking
  the preview OR the triangle expands. `SourcePassage` is not rendered while
  collapsed, so inline annotations are disabled (explicitly allowed).
- **Collapsed, no own text (pure container):** hide children only; no preview.
- **Expanded:** unchanged — full `SourcePassage` + children.

### `firstSentence` helper

- New pure function in `lib/tree/` (e.g. `lib/tree/firstSentence.ts`), unit-tested.
- Returns the text up to and including the first `.`, `!`, or `?` that is followed by
  whitespace or end-of-string. Falls back to the whole string when no boundary found.
- The caller appends `…` only when hidden content exists (first sentence shorter than
  full text, or the node has children).

## Requirement 2 — Triangle moved left + enlarged

- `.node` becomes a flex row: a fixed-width **toggle column** + the node body.
- The toggle column holds the `▸/▾` button for collapsible nodes, or an empty spacer
  of equal width for non-collapsible nodes so prose left-edges stay aligned.
- Triangle gets its own class (not the shared faint `.glyph`), sized ~`1rem`, clearly
  visible; hover darkens it.
- Absolutely-positioned gutter controls remain further left in the margin. Visual
  order left→right: `[controls cluster] [▸] [text]`.

## Requirement 3 — `✎` into the controls cluster

- Delete `components/NodeAnnotationMarker.tsx` and the `.node-note-dot*` CSS.
- `TreeEditControls` is always mounted (no longer `canEdit`-gated in `NodeSection`)
  and receives `hasNote: boolean` and `onOpenNote: () => void`.
- It renders:
  - **`✎`** — always present; faint by default, appears on hover, dark/emphasized
    when `hasNote`; opens the note. Available to viewers (not `canEdit`-gated).
  - **`↑ ↓ ⇤ ⇥`** grid — only when `canEdit`, hover-revealed as today.
- The `.tree-controls` container stays at `opacity: 1`; only the move/indent grid
  fades in on hover. (CSS opacity compounds, so the persistent `✎` cannot live inside
  an `opacity: 0` box.)
- **Mobile (<860px):** keep `✎` visible so note viewing stays reachable; only the
  move/indent grid is hidden.

## Components touched

- `components/NodeSection.tsx` — flex layout, unified collapse, collapsed preview,
  always-mount controls, drop marker.
- `components/TreeEditControls.tsx` — add `✎` + note props; split persistent vs
  hover-revealed controls.
- `components/NodeAnnotationMarker.tsx` — deleted.
- `lib/tree/firstSentence.ts` — new helper.
- `app/globals.css` — flex `.node`, enlarged toggle class, controls container tweaks,
  remove `.node-note-dot*`, mobile rule adjustment.

## Testing

- Unit-test `firstSentence` (multiple boundaries, no boundary, trailing punctuation,
  whitespace handling).
- Extend component tests: toggle present on a text-only node; collapsed node renders
  the first-sentence preview and omits `SourcePassage`; clicking preview expands;
  `✎` carries the emphasized/`--set` state when `hasNote`; move/indent grid still
  editor-only.
- Single final green run (no RED-first, per project workflow).
