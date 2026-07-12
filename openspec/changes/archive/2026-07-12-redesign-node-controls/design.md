## Context

The reading view renders a tree of nodes (`components/NodeSection.tsx`). Today each node row is a flex layout of three columns: a `.tree-controls` gutter (holding a `✎` pencil and a hover-revealed 4-button restructuring popover), a `.node-toggle-col` (collapse triangle), and the node body. The pencil is styled at `opacity: 0.45` and does triple duty: has-note indicator, add-note button, and the hover-handle that reveals the restructuring popover.

Two hard constraints shape any redesign:

1. **The prose body is owned by text-selection.** `components/SelectionPopover.tsx` listens for `mouseup` across the entire reading root and maps the DOM range to source offsets for inline annotation. Selecting/clicking prose is the core product gesture, so node-level triggers cannot live on the body.
2. **Node chrome is inconsistent across node shapes.** `showHead` is false for leaf prose nodes, so many nodes have no siglum/title; only `.node-toggle-col` is structurally present on every node (and even its triangle is absent on childless headings). So any per-node affordance keyed to content (the siglum) fails on exactly the nodes that lack it.

The existing server actions (`indentNode`, `outdentNode`, `moveNodeUp`, `moveNodeDown` in `lib/actions/tree.ts`) and the inline note view (`components/NodeNote.tsx`, driven by `noteOpen` in `NodeSection`) are correct and stay. This change is presentation-only.

## Goals / Non-Goals

**Goals:**
- Remove the pencil and the hover popover; the reading view carries no per-node chrome for un-annotated nodes.
- A `¶` marginal marker that is both the has-note indicator and the click-to-read affordance, uniform across all node shapes.
- A right-click / long-press context menu carrying the restructuring + note actions, plus a `⋯` hover hint that opens the same menu for pointer users.
- Keyboard shortcuts (`Tab`/`Shift+Tab`, `Alt+↑`/`Alt+↓`) on the engaged node.
- Keep all triggers off the prose body.

**Non-Goals:**
- No drag-and-drop reordering/reparenting (that touches the `node_source_ranges` model — separate, larger work, overlaps M4/M5).
- No always-visible "marginalia" note rendering; notes stay reveal-on-demand (deliberately deferred; the marker leaves the door open to promote later).
- No changes to server actions, the tree data model, or `NodeNote`'s internals.
- No new "selected node" persistent global state beyond what's needed to route a keyboard shortcut to the node whose menu is open / that is focused.

## Decisions

### D1: Context-menu primitive — Radix UI (third-party, not hand-rolled)

The menu's accessibility contract (roving-focus keyboard nav, `Escape`, focus return, click-outside, touch long-press, correct ARIA roles, collision-aware positioning) is exactly the kind of behavior that is expensive and error-prone to hand-roll and that a battle-tested primitive ships for free. Per project preference, use a third-party dependency rather than building this in-house.

**Decision:** add **Radix UI** and compose the menu from `@radix-ui/react-context-menu` for the right-click / long-press trigger on the node row (Radix `ContextMenu` handles touch long-press and keyboard natively) and `@radix-ui/react-dropdown-menu` for the `⋯` hint's click-to-open, both rendering a single shared set of menu items. Style the unstyled Radix primitives to the parchment/mono direction via `app/globals.css`. `NodeNote` and the four server actions remain the action handlers wired into the menu items.

**Alternatives considered:**
- *Hand-roll a minimal menu (consistent with `SelectionPopover`)* — rejected per the project preference for third-party deps over in-house UI behavior; it would also re-own the entire a11y contract.
- *React Aria / Ark / Headless UI* — equivalent primitives; Radix chosen for its first-class separate `ContextMenu` (right-click/long-press) and `DropdownMenu` (button-anchored) primitives that map cleanly onto the two triggers here. Fine to substitute if the team already leans another library.

Note: this adds the first UI-primitive dependency to a previously lean app — an intentional trade of a dependency for correct, maintained accessibility.

### D2: Trigger surfaces — right-click + long-press + `⋯` hint, never the body

Right-click (`onContextMenu`, `preventDefault`) on the node row and touch long-press (pointer-down timer, cancelled on move/up) open the menu at the pointer. The `⋯` hint lives in `.node-toggle-col` (the one always-present column), revealed on `.node:hover`, and opens the same menu anchored to itself. The row handler must ignore events that originate inside the prose body when a text selection is in progress, so text-selection → inline annotation is never hijacked.

**Alternatives considered:** a persistent selection grip in the margin (the earlier "A′") — rejected in exploration because it reintroduces standing chrome; the menu keeps the reading view clean.

### D3: `¶` marker as indicator + reader; `¶` replaces `✎` everywhere

The marker renders only when `node.nodeAnnotation !== null`. It sits in the left margin (reusing the freed gutter slot) as muted mono `¶`, is a real `<button>` with an accessible label, and toggles the existing `noteOpen` state. The `✎` character is replaced by `¶` in the note UI/menu copy as well, so the pencil symbol disappears from the product entirely. To avoid confusion with the `.node-children` connector (a `--rule` left border), the marker uses `--muted` and sits at the node's top-left rather than as a full-height rule.

### D4: Keyboard shortcuts scoped to the focused hint, with non-clashing bindings

Shortcuts fire only while a node's `⋯` hint control is focused (the "engaged" signal) and only for editors (the hint renders only when `canEdit`). This keeps normal `Tab` focus traversal untouched everywhere else — no global key interception. Bindings avoid browser conflicts (the earlier `Tab`/`Shift+Tab` traps focus; `Alt+←/→` collides with back/forward):

- `Alt+↑` / `Alt+↓` → move up / down (VS Code's move-line convention).
- `Alt+]` / `Alt+[` → indent / outdent (mnemonic; no browser nav binding). Matched by `event.code` (`BracketRight`/`BracketLeft`) so macOS Option-key character composition (`'“'`/`'‘'`) doesn't mask them.

The handler calls `preventDefault()`, which both suppresses any default and — via Radix's composed-handler skip-when-defaultPrevented — stops the Dropdown's own Arrow-to-open. All call the same server actions as the menu.

### D5: Menu styling matches the Display settings sheet (`.aa-sheet`)

The context menu / dropdown SHALL reuse the visual vocabulary already established by the Display settings window (`components/ReadingSettings.tsx` → `.aa-sheet`/`.aa-head`/`.aa-eyebrow` in `app/globals.css`), so the new surface feels native to the product rather than like a stock Radix menu:

- **Surface:** `background: var(--paper)`; `border: 1px solid var(--rule)`; soft shadow `0 10px 34px rgba(28, 26, 21, 0.14)`; **no border-radius** (the sheet is square-cornered); comfortable padding (sheet uses ~`0.5rem`–`0.6rem` rhythm — tighten for menu items).
- **Item type:** mono (`var(--mono)`), small (~`0.66rem`), uppercase with `letter-spacing: ~0.08em`, color `var(--muted)` → `var(--ink)` on hover/highlight (mirrors `.aa-label` + `.link-btn:hover`). The destructive/remove path (e.g. delete note) uses `var(--error)` on hover, matching `.link-btn--danger`.
- **Optional header:** an `.aa-eyebrow`-style mono uppercase label (`--muted`, `letter-spacing: 0.18em`) if the menu warrants a title; likely omitted for a 5-item menu.
- Style Radix's unstyled parts to these tokens; do **not** pull in Radix's default theme/CSS. Radix highlight state (`[data-highlighted]`) maps to the `--muted`→`--ink` hover treatment so keyboard and pointer highlight look identical.

## Risks / Trade-offs

- **New dependency footprint** → mitigation: Radix primitives are tree-shakeable per-package (`react-context-menu`, `react-dropdown-menu` only); accept the cost in exchange for a maintained a11y contract. Cover the menu behavior in the component test that replaces `tree-edit-controls.test.tsx`.
- **`Tab` interception harming keyboard traversal** → mitigation: intercept `Tab` only while a node is actively engaged for editing; never globally. Verify tabbing through the document is unaffected when nothing is engaged.
- **Long-press vs. native touch behaviors / text selection on touch** → mitigation: use a pointer-down timer cancelled on move; scope to node chrome so it doesn't fight body text selection.
- **Discoverability of right-click** → mitigation: the `⋯` hover hint is the visible door; right-click and keyboard are enhancements, not the only path.
- **Losing the "has-note" signal for collapsed nodes** → the `¶` marker is positional and present whenever an annotation exists, independent of collapse state, so the signal survives (the old ink-pencil was the only prior signal).

## Migration Plan

Presentation-only, no data or schema change; deploys via the normal Vercel push to `development`. Rollback is a straight revert of the component/CSS diff — server actions and the note model are untouched, so there is nothing stateful to unwind.

## Open Questions

- Exact keyboard-engagement model: is a node "engaged" purely while its menu is open, or should a node also be independently focusable (roving `tabindex`) so shortcuts work without opening the menu first? Leaning menu-open-plus-focusable-marker; confirm during build.
- Whether the `⋯` hint should also appear on touch (where there's no hover) or rely solely on long-press there.
