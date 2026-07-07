# TextAnnotator — Product Spec (V1)

Status: **Approved** · Date: 2026-07-07 · Owner: Anton

A personal-first, cloud-backed web app (desktop + mobile) for close-reading and
annotating texts, with async, signed-in sharing. The aesthetic is flat, austere,
and terminal-like: black/white plus pastel highlighter tones, outline/Unicode
glyphs only.

## Why this exists

To read demanding texts slowly and structurally. Two motivating sources define
the requirements:

- **Russell, _The Problems of Philosophy_** — flat prose. Structure (which
  paragraph justifies which) must be **imposed manually** into a tree.
- **Wittgenstein, _Tractatus Logico-Philosophicus_** — the tree is **already
  encoded** in the decimal numbering (`1`, `1.1`, `1.11`, `2` …). It should be
  **auto-parsed** into the tree on import.

These two archetypes — impose-structure vs. structure-already-present — are why
the tree feature is central rather than cosmetic.

## The one-sentence shape

> Import a text (immutable), organize it into an editable tree of nodes, layer
> **inline** and **per-node** annotations onto it, and optionally share it so
> signed-in collaborators add their own annotations and **forum-threaded**
> replies — all on a single, austere reading surface.

## Decision index

| Area | File |
|------|------|
| Data model (Source + Node tree, ingestion) | [01-data-model.md](01-data-model.md) |
| Annotations & threaded comments | [02-annotations.md](02-annotations.md) |
| Reading surface, tree display, interaction, visual language | [03-ux-and-interaction.md](03-ux-and-interaction.md) |
| Sharing, accounts, roles, permissions | [04-sharing-and-roles.md](04-sharing-and-roles.md) |
| Scope, device matrix, roadmap, deferred items | [05-roadmap-and-scope.md](05-roadmap-and-scope.md) |

## Core decisions at a glance

1. **Personal annotation first.** A solo tool must be fully useful before
   collaboration matters. Sharing is designed-for but phased.
2. **Async, signed-in collaboration** — threaded (forum-style) comments. **No**
   real-time co-editing in V1.
3. **Hybrid data model** — immutable Source + editable Node tree that references
   Source ranges. Restructuring never mutates the original prose.
4. **Two annotation kinds** — inline (span) and entity (whole node), both with
   threaded replies.
5. **Cloud accounts from day one** — data syncs desktop↔mobile; ready for
   sharing without a migration.
6. **Single reading surface** — no panes, no drawers, no toolbars. The tree is
   expressed *in* the document as nested collapsible sections; everything is
   reached by acting on the text.
7. **Monochrome + highlighter pastels**, flat/terminal-like, outline/Unicode
   icons.

## Non-negotiable invariants

- The **Source is immutable** once imported. All structure and annotation are
  overlays that reference Source ranges by offset.
- Reorganizing the **Node tree never alters Source text**.
- Inline highlights are **collapsed by default**; per-node notes are **hidden
  until hover/tap**. The default reading state is clean prose.
