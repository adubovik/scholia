# Annotations & Threaded Comments

Status: **Approved** · Date: 2026-07-07

Two kinds of annotation, plus a shared threaded-comment mechanism.

## 1. Inline annotations (span-level)

Anchor: a **span** of the Source (character range).

- Rendered as a **bold pastel highlighter underline** (not a filled background).
- Highlighter palette: a small fixed set of pastel tones (yellow / pink / green /
  blue). Nothing outside black, white, and these pastels.
- Carries: an optional **note** (Markdown) and **freeform tags**.
- **Overlapping spans are allowed.** When spans overlap, the reader can still
  reach each underlying annotation (e.g. stacked underlines + a picker on click).
- **Collapsed by default.** The note is not shown until the reader clicks/taps
  the underlined span, at which point it expands **inline beneath the line**
  (terminal-style), not in a side panel.

## 2. Entity (node) annotations

Anchor: a whole **node** in the tree.

- **Hidden until hover** (desktop) or **tap on the node heading** (mobile).
- One note (Markdown) + tags per node.
- This is the "per-entity" mode from the original brief: comment on a chapter, a
  sub-argument, or any substructure you defined.

## 3. Threaded comments (forum-style)

Both inline and node annotations support **nested, forum-style reply threads**.

- Any signed-in participant (owner or collaborator) can reply.
- Replies nest (comment → reply → reply-to-reply), like a web forum.
- This is distinct from creating a new annotation: threads _discuss an existing
  annotation_; annotations _mark the text_.

## Tags

- Freeform, per annotation (inline or node).
- Intended to be filterable later (see search stretch goal in
  [roadmap](05-roadmap-and-scope.md)).

## Explicitly NOT in V1

- **Cross-linking annotations/nodes** ("this echoes §2.1"). Deferred — revisit if
  missed.
- Rich media in notes beyond Markdown.

## Authorship & visibility (shared docs)

- Every annotation and comment records its **author**.
- All collaborators' annotations are visible (a collaborative layer), but the set
  is **filterable by author**.
- Others' highlights carry a **subtle author marker** so "mine vs. theirs" is
  legible without clutter. (See [sharing](04-sharing-and-roles.md).)
