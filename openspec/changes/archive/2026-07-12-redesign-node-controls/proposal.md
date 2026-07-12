## Why

The per-node controls in the reading view are app chrome dropped into a scholarly-edition world: a persistent pencil glyph (`✎`) sits in every node's margin at 0.45 opacity, and hovering it opens a floating 4-button popover of restructuring controls. The pencil reads as foreign next to the serif-on-parchment prose and mono sigla, it conflates three unrelated jobs (has-note indicator, add-note button, and hover-handle for the restructuring popover), and the popover's hover target is a narrow gutter column with dead space the pointer must cross. The result looks generated rather than designed, and the controls are awkward to reach.

## What Changes

- **BREAKING (UI):** Remove the always-visible note pencil (`✎`) and its opacity/hover states.
- **BREAKING (UI):** Remove the hover popover of restructuring buttons (`↑ ↓ ⇤ ⇥`) and the `.tree-controls` gutter cluster that hosts it.
- Add a **right-click / long-press context menu** on each node row offering *Move up*, *Move down*, *Outdent*, *Indent*, and *Add note* (label becomes *Edit note* when a note already exists). Reuses the existing `indentNode` / `outdentNode` / `moveNodeUp` / `moveNodeDown` server actions and `NodeNote` — no new mutation logic.
- Add a **quiet marginal marker (`¶`, `--muted` mono)** shown only when a node carries a whole-node annotation. It is both the has-note indicator and the reader: clicking it unfurls `NodeNote` inline (reuses the existing `noteOpen` state). The `¶` glyph also replaces `✎` wherever the note UI currently uses the pencil symbol.
- Add a **hover-only discoverability hint (`⋯`)** in the `.node-toggle-col` that opens the same context menu, for mouse users who don't try right-click.
- Add **keyboard shortcuts** on the engaged node: `Tab` / `Shift+Tab` to indent / outdent, `Alt+↑` / `Alt+↓` to move up / down.
- Constraint honored: the prose body is owned by the text-selection annotation gesture (`SelectionPopover` listens for `mouseup` across the reading root), so all new triggers live in chrome/margin or are non-spatial (right-click / keyboard) — never on the body text.

## Capabilities

### New Capabilities
- `node-controls`: how a reader/editor sees that a node is annotated, reads that annotation, and (as owner) restructures the tree and adds notes — via a marginal `¶` marker, a row context menu, a discoverability hint, and keyboard shortcuts, without placing chrome on the prose body.

### Modified Capabilities
<!-- None: there is no existing spec for the current pencil/popover UI. -->

## Impact

- **Components:** `components/NodeSection.tsx` (host the marker, menu trigger, hint, and keyboard handling), `components/TreeEditControls.tsx` (removed or fully replaced by the new menu component). Possibly a new `NodeContextMenu` component.
- **Styles:** `app/globals.css` — remove the `.tree-controls`, `.note-pencil`, and `.tree-controls-grid` rule blocks; add marker / menu / hint styles.
- **Server actions / data:** none — `lib/actions/tree.ts` and `NodeNote` are reused unchanged.
- **Dependencies:** adds **Radix UI** (`@radix-ui/react-context-menu` + `@radix-ui/react-dropdown-menu`) for the accessible menu — the first UI-primitive dependency in a previously lean app, chosen over hand-rolling per project preference (see design.md D1).
- **Accessibility:** the menu must ship keyboard navigation, `Escape` to close, focus return, click-outside, and touch long-press; the `¶` marker and `⋯` hint need adequate hit areas and labels.
- **Tests:** `components/__tests__/tree-edit-controls.test.tsx` will be replaced/updated to cover the new marker + menu behavior.
