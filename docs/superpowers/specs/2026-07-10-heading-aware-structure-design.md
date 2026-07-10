# Heading-aware document structure

**Date:** 2026-07-10
**Status:** Approved (brainstorm) — pending implementation plan

## Problem

Importing an HTML document (e.g. the Project Gutenberg edition of *The Problems
of Philosophy*, `https://www.gutenberg.org/files/5827/5827-h/5827-h.htm`) loses
its skeleton:

- **Chapter names vanish.** `lib/import/html.ts::collectParagraphs` does
  `querySelectorAll("p")`, which silently discards every `h1–h6`. The headings
  are present in Readability's cleaned output — we just never collect them.
- **No nesting.** The pipeline joins paragraphs into one flat string; every
  paragraph becomes a top-level node. Chapter → prose hierarchy is never built.
- **TOC / boilerplate leak.** The Gutenberg `*** START OF … ***` marker survives
  as the first node, and the title resolves to the author line
  (`"By Bertrand Russell"`) instead of the book title.

This is lossy *collection*, not lossy *parsing*: Readability preserves all 19
headings in document order plus the TOC `<table>`, and `article.title` is
already correct (`"The Problems of Philosophy | Project Gutenberg"`).

## Constraints

- **Immutable source + integer offsets** (CLAUDE.md core invariant). A heading
  cannot be metadata floating beside the text — it must become real characters
  in `source.text`, with a node whose `[start,end)` range covers it, exactly
  like a paragraph.
- **Green Vitest ≠ green `next build`.** Run `pnpm build` (ES2017 tsc) before
  claiming deploy-safe.

## Decisions (from brainstorm)

1. **Nesting model — chapters top-level, by level.** The `h1` becomes the
   document title only (no node). Each content heading becomes a node;
   paragraphs and deeper headings nest under the nearest higher heading. Chapters
   are top-level nodes with their prose as children.
2. **TOC detection — signal-based cluster.** Drop TOCs whether rendered as a
   table, a list, or plain link paragraphs — not tied to one Gutenberg layout.
3. **Byline heuristic — apply it.** A leading heading matching `/^by\s/i` with no
   prose before the next heading is dropped (otherwise it becomes an empty
   top-level node once the `h1` is consumed as the title).

## Architecture / data flow

Structure must survive from the DOM to `planNodes`; today it dies at
`paragraphs.join("\n\n")`.

```
htmlToBlocks(html) ─▶ Block[]
    Block = { kind: "heading", level, text } | { kind: "paragraph", text }
    (TOC + boilerplate already removed, title resolved)
   │
blocksToSource(blocks) ─▶ { text, headingLevels }
    text = blocks joined with "\n\n"
    headingLevels[i] aligned 1:1 to paragraphize(text)[i]
   │
createDocument({ title, text, headingLevels })
    paragraphize(text)              // unchanged
    planNodes(paras, newId, headingLevels)   // precedence: numbered → heading → flat
```

**Load-bearing invariant:** each block becomes exactly one paragraph in the
joined text (headings contain no internal blank line; empty `<p><br></p>` blocks
are dropped at extraction), so `headingLevels[i]` lines up with
`paragraphize()[i]` and offsets stay exact. This mirrors how
`parseNumberedTree` threads hierarchy — headings are hierarchy-by-level instead
of hierarchy-by-`1.2.3`.

## Component detail

### 1. Extraction — `lib/import/html.ts`

Keep Readability. Replace `<p>`-only `collectParagraphs` with an ordered walk of
`h1–h6` + `p`, producing `Block[]`. Each block carries the DOM-derived signal
needed for TOC detection: whether the source element's text is dominated by
internal `href="#…"` anchors.

Removal rules over the block stream:

- **TOC R1** — drop headings whose normalized text matches
  `/^(table of\s+)?contents$/i`. (The Gutenberg TOC `<table>` never enters the
  stream because `<td>` isn't collected; dropping the heading suffices there.)
- **TOC R2** — drop maximal runs of *link-dominated* paragraph blocks (short
  text that is mostly internal `#` anchors). Catches list/paragraph TOCs in other
  books.
- **Boilerplate** — drop `*** START/END OF THE PROJECT GUTENBERG EBOOK … ***`
  marker lines.
- **Byline** — drop a leading heading matching `/^by\s/i` with no prose before
  the next heading.
- **Title** — prefer `article.title`, strip a trailing site suffix
  (`" | Project Gutenberg"`); fall back to first `h1`.

### 2. `blocksToSource(blocks)` — pure

Returns `{ text, headingLevels }`. The single place that guarantees text/level
alignment. `headingLevels[i]` is the heading level (`2–6`) for block `i`, or
`null` for a paragraph.

### 3. Planner — new `parseHeadingTree` in `lib/tree/`

Sibling to `parseNumberedTree`. Input: `paras` + `headingLevels`. Returns
parent/child relations, or `null` when there are no headings.

- Normalize levels so the shallowest heading present is depth 0.
- Walk maintaining a stack of open headings. A **heading**'s parent = nearest
  preceding heading with a smaller level; a **paragraph**'s parent = the current
  deepest open heading (top-level if none open yet).
- A heading node's range covers its own text → `title` = heading text,
  `text` === title. Prose nodes are whole-paragraph ranges, as today.

`planNodes` precedence becomes **numbered → heading → flat**. Numbered docs and
plain articles (all-`null` levels) are unchanged.

### 4. Wiring

- `createDocument` — add optional `headingLevels?: (number | null)[]`, passed
  straight to `planNodes`. Text-only callers are unaffected.
- `scripts/seed.ts` and `app/api/import/route.ts` — switch to
  `htmlToBlocks` → `blocksToSource` → `createDocument`.

## Testing & verification

Colocated Vitest specs:

- `parseHeadingTree` — nesting + level normalization.
- `blocksToSource` — offset exactness (`text.slice(start, end)` round-trips each
  block).
- TOC detection — R1/R2 drop the right blocks, keep real chapters.

Plus an interactive `scratch/` probe against the Gutenberg book to eyeball the
skeleton. Per project workflow: one final green `pnpm test`, then `pnpm build`
before declaring deploy-safe.

## Out of scope

- Multi-source reads (M4/M5).
- Collecting `<td>`/`<li>` as content blocks (only needed if we wanted to
  *render* table/list content; TOC removal doesn't require it).
- Rich-text editing (precluded by the immutable-source invariant).
