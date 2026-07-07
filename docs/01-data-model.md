# Data Model & Ingestion

Status: **Approved** · Date: 2026-07-07

## The hybrid model

Two separate layers, deliberately decoupled:

### 1. Source (immutable)

The imported text, stored verbatim and never edited after import. On import it is
split into **paragraphs** (the atomic addressable units). Every annotation and
every node ultimately anchors to **character offsets within the Source**.

Immutability is the load-bearing invariant: because the Source never changes,
offsets stay valid, and reorganizing structure can never corrupt the prose.

### 2. Node tree (editable overlay)

An editable tree of **nodes** ("entities"). Each node:

- **maps to one or more Source ranges** (a range = `{paragraphId?, startOffset,
  endOffset}` or a whole-paragraph span);
- can be **freely nested and reordered** without touching the Source;
- has an optional **label** (auto-derived from numbering when present, e.g.
  `1.2.1`) and **title**;
- may carry a **node-level annotation** (see [annotations](02-annotations.md)).

Default top-level nodes = **chapters**. The user adds sub-nodes to express
argument structure (e.g. a paragraph that _justifies_ a prior claim becomes its
child).

> Design note: a node references ranges rather than owning copied text. "Moving a
> paragraph to be a child of another" reorders **references**, not prose. This is
> what keeps Russell's original intact while letting you impose arbitrary
> structure.

## Ingestion paths (all four supported)

1. **Paste plain text / Markdown** — split into paragraphs automatically.
2. **Import from URL** — fetch a Gutenberg-style HTML page, strip markup to clean
   paragraphs.
3. **Upload file** — `.txt`, `.md`, `.html`.
4. **Auto-parse numbered structure** — detect decimal/outline numbering
   (Tractatus: `1`, `1.1`, `1.11`) and **build the node tree automatically** on
   import, with `label` set from the detected numbers.

Auto-parse and manual structuring coexist: an auto-parsed tree remains fully
editable afterward.

## Persistence

- **Cloud account from day one.** Documents, tree, and annotations live server-side
  and sync across desktop and mobile.
- This avoids a painful local→cloud migration when sharing arrives, and makes
  multi-device the default rather than an afterthought.

## Open implementation questions (defer to the plan, not decided here)

- Exact offset-anchoring strategy that survives whitespace/normalization on
  import (e.g. store normalized Source + a mapping).
- Whether ranges are stored per-paragraph or as global Source offsets.
- Conflict/versioning model once multiple collaborators annotate concurrently
  (async, so last-write-wins per-annotation is likely sufficient — confirm in
  plan).
