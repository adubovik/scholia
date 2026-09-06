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
| Reading column (centre) | `components/ReadingChrome.tsx` → the centred panel | always |
| Right drawer | `components/SideDrawer.tsx` → the other panel | right edge tab, `Notes N` button, clicking a highlight |

**Two panels, one toggle.** `components/ReadingWorkspace.tsx` (client shell) owns the **reading-first ↔ annotation-first** toggle, which **swaps which panel is centred and which is in the right drawer** (see [Annotation-first view](#annotation-first-view)):

- **Reading panel** — the prose, `NodeSection` tree. Centred by default (editable, with the selection popover); read-only when it's in the drawer.
- **Annotation panel** — the annotations as a foldable tree, `DualNodeSection`. In the drawer by default; centred when swapped. Editable in place wherever it sits.

`ReadingSurface.tsx` (server) computes both trees and passes them in. `SideDrawer.tsx` is just the drawer *shell* (fixed panel, edge handle, resize) and renders whichever panel isn't centred. **`NotesDrawer.tsx` (the old card-list drawer with filter chips + compose card) is currently unmounted** — kept for that UI, which the tree view doesn't yet replace.

---

## The glossary

Left column is how you'd *describe* it; **Call it** is the name to use with Claude; then where it lives.

### Reading column

| If you'd say… | **Call it** | File | CSS |
|---|---|---|---|
| the bar at the top with the book title | **running head** | `ReadingChrome.tsx` | `.reading-head`, `.reading-title` |
| the icon button left of `Aa` that swaps text↔annotation | **mode toggle** (switches to **annotation-first view**) | `ReadingChrome.tsx` (state in `ReadingWorkspace.tsx`) | `.reading-modebtn` |
| the `Aa` button / text size controls | **display sheet** (trigger: **Aa button**) | `ReadingSettings.tsx` | `.aa-sheet`, `.aa-row` |
| the Filled/Underline toggle in that sheet | **marks toggle** | `ReadingSettings.tsx` | `.aa-modrow`, `.aa-seg` |
| the LXI / IV.Prop.LXI toggle in that sheet | **section-ids toggle** (short vs full compound id) | `ReadingSettings.tsx` (pref `IdMode` in `lib/reading/prefs.ts`) | `.aa-seg-id`, `:root[data-id-mode]` |
| the sliders button next to `Aa` / where export lives / edit title+author / the source URL | **document info sheet** | `DocInfo.tsx` (glyph: `SettingsIcon.tsx`) | `.doc-sheet`, `.settings-icon` |
| the bare count pill top-right (just `12`) | **notes button** | `ReadingChrome.tsx` | `.reading-notesbtn` |
| one paragraph or heading of the text | **node** | `NodeSection.tsx` | `.node`, `.node-body` |
| the `1`, `2.1`, `LXI`, `IV.Prop.LXI` markers | **section number** (compound id: ancestor aliases + own id, from `lib/tree/number.ts::idPaths`; both short+full render, toggle picks — see **section-ids toggle**) | `NodeMenu.tsx` → `NodeNumber`/`NumText` | `.node-num-id`, `.node-num-full`/`.node-num-short` |
| …the one sitting *inside* the paragraph | **run-in section number** | same | `.node-num-id--runin` |
| the ▾ / ▸ arrow that folds a section | **collapse toggle** | `NodeSection.tsx` | `.node-toggle` |
| the one-line "…" summary when folded | **collapsed preview** | `NodeSection.tsx` | `.node-preview` |
| the actual prose text | **passage** | `SourcePassage.tsx` | `.reading-p` |
| coloured tint / underline on a phrase | **highlight** (a.k.a. inline annotation; filled or underlined per the **marks toggle**) | `SourcePassage.tsx` → `HlSpan` | `.hl`, `[data-hl-mode]` |
| the ≡/?/! badge inline after a section number or before a highlight | **glyph marker** | `GlyphPill.tsx` → `GlyphPill` (placed inline by `SourcePassage`/`NodeNumber`) | `.glyph-pill--inline` |
| the 4 colour dots after selecting text | **selection popover** | `SelectionPopover.tsx` | `.selection-popover` |
| right-click menu on a paragraph | **node menu** | `NodeMenu.tsx` → `NodeContextMenu` | `.node-menu` |
| right-click menu on empty space | **root menu** | `NodeMenu.tsx` → `RootMenu` | `.node-menu` |
| the `(original\|summary\|french)` pill above the column | **view bar** (multi-select; picks which **views** show) | `LayerBar.tsx` (state in `LayerContext.tsx`) | `.layer-bar`, `.layer-chip` |
| a tinted block of alternative text under a paragraph | **view band** (one **view**'s text for that node) | `LayerBands.tsx` | `.layer-band` (tint only — no name label; the bar's chip carries the name) |
| the "Create a view" name+colour dialog | **view sheet** | `LayerModal.tsx` | `.layer-sheet`, `.layer-swatches` |
| the "No text open ❦" screen | **blank surface** | `ReadingSurface.tsx` | `.reading-blank` |

### Right drawer + annotation panel

> **The card-list drawer is gone.** There are no note *cards* any more — annotations are a **tree** (`AnnotationPanel` → `DualNodeSection`) that sits in the right drawer by default and swaps to centre. `SideDrawer.tsx` is the bare drawer shell (edge handle, resize, geometry); `NotesDrawer.tsx`/`EntryCard`/`ComposeCard` were deleted.

| If you'd say… | **Call it** | File | CSS |
|---|---|---|---|
| the whole right panel | **right drawer** | `SideDrawer.tsx` | `.notes-drawer` |
| the thin strip you drag to resize it | **edge tab** / **drawer handle** | `SideDrawer.tsx` / `LibraryDrawer.tsx` → `makeEdgeHandler` (`useEdgeDrag.ts`) | `.notes-edge` |
| the annotations (filter row + tree) inside it | **annotation panel** | `AnnotationPanel.tsx` | `.annot-panel` |
| one annotation row | **dual block** | `DualNodeSection.tsx` | `.dual-block`, `.dual-note` |
| the rendered note prose (markdown) | **note markdown** | `NoteMarkdown.tsx` (used by `DualNodeSection`) | `.dual-note` children |
| a blue `§1.1` / `§1.1₁` link inside a note that jumps to a block/highlight (typed `§1.1_1`, the index pretty-printed as a `<sub>` like the inline id) | **cross-reference** (§ref) | parsed in `lib/annotations/refs.ts`, rendered by `NoteMarkdown.tsx`, dispatched via `NotesContext.scrollToSection` | `.xref` |
| the box you type the note into | **note editor** | `NoteEditor.tsx` → `MarkdownTextarea.tsx` | `.note-textarea` |
| the colour swatches / `#tag` editor / glyph toggle in it | (all in) **note editor** | `NoteEditor.tsx` (`TagEditor`, `GlyphToggle`) | `.note-colors`, `.note-tags`, `.note-glyphs` |
| the `#tag` pills under a note | **tag chips** | `DualNodeSection.tsx` | `.dual-meta`, `.chip` |
| the segmented ≡ ? ! capsule | **glyph pill** (interactive: **glyph toggle**) | `GlyphPill.tsx` → `GlyphPill` / `GlyphToggle` | `.glyph-pill`, `.glyph-cell` |
| the `All / #tag` row atop the annotation panel | **filter chips** | `AnnotationPanel.tsx` | `.notes-filters`, `.annot-filters` |
| the highlighted phrase leading an inline row (filled/underlined like the reading column) | **inline quote** | `DualNodeSection.tsx` → `HlSpan`-styled `.hl` | `.dual-quote`, `.hl` |
| the dim `2.1₁` citation id at the head of an inline row (parent number + subscript index; click selects the annotation) | **inline id** | `DualNodeSection.tsx` (`index` from `lib/tree/dual.ts`) | `.dual-inline-id` |

### Library drawer (left)

| If you'd say… | **Call it** | File | CSS |
|---|---|---|---|
| the whole left panel | **library drawer** | `LibraryDrawer.tsx` | `.library-drawer` |
| one text in the list | **library row** | `LibraryDrawer.tsx` | `.library-row` |
| the `＋` button | **new-text button** | `LibraryDrawer.tsx` | `.library-new` |
| the small `Demo` pill beside the Scholia wordmark (only on `/demo`) | **Demo badge** | `LibraryDrawer.tsx` (`usePathname`) | `.library-brand-badge` |
| the "Add to the library" dialog | **new-doc modal** | `NewDocModal.tsx` | `.newdoc-sheet` |
| the title / author / paste / URL fields in it | **import form** | `ImportForm.tsx` | `.source`, `.url-row` |
| the "Use AI to detect structure" checkbox + key field in it | **AI toggle** | `ImportForm.tsx` (BYOK key in `sessionStorage`) | `.ai-toggle`, `.ai-key-note` |
| the "AI-detected structure" confirm dialog (tree preview + removed lines + tokens, Accept/Cancel) | **tree preview modal** | `TreePreviewModal.tsx` | `.tprev-sheet`, `.tprev-line`, `.tprev-dropped` |
| the sliders button next to `＋` | **invite sheet** | `InviteSettings.tsx` (glyph: `SettingsIcon.tsx`) | `.invite-dialog` |

---

## Watch out: these names collide

The three most common sources of "we're talking about different things":

- **Two sliders icons.** Both use the shared `SettingsIcon` (a "tune" glyph, formerly ⚙). Reading header = **document info sheet** (`DocInfo`); library drawer = **invite sheet** (`InviteSettings`). Neither is the **display sheet** — that's the `Aa` button.
- **Two kinds of "note".** A **highlight** (`inline_annotations`) is anchored to a character range inside a paragraph and shows a coloured underline. A **node note** (`node_annotations`) is attached to a whole paragraph/section and shows only as a red section number. Both appear as rows in the annotation tree (a highlight nests under its node), so "my note" is ambiguous — say *highlight* or *node note*.
- **Two edge tabs.** Both use `.notes-edge` and share one pointer handler (`components/useEdgeDrag.ts::makeEdgeHandler`): a click toggles, a drag while open resizes (left grows rightward, right grows leftward). Widths live in `NotesContext` (`leftWidth` / `panelWidth`).
- **"View" (UI) = "layer" (code).** Everything the user sees says *view* — "Create a view", the view bar. Everything in the code says `layer`: the `layers` table, `LayerView`, `LayerContext`, `layerNotes`, `--layer-sand`. (`…View` already means "shaped for rendering" here — `InlineAnnotationView`, `NodeAnnotationView` — so a type called `View` would have read as that.) Also distinct from **annotation-first view**, which is a *mode*, not a rendition: grep `dualMode` for the mode, `layers` for renditions.
- **A view's text is a node annotation.** `node_annotations` rows with `layer_id` set ARE the view texts (`layer_id NULL` = the ordinary node note), sharing one table, one unique constraint (`UNIQUE NULLS NOT DISTINCT (node_id, author_id, layer_id)`) and one action (`upsertNodeAnnotation`). So "how many notes" queries must filter `layer_id IS NULL` — `listDocuments` does.
- **Glyphs ARE tags.** The three preset marks (≡ summary, ? question, ! insight) aren't a separate column — they're `":summary"`/`":question"`/`":insight"` system tags inside an annotation's `tags`. `lib/annotations/glyphs.ts` splits a tag list into display (`#`) tags and glyphs. So "tags" spans both: the `#tag` chips exclude glyph tags, and the glyph pill/marker render the glyph tags. Adding the tag is what turns on the mark.

---

## Annotation-first view

The **mode toggle** (left of `Aa`) **swaps the two panels' places**. Default (reading-first): reading prose centred, annotations in the right drawer. Annotation-first: annotations centred, reading prose in the drawer (read-only). Both panels render as foldable trees in the reading typeface — same font, same collapse toggles — so they read as one system.

- The annotation tree is built by two pure functions in `lib/tree/dual.ts`: **`buildDual(tree, numbers)`** → the *full* `DualNode[]` (annotations arranged along the document hierarchy; a node's note is the prose, its inline annotations are **child rows**), and **`visibleDual(nodes, {filterTag, filterGlyphs, forceIds})`** which prunes/filters it at render time. Numbers come from the *reading* tree (a note on §2.1 is still 2.1 in both panels). Base pruning drops note-less leaves; a note-less node holding an annotated descendant survives as a **dim skeleton** (`.dual-skel`).
- Rendered by **`DualNodeSection.tsx`** (not `NodeSection`) inside **`AnnotationPanel.tsx`** (which also renders the **filter chips**). One row is a **dual block** (`.dual-block`); a note's prose is the **dual note** (`.dual-note`), with the inline colour as a `.dual-color` dot and `#tags`/glyphs in `.dual-meta`. The note body is rendered by **`NoteMarkdown.tsx`** (GFM + the `remarkSectionRefs` plugin from `lib/annotations/refs.ts`): bare `§1.1` / `§1.1_1` in note text auto-link to that block / inline highlight (`.xref`), dispatched through `NotesContext.scrollToSection` off the `sections` index built by `sectionIndex` (`lib/tree/dual.ts`).
- **Everything the old card drawer did now lives here.** Edit/remove are hover controls (`.dual-controls`); the pencil opens **`NoteEditor.tsx`** — body + colour swatches (inline) + tag editor + glyph toggle, saving via the same `upsert/updateInlineAnnotation` actions. **Filtering** (tag + glyph) uses the same `NotesContext` state the drawer used; `visibleDual` keeps matches + their ancestors. **Compose** a note on a skeleton/bare-highlight row via its add-note pencil, or from reading-first's node menu → `composeNode` force-includes the node (`forceIds`) with an open editor; the tree reacts to `editingId`/`composeNodeId` and calls `stopEditing()` when done.
- **Creating** new inline annotations stays reading-first only — the selection popover renders only while the reading panel is centred.
- **Cross-panel select + scroll:** `openAnnotation(id, nodeId)` embosses the node in both panels (`useActiveNode`) and `scrollPanels` scrolls each panel to it — panels are tagged `data-panel="reading"|"annotation"` so the (colliding) node ids resolve within the right one.
- Mode is client state in `ReadingWorkspace.tsx`, persisted to `localStorage["scholia:dualMode"]` (default off; mirrored after mount).

## Views (alternative renditions)

A **view** is a named second rendition of the same text — your own summary, a translation, another edition. Document-scoped (`layers` table); its per-node text is a `node_annotations` row carrying that `layer_id`.

- **Making one:** right-click a node → **"Create a view…"** opens `LayerModal` (name + one of six pastels, `LAYER_COLORS`). After it saves, the new view is auto-selected and its editor opens on the node you right-clicked (`LayerContext.created`). Right-click that node again and the menu now lists **"Add ⟨name⟩" / "Edit ⟨name⟩"** above "Create a view…" (`NodeMenu.tsx::MenuItems`).
- **Choosing what shows:** the **view bar** (`LayerBar.tsx`) is a multi-select pill above the centred panel, `(original|summary|french)`. Selection lives in `LayerContext` and persists to `localStorage["scholia:layers"]`. Default: original on, no alternatives. Right-click a chip → rename / delete the view. The bar renders **nothing** until a document has its first view; in annotation-first it drops the `original` chip (that slot is the note, and there is no original prose to switch off). In reading-first, switching `original` off hides the source passage on any node that *has* a selected view to read instead (`NodeSection`'s `hideOriginal`) — an untranslated node keeps its original rather than going blank, which also covers "every chip off".
- **Rendering:** `LayerBands.tsx` renders the selected views' text as tinted bands — under the passage in reading-first (`NodeSection`), under the note/skeleton in annotation-first (`DualNodeSection`). Bands carry **no name label**: the tint is the identifier, matched to the bar chip's fill (the name is a `title` on hover). Stacked bands glue into one block — the group rounds at its outer corners only, with a hairline between neighbours. A view with no text for that node is skipped (no empty bands). **Bands take no highlights and no comments** — annotations anchor to source offsets, and a rendition is not the source; only the original passage has `SourcePassage`.
- **Pruning:** in annotation-first, a selected view's text is enough to keep a note-less node in the tree — `visibleDual(..., {layerIds})`. Deselect the view in the bar and those rows prune back out. Tag/glyph filters still win: a view-only row has no tags.
- **Why its own context.** `LayerContext` is separate from `NotesContext` on purpose: `NotesContext` is split three ways by re-render cost so the book-sized tree subscribes only to never-changing actions, whereas *every* band must repaint when a chip toggles. Folding layers into it would make opening the drawer re-render the whole document. **ponytail ceiling:** a band subscribes per node via plain context; if a very large document stutters on a chip toggle, move `selected` to an external store like `CollapseContext`.

## Where the behaviour lives

Most "it doesn't react right" bugs are in a context, not a component.

| Symptom | Look here |
|---|---|
| drawer opens/closes/resizes wrong; wrong card selected; clicking a highlight does nothing | `components/NotesContext.tsx` |
| glyph filter narrows the list wrong; "All" doesn't clear it | `NotesContext.tsx` (`filterGlyphs`, `toggleFilterGlyph`, `clearFilters`) + `NotesDrawer.tsx` (`shown` predicate) |
| a `:summary` tag shows as a `#chip`, or a glyph won't render | `lib/annotations/glyphs.ts` (`glyphsInTags`, `displayTags`) |
| a new note opens in the wrong place in the feed, or not in its editor | `NotesDrawer.tsx` (`at`, `compareSections`) + `NotesContext.tsx` (`editingId`) |
| the note editor doesn't grow with the text, or grows without limit | `MarkdownTextarea.tsx` (JS height) + `.note-textarea` `max-height` (CSS cap) |
| folding/unfolding sections, Collapse/Expand children | `components/CollapseContext.tsx` |
| a view band won't show / won't hide; "Add ⟨view⟩" opens nothing; the view bar is empty | `components/LayerContext.tsx` (`selected`, `composing`, `sheet`) + `LayerBands.tsx` |
| a view's text vanishes from the annotation tree when a chip is off | `lib/tree/dual.ts::visibleDual` (`layerIds`) — that pruning is deliberate |
| reading column doesn't shift when a drawer opens | `ReadingChrome.tsx` (`--shift-left` / `--shift-right`, `data-mode`) |
| text size / line height / column width / highlight marks / section-id short↔long | `lib/reading/prefs.ts` + the pre-paint script in `app/layout.tsx` |
| highlight renders in the wrong place, overlaps look wrong | `lib/annotations/spans.ts::splitSpans` — the load-bearing one |
| section numbers / compound ids wrong (path, alias, short vs full) | `lib/tree/number.ts::idPaths` (ids come from `nodes.label`/`nodes.alias`, set at import by `lib/tree/ai-structure.ts` / `plan.ts`) |
| Markdown shortcuts in the note editor (Cmd+B, paste-to-link) | `components/MarkdownTextarea.tsx` |

`NotesContext` deliberately splits into three: **actions** (never changes — the prose tree consumes only this), **state** (drawer/filter — only drawer + chrome subscribe), and an **external store** for "which annotation is selected" so a single highlight re-renders alone. If you add a re-render, check which of the three you subscribed to.

## Where the styles live

All of it is one file, `app/globals.css`, in `/* ══ Section ══ */` blocks. Grep the banner, not a line number:

`Reading header` · `Preset glyph marks` · `Drawers (shared)` · `Notes drawer (right)` · `Annotation-first (dual) view` · `Library drawer (left)` · `Document info sheet` · `Views (alternative renditions)` · `Drawers on mobile: bottom / top sheets`

Two standing hazards:

- **Tailwind Preflight flattens everything.** Markdown rendered into `.note-cardbody` needs its elements explicitly re-styled — list markers, `code`, `pre`, `blockquote`, headings all had to be opted back in. Anything new that Markdown can emit will render unstyled by default.
- **Mobile is not a narrower desktop.** Under the mobile breakpoint the drawers become bottom/top sheets. Changing drawer geometry means changing two places.

## Routes

| Route | File | What it is |
|---|---|---|
| `/` | `app/page.tsx` | reading surface, no document, library open |
| `/d/[docId]` | `app/d/[docId]/page.tsx` | reading surface with a document |
| `/demo` | `app/demo/page.tsx` | public, **no auth / no DB**: one in-memory sample doc rendered `canEdit={false}`. Every feature is pre-seeded (tree, coloured/overlapping highlights, node + inline notes, glyphs, tags, §xrefs, two **views** — `paraphrase`, `français` — off until a chip is clicked). Owner chrome (edit/delete/export in `DocInfo`; the library `/d/[id]` link) is route-gated off here. Brand shows the **Demo badge**. |
| `/welcome` | `app/welcome/page.tsx` | "you need an invite" wall |
| `/invite/[token]` | `app/invite/[token]/page.tsx` | redeems an invite, redirects home |
| `/sign-in`, `/sign-up` | `app/sign-*/` | Clerk |
| `/api/import` | `app/api/import/route.ts` | server-side URL fetch + Readability |
| `/api/export/[docId]` | `app/api/export/[docId]/route.ts` | Markdown export (the doc info sheet's buttons) |

---

**Keeping this current is part of the change, not a follow-up.** Adding, removing, renaming, or moving a UI component means updating this file in the same commit — a stale map is worse than none, because it sends a cold-context agent to a file that no longer does the job.
