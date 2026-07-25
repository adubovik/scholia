# UI map

**What this is for.** Two jobs:

1. **Naming things.** If you can see it but can't name it, find it in [The glossary](#the-glossary) and use the **Call it** column. "The running head", "the edge tab", "the Aa sheet" — those names go straight to a file.
2. **Finding code cold.** Every visible region of the app → the component that renders it, the state that drives it, and the CSS block that styles it. Read this before grepping.

Only one screen matters: `/` and `/d/[docId]` are the *same* surface (`ReadingSurface`), differing only in whether a document is open. Everything else is a sign-in wall.

---

## The reading screen

```
 ┌────────────────────────────────────────────────────────────────────────────────┐
 │▐              │  Herodotus, Histories          Aa  ⚙  Notes 12  │             ▐│
 │▐  Scholia     │ ──────── running head ──────────────────────────│  Notes · 12 ▐│
 │▐  Close read… │                                                 │             ▐│
 │▐              │  1  Text of the first paragraph, with a         │ [All][#greek]▐│
 │▐  ⚙   ＋ New  │     highlighted phrase inside it.               │             ▐│
 │▐              │                                                 │ ┌──────────┐▐│
 │▐  Histories   │  ▾ 2  Book II                                   │ │2.1 “phra…”│▐│
 │▐  Herodotus   │      2.1  Another paragraph of prose, run-in    │ │note body  │▐│
 │▐  412 ¶ · 12… │           number at its head.                   │ │#greek ✎ 🗑│▐│
 │▐              │                                                 │ └──────────┘▐│
 │▐  Republic    │  ▸ 3  Book III …                                │ ┌──────────┐▐│
 │▐  Plato       │                                                 │ │3  Note on │▐│
 │▐  88 ¶ · 3 n… │                                                 │ │a section  │▐│
 │▐              │                                                 │ └──────────┘▐│
 └────────────────────────────────────────────────────────────────────────────────┘
   ▲            ▲                                                  ▲             ▲
   edge tab     LIBRARY DRAWER                READING COLUMN       NOTES DRAWER  edge tab
   (left)                                                                        (right)
```

Three regions, left to right. The reading column **shifts and re-centres** when either drawer opens — that's `ReadingChrome`'s `data-mode` attribute, not the drawers pushing it.

| Region | Component | Opened by |
|---|---|---|
| Library drawer (left) | `components/LibraryDrawer.tsx` | left edge tab, or automatically on `/` |
| Reading column (centre) | `components/ReadingChrome.tsx` → `NodeSection` tree | always |
| Notes drawer (right) | `components/NotesDrawer.tsx` | right edge tab, `Notes N` button, or clicking any highlight |

---

## The glossary

Left column is how you'd *describe* it; **Call it** is the name to use with Claude; then where it lives.

### Reading column

| If you'd say… | **Call it** | File | CSS |
|---|---|---|---|
| the bar at the top with the book title | **running head** | `ReadingChrome.tsx` | `.reading-head`, `.reading-title` |
| the `Aa` button / text size controls | **display sheet** (trigger: **Aa button**) | `ReadingSettings.tsx` | `.aa-sheet`, `.aa-row` |
| the sliders button next to `Aa` / where export lives / edit title+author / the source URL | **document info sheet** | `DocInfo.tsx` (glyph: `SettingsIcon.tsx`) | `.doc-sheet`, `.settings-icon` |
| the bare count pill top-right (just `12`) | **notes button** | `ReadingChrome.tsx` | `.reading-notesbtn` |
| one paragraph or heading of the text | **node** | `NodeSection.tsx` | `.node`, `.node-body` |
| the `1`, `2.1`, `3.1.1` markers | **section number** | `NodeMenu.tsx` → `NodeNumber` | `.node-num-id` |
| …the one sitting *inside* the paragraph | **run-in section number** | same | `.node-num-id--runin` |
| the ▾ / ▸ arrow that folds a section | **collapse toggle** | `NodeSection.tsx` | `.node-toggle` |
| the one-line "…" summary when folded | **collapsed preview** | `NodeSection.tsx` | `.node-preview` |
| the actual prose text | **passage** | `SourcePassage.tsx` | `.reading-p` |
| coloured underline / marked-up phrase | **highlight** (a.k.a. inline annotation) | `SourcePassage.tsx` → `HlSpan` | `.hl` |
| the 4 colour dots after selecting text | **selection popover** | `SelectionPopover.tsx` | `.selection-popover` |
| right-click menu on a paragraph | **node menu** | `NodeMenu.tsx` → `NodeContextMenu` | `.node-menu` |
| right-click menu on empty space | **root menu** | `NodeMenu.tsx` → `RootMenu` | `.node-menu` |
| the "No text open ❦" screen | **blank surface** | `ReadingSurface.tsx` | `.reading-blank` |

### Notes drawer (right)

| If you'd say… | **Call it** | File | CSS |
|---|---|---|---|
| the whole right panel | **notes drawer** | `NotesDrawer.tsx` | `.notes-drawer` |
| the thin strip you drag to resize it | **edge tab** / **drawer handle** | `NotesDrawer.tsx` → `onHandleDown` | `.notes-edge` |
| one entry in the list | **note card** | `NotesDrawer.tsx` → `EntryCard` | `.note-card` |
| the highlighted phrase at the card's top | **card head** / **snippet** | `EntryCard` | `.note-cardhead`, `.note-snippet` |
| the rendered Markdown of the note | **card body** | `EntryCard` | `.note-cardbody` |
| the box you type the note into | **note editor** | `MarkdownTextarea.tsx` | `.note-textarea` |
| the `#tag` pills | **tag chips** (editor: **tag editor**) | `TagEditor.tsx` | `.chip`, `.note-tags` |
| the `All / #tag` row at the top | **filter chips** | `NotesDrawer.tsx` | `.notes-filters` |
| the blank card for a brand-new note | **compose card** | `NotesDrawer.tsx` → `ComposeCard` | `.note-card--active` |
| a `§2.2` that jumps you to a section | **§ cross-reference** | `NotesDrawer.tsx` → `SectionLink`, `linkifySections` | `.xref` |

### Library drawer (left)

| If you'd say… | **Call it** | File | CSS |
|---|---|---|---|
| the whole left panel | **library drawer** | `LibraryDrawer.tsx` | `.library-drawer` |
| one text in the list | **library row** | `LibraryDrawer.tsx` | `.library-row` |
| the `＋` button | **new-text button** | `LibraryDrawer.tsx` | `.library-new` |
| the "Add to the library" dialog | **new-doc modal** | `NewDocModal.tsx` | `.newdoc-sheet` |
| the title / author / paste / URL fields in it | **import form** | `ImportForm.tsx` | `.source`, `.url-row` |
| the sliders button next to `＋` | **invite sheet** | `InviteSettings.tsx` (glyph: `SettingsIcon.tsx`) | `.invite-dialog` |

---

## Watch out: these names collide

The three most common sources of "we're talking about different things":

- **Two sliders icons.** Both use the shared `SettingsIcon` (a "tune" glyph, formerly ⚙). Reading header = **document info sheet** (`DocInfo`); library drawer = **invite sheet** (`InviteSettings`). Neither is the **display sheet** — that's the `Aa` button.
- **Two kinds of "note".** A **highlight** (`inline_annotations`) is anchored to a character range inside a paragraph and shows a coloured underline. A **node note** (`node_annotations`) is attached to a whole paragraph/section and shows only as a red section number. Both appear as cards in the notes drawer, so "my note" is ambiguous — say *highlight* or *node note*.
- **Two edge tabs.** Both use `.notes-edge`. The left one only toggles; the right one toggles **and** drag-resizes.

---

## Where the behaviour lives

Most "it doesn't react right" bugs are in a context, not a component.

| Symptom | Look here |
|---|---|
| drawer opens/closes/resizes wrong; wrong card selected; clicking a highlight does nothing | `components/NotesContext.tsx` |
| a new note opens in the wrong place in the feed, or not in its editor | `NotesDrawer.tsx` (`at`, `compareSections`) + `NotesContext.tsx` (`editingId`) |
| the note editor doesn't grow with the text, or grows without limit | `MarkdownTextarea.tsx` (JS height) + `.note-textarea` `max-height` (CSS cap) |
| folding/unfolding sections, Collapse/Expand children | `components/CollapseContext.tsx` |
| reading column doesn't shift when a drawer opens | `ReadingChrome.tsx` (`--shift-left` / `--shift-right`, `data-mode`) |
| text size / line height / column width | `lib/reading/prefs.ts` + the pre-paint script in `app/layout.tsx` |
| highlight renders in the wrong place, overlaps look wrong | `lib/annotations/spans.ts::splitSpans` — the load-bearing one |
| section numbers wrong | `lib/tree/number.ts` |
| Markdown shortcuts in the note editor (Cmd+B, paste-to-link) | `components/MarkdownTextarea.tsx` |

`NotesContext` deliberately splits into three: **actions** (never changes — the prose tree consumes only this), **state** (drawer/filter — only drawer + chrome subscribe), and an **external store** for "which annotation is selected" so a single highlight re-renders alone. If you add a re-render, check which of the three you subscribed to.

## Where the styles live

All of it is one file, `app/globals.css`, in `/* ══ Section ══ */` blocks. Grep the banner, not a line number:

`Reading header` · `Drawers (shared)` · `Notes drawer (right)` · `Library drawer (left)` · `Document info sheet` · `Drawers on mobile: bottom / top sheets`

Two standing hazards:

- **Tailwind Preflight flattens everything.** Markdown rendered into `.note-cardbody` needs its elements explicitly re-styled — list markers, `code`, `pre`, `blockquote`, headings all had to be opted back in. Anything new that Markdown can emit will render unstyled by default.
- **Mobile is not a narrower desktop.** Under the mobile breakpoint the drawers become bottom/top sheets. Changing drawer geometry means changing two places.

## Routes

| Route | File | What it is |
|---|---|---|
| `/` | `app/page.tsx` | reading surface, no document, library open |
| `/d/[docId]` | `app/d/[docId]/page.tsx` | reading surface with a document |
| `/welcome` | `app/welcome/page.tsx` | "you need an invite" wall |
| `/invite/[token]` | `app/invite/[token]/page.tsx` | redeems an invite, redirects home |
| `/sign-in`, `/sign-up` | `app/sign-*/` | Clerk |
| `/api/import` | `app/api/import/route.ts` | server-side URL fetch + Readability |
| `/api/export/[docId]` | `app/api/export/[docId]/route.ts` | Markdown export (the doc info sheet's buttons) |

---

**Keeping this current is part of the change, not a follow-up.** Adding, removing, renaming, or moving a UI component means updating this file in the same commit — a stale map is worse than none, because it sends a cold-context agent to a file that no longer does the job.
