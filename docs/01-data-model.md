# Data Model & Ingestion

Status: **Approved** · Date: 2026-07-07

## The hybrid model

Three layers, deliberately decoupled: parallel **Sources** (translations), an
editable **Node tree** that aligns them, and the annotation overlays.

### 1. Sources — one or more parallel translations (immutable)

A document holds **one or more Sources**, each an imported text in a given
**language/translation** (e.g. Tractatus: German original + one or more English
translations). Each Source is stored verbatim and **never edited after import**,
and is split into **paragraphs** (the atomic addressable units). Inline
annotations anchor to **character offsets within a specific Source**.

Immutability is the load-bearing invariant: because a Source never changes,
offsets stay valid, and reorganizing structure can never corrupt the prose.

The first Source added is the **primary** (usually the original language);
further Sources are **added translations**. All Sources of a document share the
same Node tree — see below.

### 2. Node tree (editable overlay + translation backbone)

An editable tree of **nodes** ("entities"). The tree is **translation-agnostic**:
it is the alignment layer that unifies every Source. Each node:

- **maps to a range in _each_ Source** it exists in (a range =
  `{sourceId, paragraphId?, startOffset, endOffset}` or a whole-paragraph span).
  Alignment is **node-level**: the "same" node points at the corresponding
  passage in German, in English, etc.;
- can be **freely nested and reordered** without touching any Source;
- has an optional **label** (auto-derived from numbering when present, e.g.
  `1.2.1`) and **title**;
- may carry a **node-level annotation**, which is **shared across all
  translations** (see [annotations](02-annotations.md)).

For **Tractatus**, decimal numbering auto-aligns nodes across translations (the
`1.1` node maps to `1.1` in every Source). For prose without shared numbering,
the user maps each node's range per Source when adding a translation.

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

### Adding a translation

A translation is imported through the same four paths as **an additional Source**
attached to an existing document. Once added, each node is aligned to a range in
the new Source (auto-aligned by numbering for Tractatus; mapped by the user
otherwise). Existing node annotations immediately apply to the new translation;
inline annotations remain bound to whichever Source they were drawn on.

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
