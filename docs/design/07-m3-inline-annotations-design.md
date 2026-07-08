# M3 — Inline Annotations (design / spec)

Status: **Approved** · Date: 2026-07-08

Expands the M3 outline in [`03-implementation-plan.md`](03-implementation-plan.md)
into an execution-ready design. Builds on M2 (Tree). The task-by-task plan is
produced separately from this spec.

## Goal

Let the document owner **mark spans of the source text**: drag-select a phrase,
pick one of four pastel highlighter colors (saved instantly), then optionally
click the underline to attach a Markdown **note** and freeform **tags**.
Highlights render as bold pastel underlines beneath the reading text; the note is
**collapsed by default** and expands inline beneath the line (terminal-style) on
click. Overlapping highlights are first-class: they stack as layered underlines
and a small picker disambiguates a click. Prose is never touched — offsets index
into the immutable `sources.text`, so annotations survive any later tree
restructure.

## Scope (and explicit cuts)

**In:**
- `inline_annotations` schema (span-level, bound to one source).
- Span-splitting renderer with **overlap** support (stacked underlines + picker).
- `SelectionPopover`: DOM Selection → source offsets → color swatch → create.
- `InlineNote`: collapsed note that expands beneath the line; Markdown-rendered
  view + owner editor (note / tags / recolor / delete).
- Server Actions: create / update / delete an inline annotation, gated so a user
  edits/deletes only **their own**.
- Markdown note rendering via `react-markdown` + `remark-gfm`.

**Out (deliberate cuts for M3):**
- **Node (entity) annotations** — moved to their own follow-up milestone (M3.5).
- **Threaded comments** — M5.
- **Author markers & author filter** — M5 (M3 is single-user; the only author is
  the owner, so "mine vs. theirs" does not yet exist).
- **Multi-translation scoping** — M4. M3 annotates the single primary source
  only, the same coupling [`getDocument`](../../lib/data/documents.ts) already
  documents for ranges.
- **Cross-node highlights** — a selection is **restricted to a single node**
  (see Interaction). Relaxable later without schema change.

## Data layer

New table, exactly per [`01-data-schema.md`](01-data-schema.md):

### `inline_annotations`
- `id uuid pk`
- `document_id uuid → documents.id` (cascade)
- `source_id uuid → sources.id` (cascade) — which translation the span lives in.
- `author_id text → users.id`
- `start_offset int not null`, `end_offset int not null` — offsets into the
  immutable `sources.text` (half-open `[start, end)`, matching `node_source_ranges`).
- `color text not null` — app-checked enum `yellow | pink | green | blue`.
- `note text null` — Markdown; null until the reader adds one.
- `tags text[] not null default '{}'`
- `created_at`, `updated_at`
- **No range-exclusion constraint** — overlaps are allowed by design.

Indexes: `(source_id)`, GIN on `tags`, `(document_id, author_id)` (author filter
is M5, but the index is cheap and additive now). Migrated with `pnpm db:push`.

**Immutability invariant unchanged:** annotations reference `sources.text`
offsets; nothing updates `sources.text`.

## The offset model (the crux)

Offsets are stored against `sources.text`, **not** the node's text slice. A node's
rendered text is `sources.text.slice(startOffset, endOffset)`; an annotation drawn
inside it must be rebased twice: DOM range → offset-within-node → absolute offset
(add the node's `startOffset`). Anchoring to the immutable full-source string means
a highlight stays put even if the node is later indented/outdented/moved.

Two pure, independently testable helpers carry the mapping:

### `lib/annotations/offsets.ts` → `rangeToOffsets(range, root): {sourceId, startOffset, endOffset} | null`
Walks the Range's start/end containers up to the nearest
`[data-source-id][data-char-start]` ancestor, adds the Range's local offset to
`data-char-start`, and returns absolute source offsets. Returns `null` when the
selection is collapsed, lands outside any source run, **or its endpoints resolve
to two different nodes** (single-node restriction). Tested under jsdom.

### `lib/annotations/spans.ts` → `splitSpans(nodeText, nodeStart, annotations): Segment[]`
Pure overlap engine. Clamps each annotation to the node's
`[nodeStart, nodeStart + nodeText.length)` range, collects the boundary points,
and emits ordered, non-overlapping `Segment`s:
```ts
interface Segment {
  text: string;
  charStart: number;              // absolute offset into sources.text
  annotations: { id: string; color: Color }[]; // [] for bare text
}
```
Unit-tested: no annotations (single bare segment), adjacent, nested, partially
overlapping, boundary-touching, and clamp-to-node-range cases.

## Reading pipeline changes

- `TreeNode` (in [`lib/tree/build.ts`](../../lib/tree/build.ts)) gains
  `sourceId: string` and `startOffset: number` (absolute). `buildTree` already has
  the range's `startOffset` in hand (it currently uses it only to slice), so this
  is a minimal, mechanical extension.
- `getDocument` selects the primary source's `inline_annotations` and attaches to
  each `TreeNode` an `annotations` list filtered to those intersecting the node's
  range. (Filtering server-side keeps each `SourcePassage` O(its own spans) rather
  than passing the whole document's annotations to every node.)

## Rendering

`SourcePassage` becomes span-splitting. It calls `splitSpans(node.text,
node.startOffset, node.annotations)` and renders each `Segment` as a `<span>`
carrying `data-source-id` and `data-char-start` — **including bare-text
segments**, so selection mapping works anywhere in the passage.

- A segment with ≥1 annotation renders `border-bottom: 2px solid var(--hl-<top>)`
  where `<top>` is the most recently created covering annotation; each additional
  overlapping color adds a stacked `box-shadow` underline a few px lower (verbatim
  from [`02-frontend-and-permissions.md`](02-frontend-and-permissions.md)). No new
  colors, shadows-as-decoration, or radii — palette rules hold.

## Interaction (client islands)

### `SelectionPopover` (one global instance in the reading surface)
Rationale: `window.getSelection()` is a singular, document-level primitive; one
listener matches its grain and avoids per-span ownership arbitration. On a
completed, non-collapsed selection it calls `rangeToOffsets`; if that returns a
valid single-node range it positions a small floating row of four color swatches
via `range.getBoundingClientRect()`. Clicking a swatch calls
`createInlineAnnotation` and collapses the selection. Selections that are
collapsed, outside a source run, or cross a node boundary produce **no** popover.

### `InlineNote` (local to the segment/passage that owns the annotation)
Clicking a highlighted span expands the note **beneath the line** (terminal-style,
not a side panel):
- **View:** `react-markdown`-rendered note + tag chips.
- **Owner editor:** note `textarea` (Markdown), tag add/remove, the four color
  swatches to recolor, and delete. Save/delete call Server Actions.
- **Overlap:** a segment covered by **>1** annotation first shows a tiny picker
  listing the overlapping annotations; choosing one opens its `InlineNote`.

"Which note is open" is local component state — the natural place for it, since it
belongs to a specific rendered span (contrast the create flow, which is global).

## Server Actions — `lib/actions/annotations.ts`

- `createInlineAnnotation({ documentId, sourceId, startOffset, endOffset, color })`
- `updateInlineAnnotation({ id, note?, tags?, color? })`
- `deleteInlineAnnotation({ id })`

Validation: `color` must be one of the four enum values; `startOffset < endOffset`.
All actions `revalidatePath('/d/[docId]')`.

### Authorization
A thin `authorizeAnnotation` alongside the existing
[`authorize`](../../lib/auth/authorize.ts):
- **create** requires document read access — today that is the owner (reuses
  `authorize`); M5 widens this to collaborators.
- **edit / delete** additionally require `annotation.authorId === userId`.

This is the M3 slice of the [`02-frontend-and-permissions.md`](02-frontend-and-permissions.md)
matrix (own-annotation create/edit/delete). The helper is written with the M5
role/action matrix as an explicit extension point, mirroring how M2's `authorize`
was staged.

## Testing

- **Unit (Vitest):** `splitSpans` overlap matrix; `rangeToOffsets` under jsdom
  (incl. the cross-node → `null` case).
- **Integration (Neon test branch):** create/update/delete round-trip;
  author-gate denies a non-author edit/delete; wrong-owner create denied.
- **Component:** overlap renders stacked underlines; click opens the note; a >1
  overlap opens the picker.
- **E2E (Playwright) happy-path:** select → color → note. Consistent with prior
  milestones, the live in-browser click-through remains a human TODO (headless
  runs cannot fully exercise real text selection across viewports).

## Acceptance

On `/d/[id]`, signed in as the owner:
1. Select a phrase → a four-swatch popover appears → click yellow → a yellow
   underline appears instantly and persists across reload.
2. Click the underline → an editor expands beneath the line; add a Markdown note
   and a tag, save → the rendered note + tag chip show; reload → persists.
3. Overlap two highlights on the same words → both underlines stack; clicking the
   overlap shows a picker reaching each note.
4. Delete an annotation from its editor → underline and note disappear.
5. A selection that crosses a node boundary produces no popover.

## Deferrals & coupling notes (tracked)

- **Node annotations** → next milestone (M3.5): `node_annotations` +
  `NodeAnnotationReveal` (hover/tap), one-note-per-(node, author).
- **Primary-source coupling:** M3 loads/creates annotations for the primary
  source only; M4 must scope annotations per visible source (same TODO
  `getDocument` already carries for ranges).
- **`authorizeAnnotation`** is owner-only today; M5 extends it to the full
  membership/role matrix (collaborators create own annotations, never touch
  structure).
- **Cross-node highlights** deliberately blocked in M3 (single-node restriction);
  relaxing is a `rangeToOffsets` change with no schema impact — `splitSpans`
  already clamps per node defensively.
