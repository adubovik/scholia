# M2 — Tree (design / spec)

Status: **Approved** · Date: 2026-07-08

Expands the M2 outline in [`03-implementation-plan.md`](03-implementation-plan.md)
into an execution-ready design. Builds on M1 (Import & Read). The task-by-task
plan is produced separately from this spec.

## Goal

Turn the flat, single-column reading surface into a **node tree**: import
auto-creates one node per paragraph (decimal-nested for Tractatus, flat
otherwise), the reader renders nested collapsible sections, and the owner
restructures the tree with indent / outdent / move controls. Prose is never
touched — the immutable Source stays the single source of truth.

## Scope (and explicit cuts)

**In:**
- `nodes` + `node_source_ranges` schema.
- Import creates one prose node per paragraph, with whole-paragraph ranges.
- Decimal-numbering parser that nests nodes on import (Tractatus).
- Recursive `NodeSection` rendering with `▾/▸` collapse and indentation.
- Owner-only restructuring: **indent / outdent / move-up / move-down**.
- A thin `authorize()` helper (owner-only for now; M5 extends it).

**Out (deliberate cuts for M2):**
- No creating empty structural/heading nodes; no renaming titles; **no delete**.
  Import is the only node creator; restructuring never strands prose (immutable
  Source) and can always be undone by outdent/move, so delete is unnecessary.
- Collapse state is **ephemeral (client-only)** — resets on reload, no schema.
- Drag-and-drop and the command palette are **not** used (palette is M7).
- No translations, annotations, sharing (M3–M5).

## The node model — one prose node per paragraph

Import creates exactly **one `node` per paragraph**, in reading order. Each node:

- points at that paragraph's **whole-paragraph range** (one `node_source_ranges`
  row against the primary source);
- carries an optional `label` (e.g. `1.1`, from numbering) and optional `title`;
- has exactly one paragraph of prose plus zero or more child nodes.

This fits both driving texts: a Tractatus proposition *is* a paragraph; a Russell
paragraph *is* a node. Consequently, "nest a paragraph under another" is purely a
`parent_id` / `position` rewrite — **no text moves**, preserving the immutable-Source
invariant.

- **Flat text (Russell):** every node top-level, in order; nesting is manual.
- **Numbered text (Tractatus):** nodes nested by decimal label; `label` set from
  the detected number.

`node_source_ranges` is kept even though M2 has a single source and whole-paragraph
spans — this is exactly the alignment table M4 (translations) needs, so M4 requires
no schema rework. That is the reason [`01-data-schema.md`](01-data-schema.md) drew
it this way.

## Schema additions

Added to `lib/db/schema.ts`, applied with `pnpm db:push`. Matches
[`01-data-schema.md`](01-data-schema.md).

### `nodes`
- `id uuid pk default gen_random_uuid()`
- `document_id uuid → documents.id (on delete cascade)`
- `parent_id uuid → nodes.id null` — null = top level
- `position int not null` — order among siblings (compact `0..n`)
- `label text null` — e.g. `1.2.1` from numbering
- `title text null` — optional heading
- `created_at`, `updated_at`
- Index `(document_id, parent_id, position)`

### `node_source_ranges`
One row per (node, source) the node exists in. In M2, always a whole-paragraph span.
- `id uuid pk`
- `node_id uuid → nodes.id (on delete cascade)`
- `source_id uuid → sources.id (on delete cascade)`
- `start_paragraph_id uuid → paragraphs.id`
- `start_offset int not null`
- `end_paragraph_id uuid → paragraphs.id`
- `end_offset int not null`
- `unique (node_id, source_id)`
- For M2: `start_paragraph_id == end_paragraph_id`; `source_id` = the primary source.
  - **Flat (unnumbered) node:** offsets = the paragraph's `char_start` / `char_end`
    (whole paragraph).
  - **Numbered node:** `start_offset = char_start + proseStart` (past the leading
    label token, see parser), `end_offset = char_end`. The number stays in the
    immutable source; the node simply points *past* it, so the label renders once
    (as chrome) and the prose reads cleanly — no text is edited or duplicated.

## Numbering parser — `lib/tree/numbering.ts`

`parseNumberedTree(paragraphs: { text: string }[]) → NumberedRelation[] | null`,
where a relation carries `{ paragraphIndex, label, parentLabel | null, proseStart }`.
`proseStart` is the character index within the paragraph where prose begins (after
the label token and its trailing whitespace) — import uses it to start the node's
range past the number. Returns `null` when the text is not a clean numbered
structure (→ caller builds a flat tree).

**Label detection:** leading token matching `^(\d+(?:\.\d+)*)\s+` on each paragraph.

**Tractatus digit scheme** (per the spec's `1`, `1.1`, `1.11` example): a label's
path is `[integerPart, ...each digit of the fractional part]`, so:
- `1` → `[1]`, parent `null`
- `1.1` → `[1,1]`, parent `1`
- `1.11` → `[1,1,1]`, parent `1.1`
- `2.01` → `[2,0,1]`, parent `2.0`

Parent label = **drop the last fractional digit** (and the trailing dot when only
the integer remains). Dot-group section numbering (`1.2.3` as three levels) is
**out of scope** — Tractatus is the target text.

**Trigger (numbered mode) iff both:**
1. **every** non-empty paragraph carries a label, and
2. every non-root label's computed parent exists among earlier labels.

Otherwise return `null`. This prevents false positives on ordinary prose (e.g. a
paragraph that happens to start with "1. ").

Pure and unit-tested; no DB access.

## Import path change — `lib/actions/documents.ts`

`createDocument` gains a third step inside the existing `db.batch(...)` atomic
round-trip: after inserting `paragraphs`, run `parseNumberedTree` and insert
`nodes` + `node_source_ranges`.

- Flat result → N top-level nodes (`parent_id null`, `position` = paragraph order).
- Numbered result → nodes nested per the parser, `label` set, `title` null, and the
  range started at `char_start + proseStart` (past the label token).
- Each node gets one `node_source_ranges` row against the primary source.

The import wizard UI (`app/new/page.tsx`) is unchanged.

**Existing M1 documents:** an idempotent one-shot migration
`scripts/backfill-nodes.ts` (`pnpm tsx scripts/backfill-nodes.ts`) creates
node-per-paragraph for any document that has paragraphs but zero nodes, so current
docs keep rendering. It is safe to re-run (skips docs that already have nodes).

## Data loading + tree build — `lib/data/documents.ts`, `lib/tree/build.ts`

`getDocument` additionally loads the document's `nodes` and `node_source_ranges`,
and `buildTree` folds the flat rows into a nested structure:

```
TreeNode {
  id: string;
  label: string | null;
  title: string | null;
  text: string;              // resolved: source.text.slice(range.start_offset, range.end_offset)
  children: TreeNode[];      // ordered by position
}
```

`buildTree(nodes, ranges, sourceText)` is a pure function (parent/child assembly +
range resolution), unit-tested. The reader consumes only `TreeNode[]` (top level).

## Rendering — `components/`

- **`ReadingSurface`** no longer slices paragraphs flat; it maps top-level
  `TreeNode`s to `NodeSection`, passing a `canEdit` flag.
- **`NodeSection`** (client, recursive):
  - a `▾ / ▸` glyph toggling collapse via local `useState` (ephemeral);
  - the `label` / `title` line (mono chrome), then the node's `SourcePassage`;
  - indented child `NodeSection`s (left padding per depth), hidden when collapsed;
  - `TreeEditControls` when `canEdit`.
- **`TreeEditControls`** (client, owner-only): four glyph buttons —
  **indent · outdent · ↑ · ↓** — invoking the Server Actions. Hidden below the
  mobile width breakpoint (device matrix: tree-building is desktop-only).

Data is fetched in the RSC page and passed down as serializable props; the client
node tree hydrates from it and calls Server Actions on edit.

For M2, anyone who can read a document is its owner (`getDocument` gates reads to
`owner_id`), so `canEdit` is effectively always true here — but it is threaded
through now so M5 can set it false for collaborators without touching rendering.

## Mutations + permissions — `lib/actions/tree.ts`, `lib/auth/authorize.ts`

**`authorize(userId, docId, action)`** (new, thin): resolves ownership from
`documents.owner_id`. Tree actions require owner; otherwise it throws. No
`memberships` yet — M5 extends this same helper with the full role matrix. Adding
it now honors the invariant that *every* Server Action authorizes before mutating.

Four owner-gated Server Actions in `lib/actions/tree.ts`. Each: `authorize` → load
the node and its sibling set → recompute `parent_id` / `position` → `db.batch`
update → bump `documents.updated_at` → `revalidatePath('/d/[docId]')`.

- **`indentNode(nodeId)`** — reparent under the immediate previous sibling
  (appended as its last child). No-op if the node is the first among its siblings.
- **`outdentNode(nodeId)`** — become a sibling of the current parent, inserted
  immediately after it in the grandparent's order. No-op if already top-level.
- **`moveNodeUp(nodeId)` / `moveNodeDown(nodeId)`** — swap `position` with the
  adjacent sibling. No-op at the respective boundary.

Positions among affected siblings are renumbered compactly (`0..n`) on each move,
keeping ordering total and gap-free.

## Testing

- **Unit (Vitest):**
  - `numbering.test.ts` — Tractatus fixture (`1`, `1.1`, `1.11`, `1.2`, `2`,
    `2.01`) → correct parent/child relations; prose paragraphs → `null` (flat).
  - `build.test.ts` — flat node rows → correct nesting, ordering, and resolved text.
  - `node-section.test.tsx` (jsdom) — `▾/▸` toggles child visibility.
- **Integration (Vitest + Neon test branch):**
  - `createDocument` writes one node per paragraph with a whole-paragraph range.
  - `indentNode` nests a node under its previous sibling and the change survives a
    reload (re-query).
  - `authorize` denies a non-owner invoking a tree action.

## Acceptance

- Import **Tractatus** → an auto-built decimal tree (`1` › `1.1` › `1.11`, etc.).
- Import **Russell**, indent one paragraph under another, reload → nesting persists.
- `pnpm test` and `pnpm build` green.

## File map

| File | Change |
|------|--------|
| `lib/db/schema.ts` | add `nodes`, `node_source_ranges` |
| `lib/tree/numbering.ts` (+ test) | decimal parser |
| `lib/tree/build.ts` (+ test) | flat rows → nested `TreeNode[]` |
| `lib/actions/documents.ts` | create nodes + ranges on import |
| `lib/actions/tree.ts` | indent / outdent / move Server Actions |
| `lib/auth/authorize.ts` (+ test) | owner-only gate |
| `lib/data/documents.ts` | load nodes + ranges, build tree |
| `components/ReadingSurface.tsx` | render tree instead of flat paragraphs |
| `components/NodeSection.tsx` (+ test) | recursive collapsible node |
| `components/TreeEditControls.tsx` | indent/outdent/move controls |
| `scripts/backfill-nodes.ts` | one-shot node backfill for M1 docs |
