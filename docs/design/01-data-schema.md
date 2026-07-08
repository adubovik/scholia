# Data Schema (Neon Postgres / Drizzle)

Status: **Design** · Date: 2026-07-08

Maps the [data model](../01-data-model.md), [annotations](../02-annotations.md),
and [sharing](../04-sharing-and-roles.md) decisions to concrete tables. IDs are
`uuid` (default `gen_random_uuid()`) unless noted. All tables have `created_at`;
mutable rows also have `updated_at`.

## Entity overview

```
users (mirror of Clerk)
  └─ documents (owner_id)
       ├─ sources (translations; immutable)          ── paragraphs
       ├─ nodes (tree; parent_id self-ref)            ── node_source_ranges → sources/paragraphs
       ├─ inline_annotations (author_id, source_id)   ── tags[]
       ├─ node_annotations (author_id, node_id)       ── tags[]
       ├─ comments (target = inline|node annotation; parent_comment_id self-ref)
       └─ memberships (user_id, role)
```

## Tables

### `users`
Mirror of Clerk identity so annotations/comments can join to a display name.
- `id text primary key` — the **Clerk user id**.
- `email text not null`
- `display_name text not null`
- Synced via Clerk webhook + upserted on first authenticated request.

### `documents`
- `id uuid pk`
- `owner_id text → users.id`
- `title text not null`
- `cloned_from uuid → documents.id null` — provenance of a clone (no live link).
- `created_at`, `updated_at`

### `sources` (a translation; immutable after import)
- `id uuid pk`
- `document_id uuid → documents.id`
- `language text` — e.g. `de`, `en`.
- `label text` — e.g. "German original", "Ogden translation".
- `is_primary boolean not null default false`
- `position int not null` — display order in interleaved view.
- `text text not null` — the full normalized source text (verbatim; offsets index
  into this string).
- **Immutable:** never updated after creation.

### `paragraphs` (atomic addressable units of a source)
- `id uuid pk`
- `source_id uuid → sources.id`
- `position int not null` — order within the source.
- `char_start int not null`, `char_end int not null` — offsets into `sources.text`.
- (Text is derived as `sources.text.substring(char_start, char_end)`; we store
  offsets, not a copy, to keep a single source of truth.)

### `nodes` (translation-agnostic tree)
- `id uuid pk`
- `document_id uuid → documents.id`
- `parent_id uuid → nodes.id null` — null = top level.
- `position int not null` — order among siblings.
- `label text null` — e.g. `1.2.1` (from numbering) or null.
- `title text null` — optional heading.
- Tree is edited by owner only.

### `node_source_ranges` (node ↔ source alignment; node-level)
One row per (node, source) the node exists in.
- `id uuid pk`
- `node_id uuid → nodes.id`
- `source_id uuid → sources.id`
- `start_paragraph_id uuid → paragraphs.id`
- `start_offset int not null` — offset within `sources.text`.
- `end_paragraph_id uuid → paragraphs.id`
- `end_offset int not null`
- `unique (node_id, source_id)`

### `inline_annotations` (span-level, bound to one translation)
- `id uuid pk`
- `document_id uuid → documents.id`
- `source_id uuid → sources.id` — **which translation** this span lives in.
- `author_id text → users.id`
- `start_offset int not null`, `end_offset int not null` — into `sources.text`.
- `color text not null` — enum-checked: `yellow|pink|green|blue`.
- `note text null` — Markdown; collapsed by default.
- `tags text[] not null default '{}'` — GIN-indexed for filtering.
- `created_at`, `updated_at`
- **Overlaps allowed:** no exclusion constraint on ranges.

### `node_annotations` (entity-level, shared across translations)
- `id uuid pk`
- `document_id uuid → documents.id`
- `node_id uuid → nodes.id`
- `author_id text → users.id`
- `note text not null` — Markdown.
- `tags text[] not null default '{}'`
- `created_at`, `updated_at`
- `unique (node_id, author_id)` — one node-note per author per node (a node's
  discussion continues in its comment thread, not multiple root notes).

### `comments` (forum-style threads on either annotation kind)
- `id uuid pk`
- `document_id uuid → documents.id`
- `target_type text not null` — `inline_annotation | node_annotation`.
- `target_id uuid not null` — id of the annotation (polymorphic; enforced in app).
- `parent_comment_id uuid → comments.id null` — nesting.
- `author_id text → users.id`
- `body text not null` — Markdown.
- `created_at`, `updated_at`

### `memberships` (sharing / roles)
- `id uuid pk`
- `document_id uuid → documents.id`
- `user_id text → users.id`
- `role text not null` — `owner | collaborator`.
- `unique (document_id, user_id)`
- Owner also has a `memberships` row (role `owner`) in addition to
  `documents.owner_id`, so a single query lists all participants.

## Cloning (fork) — what copies vs. resets

A clone creates a new `documents` row with `cloned_from` set and, in one
transaction, **copies**: `sources`, `paragraphs`, `nodes`, `node_source_ranges`
(re-mapping ids). It **does not copy**: `inline_annotations`, `node_annotations`,
`comments`, `memberships` (the cloner becomes sole owner). Result: same layout +
translations, zero annotations/threads.

## Indexing notes

- `paragraphs (source_id, position)`; `nodes (document_id, parent_id, position)`.
- `inline_annotations (source_id)`, GIN on `tags`; `(document_id, author_id)` for
  author filtering.
- `comments (target_type, target_id)`, `(parent_comment_id)`.
- `node_source_ranges (source_id)` and `(node_id)`.

## Deferred schema (post-V1, noted so we don't paint into a corner)

- Realtime presence, cross-links (`annotation_links`), export snapshots, search
  index (`tsvector` column on `sources`/notes) — all additive, no rework of the
  above required.
