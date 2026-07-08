# Scope, Device Matrix & Roadmap

Status: **Approved** · Date: 2026-07-07

## V1 scope (must-have)

- Import a text (paste / URL / file / numbered auto-parse) → immutable Source.
- Build & reorganize a **node tree** over the Source (manual + auto-parsed).
- Add **multiple translations** as parallel Sources, **node-aligned**, viewed
  **interleaved (stacked)** on the same surface.
- **Inline annotations**: highlighter underline + note (Markdown) + tags,
  overlapping allowed, collapsed by default.
- **Node (entity) annotations**: revealed on hover/tap.
- **Threaded forum-style comments** on both annotation kinds.
- **Single austere reading surface** with inline collapsible tree, select-popover
  + command-palette authoring.
- **Cloud accounts** (Google OAuth + email magic link), sync desktop↔mobile.
- **Async sharing** with owner / collaborator roles; author filtering.
- **Clone/fork** a shared document into your own workspace (copies Sources + tree,
  strips all annotations & threads; cloner gets full edit rights).

## Device matrix

| Capability | Desktop | Mobile |
|------------|:-------:|:------:|
| Read | ✓ | ✓ |
| Inline & node annotate | ✓ | ✓ |
| Threaded comment | ✓ | ✓ |
| Filter by author | ✓ | ✓ |
| View parallel translations (interleaved) | ✓ | ✓ |
| Clone a shared document | ✓ | ✓ |
| **Tree-building / restructure** | ✓ (primary) | — (not in V1) |
| **Add / align a translation** | ✓ (primary) | — (not in V1) |

## V1 stretch (nice-to-have, not blocking)

- **Lightweight in-document search** (`⌕`): full-text + tag filter within a doc.

## Deferred (explicitly out of V1)

- **Mini-map** tree overview.
- **Real-time co-editing** (presence, live cursors).
- **Cross-linking** annotations/nodes ("this echoes §2.1").
- **Export** (Markdown/PDF/annotations dump).
- Fine-grained roles beyond owner/collaborator; moderation.

## Guiding principles for cut decisions

- **YAGNI.** If a feature isn't needed to make the *personal* tool genuinely
  useful, it waits.
- **Protect the invariants** (immutable Source; tree edits never touch prose;
  clean-by-default reading state) over adding surface area.
- Keep the palette and chrome austere; resist feature-driven UI clutter.

## Source texts driving the design

- **Russell, _The Problems of Philosophy_** — manual tree over flat prose.
  <https://www.gutenberg.org/files/5827/5827-h/5827-h.htm>
- **Wittgenstein, _Tractatus Logico-Philosophicus_** — auto-parsed decimal tree.
