# Frontend Architecture, Permissions & Design Tokens

Status: **Design** · Date: 2026-07-08

## Route map (App Router)

```
/                         landing / list of my documents (auth required)
/new                      import wizard (paste / url / file / numbered auto-parse)
/d/[docId]                the reading surface (RSC-rendered)
/d/[docId]/settings       title, translations, sharing, clone (owner)
/sign-in, /sign-up        Clerk
/api/import               Route Handler: server-side URL fetch + HTML→paragraphs
/api/webhooks/clerk       Route Handler: sync users table
```

## Component decomposition (each file one responsibility)

Server Components (render, no client JS unless noted):
- `ReadingSurface` — orchestrates a document: ordered nodes + interleaved sources.
- `NodeSection` — one tree node: label/title, collapse glyph, its aligned source
  passages, child `NodeSection`s (recursive).
- `SourcePassage` — renders one source's text for a node, split into annotated
  spans (the algorithm in [00](00-architecture.md)).

Client islands (interactivity only, kept small):
- `SelectionPopover` — watches `window.getSelection()`, maps DOM range → source
  offsets, offers color/note/tags. Creates inline annotations.
- `InlineNote` — collapsed note toggled on span click; expands beneath the line.
- `NodeAnnotationReveal` — hover (desktop) / tap (mobile) reveals node note.
- `CommandPalette` (cmdk) — annotate, add-child, move-node, add-translation,
  filter-by-author, clone, jump-to-node.
- `TreeEditControls` — gutter `⊕`/handle for add-child / move (desktop only).
- `AuthorFilter` — toggles which authors' annotations are visible.

## DOM↔offset mapping (the fiddly bit, called out early)

- Each rendered text run carries `data-source-id` and `data-char-start`.
- On selection, walk the Range's start/end containers up to the nearest
  `[data-char-start]` ancestor, add the Range offset, and clamp to the source.
- This yields `{sourceId, startOffset, endOffset}` independent of how spans were
  split for highlighting. Covered by Playwright tests across viewports.

## Permission model (enforced in every Server Action)

A single helper gates all mutations:

```
authorize(userId, docId, action) → ok | throw
```

| Action | Owner | Collaborator |
|--------|:-----:|:------------:|
| read document | ✓ | ✓ |
| create/edit/delete tree nodes, ranges | ✓ | ✗ |
| add/import a source (translation) | ✓ | ✗ |
| create own inline/node annotation | ✓ | ✓ |
| edit/delete **own** annotation | ✓ | ✓ |
| edit/delete **others'** annotation | ✗ | ✗ |
| post/reply comment | ✓ | ✓ |
| edit/delete **own** comment | ✓ | ✓ |
| share / manage memberships | ✓ | ✗ |
| clone document | ✓ (any reader) | ✓ (any reader) |

Membership is resolved once per request from `memberships` (+ `documents.owner_id`).
Collaborators never touch structure; that is the invariant the whole roles table
protects. **Clone is the escape hatch** for a collaborator who wants to restructure.

## Design tokens (austere, monochrome + highlighter pastels)

Defined once as CSS variables; Tailwind maps to them.

```css
:root {
  --ink:        #111;      /* near-black text            */
  --paper:      #fafafa;   /* off-white background       */
  --rule:       #e3e3e3;   /* hairline separators        */
  --muted:      #6b6b6b;   /* labels, numbering, glyphs  */
  /* highlighter pastels — the ONLY color in the app */
  --hl-yellow:  #f2e6a8;
  --hl-pink:    #f0cdd6;
  --hl-green:   #cfe6c9;
  --hl-blue:    #cdd9ee;
}
```

- Type: one serif for body reading, one mono for chrome/labels/palette.
- No shadows, no rounded cards; separators are 1px rules. Icons are Unicode
  (`▾ ▸ ⊙ ⊕ ¶ ⌘ ⌕`) or single-stroke SVG.
- Inline highlight = `border-bottom: 2px solid var(--hl-*)`; overlaps stack as
  additional `box-shadow` underlines a few px lower.

## Mobile behavior

- Interleaved translations render identically (stacked) — no layout switch.
- Hover reveals become taps.
- Tree-**building** controls (`TreeEditControls`) are hidden below a width
  breakpoint; reading/annotating/commenting remain fully available.

## Testing strategy

- **Unit (Vitest):** span-splitting algorithm, DOM↔offset mapping (jsdom),
  numbered-structure parser, `authorize()` matrix, clone copy/reset logic.
- **Integration (Vitest + Neon test branch):** Server Actions against a real DB
  (create annotation, add node, post comment, clone).
- **E2E (Playwright):** import→read→highlight→note→comment; add translation→
  interleaved view; collapse tree; author filter; clone strips annotations.
  Desktop + mobile viewports.
