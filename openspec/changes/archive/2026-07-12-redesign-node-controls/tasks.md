## 1. Dependencies & scaffolding

- [x] 1.1 Add `@radix-ui/react-context-menu` and `@radix-ui/react-dropdown-menu` to `package.json` and install (pnpm).
- [x] 1.2 Create a shared `NodeMenuItems` fragment (the five items: Move up, Move down, Outdent, Indent, note action) that both the context menu and dropdown render, wired to `indentNode`/`outdentNode`/`moveNodeUp`/`moveNodeDown` and the note-open handler; restructuring items render only when `canEdit`.

## 2. Context menu on the node row

- [x] 2.1 Wrap the node row in a Radix `ContextMenu` (right-click / long-press trigger) rendering `NodeMenuItems`; ensure the trigger does not fire when a prose text selection is active (keep `SelectionPopover` intact).
- [x] 2.2 Add the `⋯` discoverability hint in `.node-toggle-col`, revealed on `.node:hover`, as a Radix `DropdownMenu` trigger rendering the same `NodeMenuItems`.
- [x] 2.3 Set the note action label to "Add note" when `node.nodeAnnotation === null`, else "Edit note"; selecting it opens the inline `NodeNote` (`noteOpen`).

## 3. Marginal note marker

- [x] 3.1 Render the `¶` marker (muted mono `<button>`, accessible label) in the node's left margin only when `node.nodeAnnotation !== null`; clicking toggles `noteOpen` (reader). Distinguish visually from the `.node-children` connector.
- [x] 3.2 Replace `✎` with `¶` in the note UI. Home doc-list: note-count now `¶`, node-count re-glyphed to `§` to avoid the `¶` clash.

## 4. Keyboard shortcuts

- [x] 4.1 Editor keyboard shortcuts on the focused ⋯ hint (canEdit-only): Alt+↑/↓ move, Alt+]/Alt+[ indent/outdent (non-clashing; brackets keyed off event.code). preventDefault also blocks Radix Arrow-to-open.

## 5. Remove old UI

- [x] 5.1 Delete/replace `components/TreeEditControls.tsx` (pencil + hover popover) and its usage in `NodeSection.tsx`.
- [x] 5.2 Remove the `.tree-controls`, `.note-pencil`, and `.tree-controls-grid` rule blocks from `app/globals.css`; add marker / menu / hint styles.
- [x] 5.3 Style the Radix menu to match the Display settings sheet (`.aa-sheet`): `--paper` surface, `1px --rule` border, `0 10px 34px rgba(28,26,21,0.14)` shadow, square corners; items in mono ~`0.66rem` uppercase, `--muted`→`--ink` on hover/`[data-highlighted]`, destructive item `--error` on hover. Do not import Radix default theme CSS.

## 6. Tests & verification

- [x] 6.1 Replace/update `components/__tests__/tree-edit-controls.test.tsx` to cover: marker shows only when a note exists and toggles `NodeNote`; menu offers the correct items and labels; restructuring items hidden for non-editors; menu closes on Escape/outside-click.
- [x] 6.2 Verify text selection in the body still triggers `SelectionPopover` (node menu does not hijack it).
- [x] 6.3 Run `pnpm lint`, `pnpm test`, and `pnpm build` (build catches the ES2017 tsc-target issues Vitest won't); check the reading view at desktop and mobile widths.
