# Reading Surface, Interaction & Visual Language

Status: **Approved** · Date: 2026-07-07

## Principle: the reading surface *is* the app

One scrollable column. **No side panes, no drawers, no persistent toolbars.**
Everything is reached by acting on the text itself. The default state is clean
prose; structure and annotation reveal themselves on demand.

## Tree display: nested collapsible sections

The tree is **not** a sidebar. It is expressed *in* the document:

- Nodes are **indented** to show nesting.
- Each node has a discreet **`▾` / `▸`** glyph to expand/collapse.
- Nodes are **numbered when the source is numbered** (Tractatus `1.2.1`),
  auto-labeled otherwise.
- Navigation = scrolling + collapsing. (A mini-map overview is **post-V1**.)

```
1 ▾ APPEARANCE AND REALITY                          ⊙
     Is there any knowledge in the world so certain
     that no reasonable man could doubt it?  This
     ‾‾‾‾‾‾‾‾‾‾‾‾‾‾  (yellow: inline note, collapsed)
     question, which at first sight might not seem
     difficult, is really one of the most difficult.

     └ ▸ 1.1  In daily life we assume as certain many
              things which, on closer scrutiny, are
              ‾‾‾‾‾ (pink)  found full of contradictions.
```

## Parallel translations (interleaved)

When more than one translation is shown, each node renders its Sources **stacked
(interleaved)** — original above, translation(s) below, separated by a thin rule —
on **every device**. One layout everywhere, very terminal-like. The node tree and
its numbering are shared; only the prose repeats per translation.

```
1 ▾ ...
   Die Welt ist alles, was der Fall ist.
   ─
   The world is all that is the case.

1.1 ▾ ...
   Die Welt ist die Gesamtheit der Tatsachen ...
   ─
   The world is the totality of facts ...
```

- Which translations are visible is a per-reader toggle (via the command palette
  / a small control), defaulting to the primary Source.
- **Inline** highlighter underlines appear only on the translation they belong to.
  **Node** notes attach to the node and show once regardless of translation.

## Reveal states (default = clean)

| Element | Default | Reveal on |
|---------|---------|-----------|
| Inline note | collapsed (only the underline shows) | click/tap the underlined span → expands inline beneath the line |
| Node (entity) note | hidden | hover node (desktop) / tap heading (mobile) |
| Child nodes | may be collapsed | click `▸` |

## Authoring (both discoverable and keyboard-driven)

No toolbars, so two complementary paths:

1. **Select → tiny B&W popover.** Selecting text raises a minimal, flat popover:
   highlighter color, note, tags. Mouse- and touch-friendly; discoverable.
2. **Command palette + hotkeys.** A `⌘K` / `:` palette runs every action —
   annotate, add-child, move-node, filter-by-author, jump-to-node. Fits the
   terminal aesthetic and enables fast structuring.

Tree edits (add child, move node) are triggered from a **gutter `⊕` / handle**
that appears on hover, and from the palette.

## Visual language

- **Palette:** black, white, and pastel highlighter tones — nothing else.
- **Flat & austere / terminal-like:** no shadows, no rounded "card soup", minimal
  borders, generous whitespace, monospace-adjacent restraint.
- **Icons:** outline/contour only, or plain B&W Unicode glyphs
  (`▾ ▸ ⊙ ⊕ ¶ ⌘ ⌕`).
- Typography carries the hierarchy; color is reserved almost entirely for
  highlighter underlines.

## Device behavior

- **Mobile:** full read / annotate / comment. Hover interactions map to tap.
- **Desktop:** everything, and the primary place for **tree-building**
  (drag/restructure), which is awkward on touch.

See [roadmap](05-roadmap-and-scope.md) for the device matrix and deferrals.
