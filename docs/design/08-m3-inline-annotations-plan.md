# M3 — Inline Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the document owner draw pastel highlighter underlines over spans of the source text and attach a collapsed Markdown note + tags, with overlapping highlights fully reachable.

**Architecture:** Offsets are stored against the immutable `sources.text` (not node slices). Two pure helpers carry the mapping — `splitSpans` (text → overlap-aware render segments) and `rangeToOffsets` (DOM Selection → absolute offsets). `SourcePassage` renders segments as `<span data-source-id data-char-start>`; one global `SelectionPopover` creates annotations; a local `InlineNote` expands beneath the line to view/edit. Server Actions gate create on document read-access and edit/delete on authorship.

**Tech Stack:** Next.js 16 (App Router, RSC) · React 19 · Drizzle + Neon Postgres · Clerk · Vitest (jsdom) · Testing Library · react-markdown + remark-gfm.

Spec: [`07-m3-inline-annotations-design.md`](07-m3-inline-annotations-design.md).

## Global Constraints

- **Node.js 24 LTS**; **pnpm**; App Router, Server Components by default, client only for the annotation islands.
- **Palette:** black, white, and the four `--hl-*` pastels only. No other colors, no shadows-as-decoration, no rounded cards. Inline highlight = `border-bottom: 2px solid var(--hl-*)`; overlaps stack as additional box-shadow underlines a few px lower.
- **TDD:** every behavioral change starts with a failing test. Commit after each green step.
- **Immutable Source invariant:** no code path updates `sources.text`. Annotation offsets index into `sources.text` as half-open `[start, end)`.
- **Permission invariant:** every Server Action gates before mutating — create requires document read-access (owner today); edit/delete require `authorId === userId`.
- **Tests auto-load `.env.local`** via `vitest.setup.ts`; run with `pnpm test`. `pnpm db:push` migrates the schema (reads `.env.local`).
- **Deferred (do NOT build):** node annotations, threaded comments, author markers/filter, multi-source scoping, cross-node highlights (a selection is restricted to one node).

---

### Task 1: `inline_annotations` schema + migration

**Files:**
- Modify: `lib/db/schema.ts`
- Test: `lib/db/__tests__/inline-annotations-schema.test.ts`

**Interfaces:**
- Produces: `inlineAnnotations` Drizzle table. Columns: `id uuid pk`, `documentId uuid`, `sourceId uuid`, `authorId text`, `startOffset int`, `endOffset int`, `color text`, `note text|null`, `tags text[]`, `createdAt`, `updatedAt`. Consumed by Tasks 4 & 5.

- [ ] **Step 1: Add the table to `lib/db/schema.ts`**

Add `sql` to the `drizzle-orm` import at the top of the file:
```ts
import { sql } from "drizzle-orm";
```
Append after `nodeSourceRanges`:
```ts
export const inlineAnnotations = pgTable(
  "inline_annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    color: text("color").notNull(), // app-checked enum: yellow|pink|green|blue
    note: text("note"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    bySource: index("inline_annotations_source").on(t.sourceId),
    byAuthor: index("inline_annotations_doc_author").on(t.documentId, t.authorId),
    tagsGin: index("inline_annotations_tags_gin").using("gin", t.tags),
  }),
);
```

- [ ] **Step 2: Push the schema to the Neon test branch**

Run: `pnpm db:push`
Expected: prompts resolve to creating `inline_annotations`; completes without error.

- [ ] **Step 3: Write the failing round-trip + cascade test**

`lib/db/__tests__/inline-annotations-schema.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { users, documents, sources, inlineAnnotations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("inline_annotations schema", () => {
  const uid = "clerk_" + crypto.randomUUID();
  let docId = "";
  afterAll(async () => {
    if (docId) await db.delete(documents).where(eq(documents.id, docId)); // cascades annotations
    await db.delete(users).where(eq(users.id, uid));
  });

  it("inserts with defaults (empty tags, null note) and reads back", async () => {
    await db.insert(users).values({ id: uid, email: "a@b.c", displayName: "T" });
    const [doc] = await db.insert(documents).values({ ownerId: uid, title: "D" }).returning();
    docId = doc.id;
    const [src] = await db.insert(sources).values({ documentId: doc.id, position: 0, text: "Hello world." }).returning();

    const [ann] = await db.insert(inlineAnnotations).values({
      documentId: doc.id, sourceId: src.id, authorId: uid, startOffset: 0, endOffset: 5, color: "yellow",
    }).returning();

    expect(ann.tags).toEqual([]);
    expect(ann.note).toBeNull();
    expect(ann.color).toBe("yellow");
  });

  it("cascades: deleting the source removes its annotations", async () => {
    const [src2] = await db.insert(sources).values({ documentId: docId, position: 1, text: "Second." }).returning();
    await db.insert(inlineAnnotations).values({
      documentId: docId, sourceId: src2.id, authorId: uid, startOffset: 0, endOffset: 3, color: "pink",
    });
    await db.delete(sources).where(eq(sources.id, src2.id));
    const rows = await db.select().from(inlineAnnotations).where(eq(inlineAnnotations.sourceId, src2.id));
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm test lib/db/__tests__/inline-annotations-schema.test.ts`
Expected: PASS (2 tests). If `inlineAnnotations` is undefined, Step 1 export is missing; if a DB error, `pnpm db:push` (Step 2) did not run.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/__tests__/inline-annotations-schema.test.ts
git commit -m "feat: add inline_annotations schema"
```

---

### Task 2: `splitSpans` overlap engine + shared types

**Files:**
- Create: `lib/annotations/types.ts`, `lib/annotations/spans.ts`
- Test: `lib/annotations/__tests__/spans.test.ts`

**Interfaces:**
- Produces:
  - `type Color = "yellow" | "pink" | "green" | "blue"`; `const COLORS: Color[]`.
  - `interface InlineAnnotationView { id: string; startOffset: number; endOffset: number; color: Color; note: string | null; tags: string[]; authorId: string }`
  - `interface Segment { text: string; charStart: number; annotations: { id: string; color: Color }[] }`
  - `splitSpans(nodeText: string, nodeStart: number, annotations: InlineAnnotationView[]): Segment[]`
- Consumed by: Tasks 4 (types), 6 & 7 (spans + types).

- [ ] **Step 1: Create the shared types**

`lib/annotations/types.ts`:
```ts
export type Color = "yellow" | "pink" | "green" | "blue";
export const COLORS: Color[] = ["yellow", "pink", "green", "blue"];

/** An inline annotation shaped for rendering + editing; offsets are absolute into sources.text. */
export interface InlineAnnotationView {
  id: string;
  startOffset: number;
  endOffset: number;
  color: Color;
  note: string | null;
  tags: string[];
  authorId: string;
}
```

- [ ] **Step 2: Write the failing test**

`lib/annotations/__tests__/spans.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { splitSpans } from "@/lib/annotations/spans";
import type { InlineAnnotationView } from "@/lib/annotations/types";

function ann(id: string, startOffset: number, endOffset: number, color: InlineAnnotationView["color"] = "yellow"): InlineAnnotationView {
  return { id, startOffset, endOffset, color, note: null, tags: [], authorId: "u" };
}

describe("splitSpans", () => {
  it("returns one bare segment when there are no annotations", () => {
    const segs = splitSpans("abcdef", 0, []);
    expect(segs).toEqual([{ text: "abcdef", charStart: 0, annotations: [] }]);
  });

  it("splits adjacent (touching, non-overlapping) annotations", () => {
    const segs = splitSpans("abcdef", 0, [ann("a", 0, 2), ann("b", 2, 4)]);
    expect(segs.map((s) => [s.text, s.annotations.map((x) => x.id)])).toEqual([
      ["ab", ["a"]], ["cd", ["b"]], ["ef", []],
    ]);
  });

  it("marks the inner segment with both ids for nested annotations", () => {
    const segs = splitSpans("abcdef", 0, [ann("outer", 0, 6), ann("inner", 2, 4)]);
    expect(segs.map((s) => [s.text, s.annotations.map((x) => x.id)])).toEqual([
      ["ab", ["outer"]], ["cd", ["outer", "inner"]], ["ef", ["outer"]],
    ]);
  });

  it("marks the overlap region for partially overlapping annotations", () => {
    const segs = splitSpans("abcdef", 0, [ann("a", 0, 4), ann("b", 2, 6)]);
    expect(segs.map((s) => [s.text, s.annotations.map((x) => x.id)])).toEqual([
      ["ab", ["a"]], ["cd", ["a", "b"]], ["ef", ["b"]],
    ]);
  });

  it("clamps annotations to the node range and uses absolute charStart", () => {
    // node covers absolute [10, 16): text "abcdef"
    const segs = splitSpans("abcdef", 10, [ann("a", 8, 12), ann("b", 14, 20)]);
    expect(segs).toEqual([
      { text: "ab", charStart: 10, annotations: [{ id: "a", color: "yellow" }] },
      { text: "cd", charStart: 12, annotations: [] },
      { text: "ef", charStart: 14, annotations: [{ id: "b", color: "yellow" }] },
    ]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test lib/annotations/__tests__/spans.test.ts`
Expected: FAIL — `Cannot find module '@/lib/annotations/spans'`.

- [ ] **Step 4: Implement `splitSpans`**

`lib/annotations/spans.ts`:
```ts
import type { Color, InlineAnnotationView } from "./types";

export interface Segment {
  text: string;
  charStart: number; // absolute offset into sources.text
  annotations: { id: string; color: Color }[]; // [] = bare text; input order preserved (oldest→newest)
}

/**
 * Split a node's text into ordered, non-overlapping segments, each tagged with
 * the annotations covering it. `nodeStart` is the node's absolute start in
 * sources.text; annotations are clamped to [nodeStart, nodeStart + text.length).
 */
export function splitSpans(nodeText: string, nodeStart: number, annotations: InlineAnnotationView[]): Segment[] {
  const nodeEnd = nodeStart + nodeText.length;
  const points = new Set<number>([nodeStart, nodeEnd]);
  for (const a of annotations) {
    const s = Math.max(a.startOffset, nodeStart);
    const e = Math.min(a.endOffset, nodeEnd);
    if (s < e) { points.add(s); points.add(e); }
  }
  const sorted = [...points].sort((x, y) => x - y);

  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start >= end) continue;
    const covering = annotations
      .filter((a) => a.startOffset <= start && a.endOffset >= end)
      .map((a) => ({ id: a.id, color: a.color }));
    segments.push({ text: nodeText.slice(start - nodeStart, end - nodeStart), charStart: start, annotations: covering });
  }
  return segments;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test lib/annotations/__tests__/spans.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/annotations/types.ts lib/annotations/spans.ts lib/annotations/__tests__/spans.test.ts
git commit -m "feat: add splitSpans overlap engine and annotation types"
```

---

### Task 3: `rangeToOffsets` DOM→offset mapping (single-node restriction)

**Files:**
- Create: `lib/annotations/offsets.ts`
- Test: `lib/annotations/__tests__/offsets.test.ts`

**Interfaces:**
- Produces: `interface SourceRange { sourceId: string; startOffset: number; endOffset: number }`; `rangeToOffsets(range: Range, root: HTMLElement): SourceRange | null`. Returns `null` when collapsed, outside a source run, cross-source, or the endpoints resolve to different `[data-node-id]` ancestors. Consumed by Task 8.
- **Assumption:** every rendered text run is a `<span data-source-id data-char-start>` containing a single text node (guaranteed by `SourcePassage`, Task 6), so an endpoint's char offset within its run is `Number(run.dataset.charStart) + range.<start|end>Offset`.

- [ ] **Step 1: Write the failing test**

`lib/annotations/__tests__/offsets.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { rangeToOffsets } from "@/lib/annotations/offsets";

// Build a reading root: one node with two adjacent runs, plus a second node.
function build(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML =
    `<section data-node-id="n1">` +
      `<p><span data-source-id="s1" data-char-start="0">Hello </span>` +
      `<span data-source-id="s1" data-char-start="6">world</span></p>` +
    `</section>` +
    `<section data-node-id="n2">` +
      `<p><span data-source-id="s1" data-char-start="20">Next</span></p>` +
    `</section>`;
  document.body.appendChild(root);
  return root;
}

describe("rangeToOffsets", () => {
  let root: HTMLElement;
  beforeEach(() => { document.body.innerHTML = ""; root = build(); });

  const textOf = (charStart: number) =>
    root.querySelector<HTMLElement>(`[data-char-start="${charStart}"]`)!.firstChild!;

  it("maps a selection within one run to absolute offsets", () => {
    const r = document.createRange();
    r.setStart(textOf(0), 0); // "Hello " → H
    r.setEnd(textOf(0), 5);   // through "Hello"
    expect(rangeToOffsets(r, root)).toEqual({ sourceId: "s1", startOffset: 0, endOffset: 5 });
  });

  it("maps a selection spanning two runs in the SAME node", () => {
    const r = document.createRange();
    r.setStart(textOf(0), 0); // absolute 0
    r.setEnd(textOf(6), 5);   // 6 + 5 = 11
    expect(rangeToOffsets(r, root)).toEqual({ sourceId: "s1", startOffset: 0, endOffset: 11 });
  });

  it("returns null for a collapsed selection", () => {
    const r = document.createRange();
    r.setStart(textOf(0), 2); r.setEnd(textOf(0), 2);
    expect(rangeToOffsets(r, root)).toBeNull();
  });

  it("returns null when the selection crosses a node boundary", () => {
    const r = document.createRange();
    r.setStart(textOf(0), 0);  // node n1
    r.setEnd(textOf(20), 4);   // node n2
    expect(rangeToOffsets(r, root)).toBeNull();
  });

  it("returns null when an endpoint is outside any source run", () => {
    const outside = document.createElement("span");
    outside.textContent = "chrome";
    root.appendChild(outside);
    const r = document.createRange();
    r.setStart(outside.firstChild!, 0); r.setEnd(outside.firstChild!, 3);
    expect(rangeToOffsets(r, root)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/annotations/__tests__/offsets.test.ts`
Expected: FAIL — `Cannot find module '@/lib/annotations/offsets'`.

- [ ] **Step 3: Implement `rangeToOffsets`**

`lib/annotations/offsets.ts`:
```ts
export interface SourceRange {
  sourceId: string;
  startOffset: number;
  endOffset: number;
}

/** Nearest ancestor that is a source run (`data-source-id` + `data-char-start`). */
function runFor(node: Node | null): HTMLElement | null {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  while (el && !(el.dataset.sourceId !== undefined && el.dataset.charStart !== undefined)) {
    el = el.parentElement;
  }
  return el;
}

/**
 * Map a DOM Range to absolute source offsets, or null if it cannot be a valid
 * single-node, single-source inline annotation. Assumes each run holds one text
 * node (see SourcePassage), so the in-run offset is the Range's own offset.
 */
export function rangeToOffsets(range: Range, root: HTMLElement): SourceRange | null {
  if (range.collapsed) return null;

  const startRun = runFor(range.startContainer);
  const endRun = runFor(range.endContainer);
  if (!startRun || !endRun) return null;
  if (!root.contains(startRun) || !root.contains(endRun)) return null;

  const sourceId = startRun.dataset.sourceId!;
  if (endRun.dataset.sourceId !== sourceId) return null; // cross-source

  const startNode = startRun.closest("[data-node-id]");
  const endNode = endRun.closest("[data-node-id]");
  if (!startNode || startNode !== endNode) return null; // single-node restriction

  const startOffset = Number(startRun.dataset.charStart) + range.startOffset;
  const endOffset = Number(endRun.dataset.charStart) + range.endOffset;
  if (startOffset >= endOffset) return null;

  return { sourceId, startOffset, endOffset };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/annotations/__tests__/offsets.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/annotations/offsets.ts lib/annotations/__tests__/offsets.test.ts
git commit -m "feat: add rangeToOffsets DOM-to-source mapping"
```

---

### Task 4: Thread offsets + annotations through the read pipeline

**Files:**
- Modify: `lib/tree/build.ts`, `lib/data/documents.ts`
- Modify (fixtures, to keep type-check green): `lib/tree/__tests__/build.test.ts`, `components/__tests__/node-section.test.tsx`, `components/__tests__/reading-surface.test.tsx`
- Test: `lib/tree/__tests__/build.test.ts` (extend), `lib/actions/__tests__/tree-mutations.test.ts` is already covered — add a focused read test in `lib/actions/__tests__/annotations-read.test.ts`

**Interfaces:**
- Consumes: `InlineAnnotationView` (Task 2), `inlineAnnotations` (Task 1).
- Produces:
  - `NodeRange` gains `sourceId: string`.
  - `TreeNode` gains `sourceId: string`, `startOffset: number`, `annotations: InlineAnnotationView[]`.
  - `buildTree(nodes, ranges, sourceText, annotations?: InlineAnnotationView[])` attaches per-node `sourceId`/`startOffset` and the annotations intersecting each node's range.
  - `getDocument` returns the same shape; each `TreeNode` now carries its annotations (from the primary source, ordered oldest→newest).

- [ ] **Step 1: Extend `TreeNode`/`NodeRange` and `buildTree`**

In `lib/tree/build.ts`, add the import and update the interfaces + function:
```ts
import type { InlineAnnotationView } from "@/lib/annotations/types";

export interface NodeRow {
  id: string;
  parentId: string | null;
  position: number;
  label: string | null;
  title: string | null;
}

export interface NodeRange {
  nodeId: string;
  sourceId: string;
  startOffset: number;
  endOffset: number;
}

export interface TreeNode {
  id: string;
  label: string | null;
  title: string | null;
  text: string;
  sourceId: string;
  startOffset: number;
  annotations: InlineAnnotationView[];
  children: TreeNode[];
}

/** Fold flat node rows + source ranges (+ optional annotations) into a nested tree. */
export function buildTree(
  nodes: NodeRow[],
  ranges: NodeRange[],
  sourceText: string,
  annotations: InlineAnnotationView[] = [],
): TreeNode[] {
  const rangeById = new Map(ranges.map((r) => [r.nodeId, r]));

  const byId = new Map<string, TreeNode>();
  for (const n of nodes) {
    const r = rangeById.get(n.id);
    const startOffset = r?.startOffset ?? 0;
    const endOffset = r?.endOffset ?? 0;
    const nodeAnns = r
      ? annotations.filter((a) => a.startOffset < endOffset && a.endOffset > startOffset)
      : [];
    byId.set(n.id, {
      id: n.id,
      label: n.label,
      title: n.title,
      text: r ? sourceText.slice(r.startOffset, r.endOffset) : "",
      sourceId: r?.sourceId ?? "",
      startOffset,
      annotations: nodeAnns,
      children: [],
    });
  }

  const roots: TreeNode[] = [];
  const positionById = new Map(nodes.map((n) => [n.id, n.position]));
  for (const n of nodes) {
    const tn = byId.get(n.id)!;
    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(tn);
    else roots.push(tn);
  }

  const sortByPos = (a: TreeNode, b: TreeNode) => positionById.get(a.id)! - positionById.get(b.id)!;
  const sortRec = (list: TreeNode[]) => {
    list.sort(sortByPos);
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}
```

- [ ] **Step 2: Update `getDocument` to load + attach annotations**

In `lib/data/documents.ts`, add imports:
```ts
import { documents, sources, paragraphs, nodes, nodeSourceRanges, inlineAnnotations } from "@/lib/db/schema";
import type { Color, InlineAnnotationView } from "@/lib/annotations/types";
```
Replace the `rangeRows`/`tree` block with:
```ts
  const rangeRows = source
    ? await db.select().from(nodeSourceRanges).where(eq(nodeSourceRanges.sourceId, source.id))
    : [];
  const annRows = source
    ? await db
        .select()
        .from(inlineAnnotations)
        .where(eq(inlineAnnotations.sourceId, source.id))
        .orderBy(inlineAnnotations.createdAt) // oldest→newest: newest is the "top" underline
    : [];
  const annViews: InlineAnnotationView[] = annRows.map((a) => ({
    id: a.id,
    startOffset: a.startOffset,
    endOffset: a.endOffset,
    color: a.color as Color,
    note: a.note,
    tags: a.tags,
    authorId: a.authorId,
  }));
  const tree = source
    ? buildTree(
        nodeRows,
        rangeRows.map((r) => ({ nodeId: r.nodeId, sourceId: r.sourceId, startOffset: r.startOffset, endOffset: r.endOffset })),
        source.text,
        annViews,
      )
    : [];
```

- [ ] **Step 3: Update existing `TreeNode`/`NodeRange` fixtures so type-check passes**

In `lib/tree/__tests__/build.test.ts`, add `sourceId: "s1"` to each `NodeRange` literal (the `ranges` arrays). Existing assertions stay valid.

In `components/__tests__/node-section.test.tsx`, extend the `node` fixture (and its child) with the new required `TreeNode` fields:
```ts
const node: TreeNode = {
  id: "a", label: "1", title: null, text: "Parent prose.", sourceId: "s1", startOffset: 0, annotations: [],
  children: [{ id: "b", label: "1.1", title: null, text: "Child prose.", sourceId: "s1", startOffset: 100, annotations: [], children: [] }],
};
```

In `components/__tests__/reading-surface.test.tsx`, add `sourceId: "s1", startOffset: 0, annotations: []` to each `TreeNode` fixture.

- [ ] **Step 4: Add a `buildTree` annotation-attachment test**

Append to `lib/tree/__tests__/build.test.ts`:
```ts
import type { InlineAnnotationView } from "@/lib/annotations/types";

it("attaches only the annotations intersecting each node's range", () => {
  const nodes: NodeRow[] = [
    { id: "a", parentId: null, position: 0, label: null, title: null },
    { id: "b", parentId: null, position: 1, label: null, title: null },
  ];
  const ranges: NodeRange[] = [
    { nodeId: "a", sourceId: "s1", startOffset: 0, endOffset: 10 },
    { nodeId: "b", sourceId: "s1", startOffset: 11, endOffset: 22 },
  ];
  const anns: InlineAnnotationView[] = [
    { id: "x", startOffset: 2, endOffset: 6, color: "yellow", note: null, tags: [], authorId: "u" },  // in a
    { id: "y", startOffset: 12, endOffset: 15, color: "pink", note: null, tags: [], authorId: "u" },  // in b
  ];
  const tree = buildTree(nodes, ranges, "Root text. Child text.", anns);
  expect(tree[0].annotations.map((a) => a.id)).toEqual(["x"]);
  expect(tree[0].startOffset).toBe(0);
  expect(tree[0].sourceId).toBe("s1");
  expect(tree[1].annotations.map((a) => a.id)).toEqual(["y"]);
});
```

- [ ] **Step 5: Run the affected suites**

Run: `pnpm test lib/tree/__tests__/build.test.ts components/__tests__`
Expected: PASS (all build + component tests green; new attachment test passes).

- [ ] **Step 6: Write a read-side integration test**

`lib/actions/__tests__/annotations-read.test.ts`:
```ts
import { describe, it, expect, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { users, documents, inlineAnnotations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const userId = "clerk_" + crypto.randomUUID();
vi.mock("@/lib/auth/current-user", () => ({ requireUser: async () => ({ id: userId, displayName: "T" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createDocument } from "@/lib/actions/documents";
import { getDocument } from "@/lib/data/documents";

describe("getDocument attaches inline annotations", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await db.delete(documents).where(eq(documents.id, id));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("returns annotations on the node whose range they fall in", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const id = await createDocument({ title: "R", text: "First para.\n\nSecond para." });
    created.push(id);

    const before = await getDocument(id);
    const firstNode = before!.tree[0];
    // Highlight "First" (offsets 0..5 into the source) on the primary source.
    await db.insert(inlineAnnotations).values({
      documentId: id, sourceId: firstNode.sourceId, authorId: userId, startOffset: 0, endOffset: 5, color: "yellow",
    });

    const after = await getDocument(id);
    expect(after!.tree[0].annotations.map((a) => a.color)).toEqual(["yellow"]);
    expect(after!.tree[1].annotations).toEqual([]);
  });
});
```

- [ ] **Step 7: Run it**

Run: `pnpm test lib/actions/__tests__/annotations-read.test.ts`
Expected: PASS (1 test).

- [ ] **Step 8: Commit**

```bash
git add lib/tree/build.ts lib/data/documents.ts lib/tree/__tests__/build.test.ts components/__tests__ lib/actions/__tests__/annotations-read.test.ts
git commit -m "feat: thread source offsets and inline annotations through the read pipeline"
```

---

### Task 5: Server Actions — create / update / delete

**Files:**
- Create: `lib/actions/annotations.ts`
- Test: `lib/actions/__tests__/annotations.test.ts`

**Interfaces:**
- Consumes: `inlineAnnotations` (Task 1), `authorize` (`lib/auth/authorize.ts`), `requireUser`, `COLORS`/`Color` (Task 2).
- Produces (all `"use server"`):
  - `createInlineAnnotation(input: { documentId: string; sourceId: string; startOffset: number; endOffset: number; color: string }): Promise<string>` — returns the new id. Gates on `authorize` (owner today).
  - `updateInlineAnnotation(input: { id: string; note?: string | null; tags?: string[]; color?: string }): Promise<void>` — author-gated.
  - `deleteInlineAnnotation(id: string): Promise<void>` — author-gated.
- Follows the `loadOwnedNode` precedent in `lib/actions/tree.ts` with a local `loadOwnAnnotation` author gate. Consumed by Tasks 7 & 8.

- [ ] **Step 1: Write the failing integration test**

`lib/actions/__tests__/annotations.test.ts`:
```ts
import { describe, it, expect, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { users, documents, sources, inlineAnnotations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const userId = "clerk_" + crypto.randomUUID();
vi.mock("@/lib/auth/current-user", () => ({ requireUser: async () => ({ id: userId, displayName: "T" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createInlineAnnotation, updateInlineAnnotation, deleteInlineAnnotation } from "@/lib/actions/annotations";

describe("inline annotation actions", () => {
  const created: string[] = [];
  const foreign = "clerk_foreign_" + crypto.randomUUID();
  afterAll(async () => {
    for (const id of created) await db.delete(documents).where(eq(documents.id, id));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(users).where(eq(users.id, foreign));
  });

  async function ownDoc() {
    const [doc] = await db.insert(documents).values({ ownerId: userId, title: "D" }).returning();
    created.push(doc.id);
    const [src] = await db.insert(sources).values({ documentId: doc.id, position: 0, text: "Hello world." }).returning();
    return { docId: doc.id, sourceId: src.id };
  }

  it("creates, updates (note+tags), and deletes an annotation", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const { docId, sourceId } = await ownDoc();

    const id = await createInlineAnnotation({ documentId: docId, sourceId, startOffset: 0, endOffset: 5, color: "yellow" });
    let [row] = await db.select().from(inlineAnnotations).where(eq(inlineAnnotations.id, id));
    expect(row.color).toBe("yellow");

    await updateInlineAnnotation({ id, note: "**hi**", tags: ["metaphysics"], color: "green" });
    [row] = await db.select().from(inlineAnnotations).where(eq(inlineAnnotations.id, id));
    expect(row.note).toBe("**hi**");
    expect(row.tags).toEqual(["metaphysics"]);
    expect(row.color).toBe("green");

    await deleteInlineAnnotation(id);
    const rows = await db.select().from(inlineAnnotations).where(eq(inlineAnnotations.id, id));
    expect(rows).toEqual([]);
  });

  it("rejects an invalid color", async () => {
    const { docId, sourceId } = await ownDoc();
    await expect(
      createInlineAnnotation({ documentId: docId, sourceId, startOffset: 0, endOffset: 5, color: "purple" }),
    ).rejects.toThrow("Invalid color");
  });

  it("rejects a zero-length range", async () => {
    const { docId, sourceId } = await ownDoc();
    await expect(
      createInlineAnnotation({ documentId: docId, sourceId, startOffset: 3, endOffset: 3, color: "yellow" }),
    ).rejects.toThrow("Invalid range");
  });

  it("denies create on a document owned by someone else (Forbidden)", async () => {
    await db.insert(users).values({ id: foreign, email: "f@x.c", displayName: "F" });
    const [doc] = await db.insert(documents).values({ ownerId: foreign, title: "Theirs" }).returning();
    created.push(doc.id);
    const [src] = await db.insert(sources).values({ documentId: doc.id, position: 0, text: "x" }).returning();
    await expect(
      createInlineAnnotation({ documentId: doc.id, sourceId: src.id, startOffset: 0, endOffset: 1, color: "yellow" }),
    ).rejects.toThrow("Forbidden");
  });

  it("denies editing/deleting an annotation authored by someone else (Forbidden)", async () => {
    const [doc] = await db.insert(documents).values({ ownerId: foreign, title: "Theirs2" }).returning();
    created.push(doc.id);
    const [src] = await db.insert(sources).values({ documentId: doc.id, position: 0, text: "x" }).returning();
    const [ann] = await db.insert(inlineAnnotations)
      .values({ documentId: doc.id, sourceId: src.id, authorId: foreign, startOffset: 0, endOffset: 1, color: "yellow" })
      .returning();
    await expect(updateInlineAnnotation({ id: ann.id, note: "hi" })).rejects.toThrow("Forbidden");
    await expect(deleteInlineAnnotation(ann.id)).rejects.toThrow("Forbidden");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/actions/__tests__/annotations.test.ts`
Expected: FAIL — `Cannot find module '@/lib/actions/annotations'`.

- [ ] **Step 3: Implement the actions**

`lib/actions/annotations.ts`:
```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { inlineAnnotations } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { authorize } from "@/lib/auth/authorize";
import { COLORS, type Color } from "@/lib/annotations/types";

type AnnRow = typeof inlineAnnotations.$inferSelect;

function assertColor(c: string): asserts c is Color {
  if (!COLORS.includes(c as Color)) throw new Error("Invalid color");
}

/** Author gate for edit/delete — mirrors loadOwnedNode in tree.ts. */
async function loadOwnAnnotation(id: string): Promise<AnnRow> {
  const user = await requireUser();
  const [a] = await db.select().from(inlineAnnotations).where(eq(inlineAnnotations.id, id));
  if (!a) throw new Error("Not found");
  if (a.authorId !== user.id) throw new Error("Forbidden");
  return a;
}

export async function createInlineAnnotation(input: {
  documentId: string;
  sourceId: string;
  startOffset: number;
  endOffset: number;
  color: string;
}): Promise<string> {
  const user = await requireUser();
  await authorize(user.id, input.documentId, "annotate");
  assertColor(input.color);
  if (input.startOffset >= input.endOffset) throw new Error("Invalid range");

  const [row] = await db
    .insert(inlineAnnotations)
    .values({
      documentId: input.documentId,
      sourceId: input.sourceId,
      authorId: user.id,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      color: input.color,
    })
    .returning({ id: inlineAnnotations.id });
  revalidatePath(`/d/${input.documentId}`);
  return row.id;
}

export async function updateInlineAnnotation(input: {
  id: string;
  note?: string | null;
  tags?: string[];
  color?: string;
}): Promise<void> {
  const a = await loadOwnAnnotation(input.id);
  const set: Partial<AnnRow> = { updatedAt: new Date() };
  if (input.note !== undefined) set.note = input.note;
  if (input.tags !== undefined) set.tags = input.tags;
  if (input.color !== undefined) {
    assertColor(input.color);
    set.color = input.color;
  }
  await db.update(inlineAnnotations).set(set).where(eq(inlineAnnotations.id, a.id));
  revalidatePath(`/d/${a.documentId}`);
}

export async function deleteInlineAnnotation(id: string): Promise<void> {
  const a = await loadOwnAnnotation(id);
  await db.delete(inlineAnnotations).where(eq(inlineAnnotations.id, a.id));
  revalidatePath(`/d/${a.documentId}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/actions/__tests__/annotations.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/annotations.ts lib/actions/__tests__/annotations.test.ts
git commit -m "feat: add inline annotation create/update/delete server actions"
```

---

### Task 6: `SourcePassage` renders annotated spans

**Files:**
- Modify: `components/SourcePassage.tsx`, `components/NodeSection.tsx`, `app/globals.css`
- Test: `components/__tests__/source-passage.test.tsx`

**Interfaces:**
- Consumes: `splitSpans` + `InlineAnnotationView` (Task 2); `TreeNode` fields (Task 4).
- Produces: `SourcePassage({ text, sourceId, startOffset, annotations })` renders a `<p class="reading-p">` of `<span data-source-id data-char-start>`; annotated segments add class `hl` with `border-bottom` (top = last covering color) and stacked box-shadow underlines for the rest. No interactivity yet (Task 7 adds it).

- [ ] **Step 1: Write the failing component test**

`components/__tests__/source-passage.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SourcePassage } from "@/components/SourcePassage";
import type { InlineAnnotationView } from "@/lib/annotations/types";

const ann = (id: string, s: number, e: number, color: InlineAnnotationView["color"]): InlineAnnotationView => ({
  id, startOffset: s, endOffset: e, color, note: null, tags: [], authorId: "u",
});

describe("SourcePassage", () => {
  it("renders bare text with a data-char-start span", () => {
    const { container } = render(<SourcePassage text="Hello" sourceId="s1" startOffset={0} annotations={[]} />);
    const spans = container.querySelectorAll("span[data-char-start]");
    expect(spans).toHaveLength(1);
    expect(spans[0].getAttribute("data-source-id")).toBe("s1");
    expect(spans[0].textContent).toBe("Hello");
  });

  it("splits overlapping annotations into stacked highlight spans", () => {
    const anns = [ann("a", 0, 4, "yellow"), ann("b", 2, 6, "pink")];
    const { container } = render(<SourcePassage text="abcdef" sourceId="s1" startOffset={0} annotations={anns} />);
    const hls = container.querySelectorAll("span.hl");
    // segments: [0,2) a, [2,4) a+b, [4,6) b  → three highlighted spans
    expect(hls).toHaveLength(3);
    // the overlap segment carries a box-shadow (second underline)
    const overlap = Array.from(hls).find((s) => s.textContent === "cd")!;
    expect((overlap as HTMLElement).style.boxShadow).not.toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/__tests__/source-passage.test.tsx`
Expected: FAIL — `SourcePassage` still has the old `{ text }` signature (no `span.hl`).

- [ ] **Step 3: Rewrite `SourcePassage`**

`components/SourcePassage.tsx`:
```tsx
"use client";

import { splitSpans } from "@/lib/annotations/spans";
import type { InlineAnnotationView } from "@/lib/annotations/types";

export function SourcePassage({
  text,
  sourceId,
  startOffset,
  annotations,
}: {
  text: string;
  sourceId: string;
  startOffset: number;
  annotations: InlineAnnotationView[];
}) {
  const segments = splitSpans(text, startOffset, annotations);
  return (
    <p className="reading-p">
      {segments.map((seg, i) => {
        if (seg.annotations.length === 0) {
          return (
            <span key={i} data-source-id={sourceId} data-char-start={seg.charStart}>
              {seg.text}
            </span>
          );
        }
        const top = seg.annotations[seg.annotations.length - 1].color;
        const extra = seg.annotations.slice(0, -1);
        const boxShadow = extra.map((a, j) => `0 ${4 + j * 3}px 0 0 var(--hl-${a.color})`).join(", ");
        return (
          <span
            key={i}
            className="hl"
            data-source-id={sourceId}
            data-char-start={seg.charStart}
            style={{ borderBottom: `2px solid var(--hl-${top})`, boxShadow: boxShadow || undefined }}
          >
            {seg.text}
          </span>
        );
      })}
    </p>
  );
}
```

- [ ] **Step 4: Update `NodeSection` to pass the new props**

In `components/NodeSection.tsx`, replace the `SourcePassage` line:
```tsx
      {node.text && (
        <SourcePassage
          text={node.text}
          sourceId={node.sourceId}
          startOffset={node.startOffset}
          annotations={node.annotations}
        />
      )}
```

- [ ] **Step 5: Add highlight CSS**

Append to the reading section of `app/globals.css`:
```css
/* ── Inline annotations ──────────────────────────────────── */
.hl { cursor: pointer; }
```

- [ ] **Step 6: Run the component suites**

Run: `pnpm test components/__tests__`
Expected: PASS (source-passage + node-section + reading-surface all green).

- [ ] **Step 7: Commit**

```bash
git add components/SourcePassage.tsx components/NodeSection.tsx app/globals.css components/__tests__/source-passage.test.tsx
git commit -m "feat: render inline annotations as stacked highlight spans"
```

---

### Task 7: `InlineNote` — expand, edit, delete, overlap picker

**Files:**
- Modify: `package.json` (deps), `components/SourcePassage.tsx`, `components/NodeSection.tsx`, `app/globals.css`
- Create: `components/InlineNote.tsx`
- Test: `components/__tests__/inline-note.test.tsx`, extend `components/__tests__/source-passage.test.tsx`

**Interfaces:**
- Consumes: `updateInlineAnnotation`, `deleteInlineAnnotation` (Task 5); `InlineAnnotationView`, `COLORS` (Task 2).
- Produces:
  - `InlineNote({ annotation, canEdit, onClose })` — collapsed-note viewer (react-markdown) + owner editor (note textarea, tag add/remove, recolor swatches, delete).
  - `SourcePassage` gains `canEdit: boolean`; clicking a highlighted span opens that annotation's `InlineNote` beneath the paragraph; a span covered by >1 annotation opens a picker first.
  - `NodeSection` passes `canEdit` to `SourcePassage`.

- [ ] **Step 1: Add Markdown dependencies**

Run: `pnpm add react-markdown remark-gfm`
Expected: both added to `dependencies`.

- [ ] **Step 2: Write the failing `InlineNote` test**

`components/__tests__/inline-note.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InlineNote } from "@/components/InlineNote";
import type { InlineAnnotationView } from "@/lib/annotations/types";

const update = vi.fn(async () => {});
const remove = vi.fn(async () => {});
vi.mock("@/lib/actions/annotations", () => ({
  updateInlineAnnotation: (...a: unknown[]) => update(...a),
  deleteInlineAnnotation: (...a: unknown[]) => remove(...a),
}));

const withNote: InlineAnnotationView = {
  id: "x", startOffset: 0, endOffset: 5, color: "yellow", note: "**bold** note", tags: ["tag1"], authorId: "u",
};

describe("InlineNote", () => {
  it("renders the Markdown note and tags in view mode", () => {
    render(<InlineNote annotation={withNote} canEdit={false} onClose={() => {}} />);
    expect(screen.getByText("bold").tagName.toLowerCase()).toBe("strong");
    expect(screen.getByText("tag1")).toBeDefined();
  });

  it("saves an edited note when canEdit", () => {
    render(<InlineNote annotation={withNote} canEdit onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByPlaceholderText("Note (Markdown)…"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(update).toHaveBeenCalledWith({ id: "x", note: "changed", tags: ["tag1"] });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test components/__tests__/inline-note.test.tsx`
Expected: FAIL — `Cannot find module '@/components/InlineNote'`.

- [ ] **Step 4: Implement `InlineNote`**

`components/InlineNote.tsx`:
```tsx
"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { COLORS, type InlineAnnotationView } from "@/lib/annotations/types";
import { updateInlineAnnotation, deleteInlineAnnotation } from "@/lib/actions/annotations";

export function InlineNote({
  annotation,
  canEdit,
  onClose,
}: {
  annotation: InlineAnnotationView;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(canEdit && !annotation.note);
  const [note, setNote] = useState(annotation.note ?? "");
  const [tags, setTags] = useState<string[]>(annotation.tags);
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }
  async function save() {
    setBusy(true);
    await updateInlineAnnotation({ id: annotation.id, note: note.trim() || null, tags });
    setBusy(false);
    setEditing(false);
  }
  async function remove() {
    setBusy(true);
    await deleteInlineAnnotation(annotation.id);
    onClose();
  }

  return (
    <aside className="inline-note" data-annotation-id={annotation.id}>
      {editing ? (
        <>
          <textarea
            className="textarea note-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (Markdown)…"
          />
          <div className="note-colors">
            {COLORS.map((c) => (
              <button
                key={c}
                className="swatch"
                aria-label={`Recolor ${c}`}
                style={{ background: `var(--hl-${c})` }}
                onClick={() => updateInlineAnnotation({ id: annotation.id, color: c })}
              />
            ))}
          </div>
          <div className="note-tags">
            {tags.map((t) => (
              <button key={t} className="tag" onClick={() => setTags(tags.filter((x) => x !== t))}>
                {t} ×
              </button>
            ))}
            <input
              className="tag-input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="tag"
            />
          </div>
          <div className="note-actions">
            <button className="btn" disabled={busy} onClick={save}>Save</button>
            <button className="link-btn" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
            <button className="link-btn" disabled={busy} onClick={remove}>Delete</button>
          </div>
        </>
      ) : (
        <>
          <div className="note-body">
            {annotation.note ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{annotation.note}</ReactMarkdown>
            ) : (
              <span className="muted">No note.</span>
            )}
          </div>
          {annotation.tags.length > 0 && (
            <div className="note-tags">
              {annotation.tags.map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
          )}
          <div className="note-actions">
            {canEdit && (
              <button className="link-btn" onClick={() => setEditing(true)}>Edit</button>
            )}
            <button className="link-btn" onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 5: Run the `InlineNote` test**

Run: `pnpm test components/__tests__/inline-note.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Wire click-to-open + picker into `SourcePassage`**

Rewrite `components/SourcePassage.tsx` to add local open/picker state (keeps the same span rendering):
```tsx
"use client";

import { useState } from "react";
import { splitSpans } from "@/lib/annotations/spans";
import type { InlineAnnotationView } from "@/lib/annotations/types";
import { InlineNote } from "./InlineNote";

export function SourcePassage({
  text,
  sourceId,
  startOffset,
  annotations,
  canEdit,
}: {
  text: string;
  sourceId: string;
  startOffset: number;
  annotations: InlineAnnotationView[];
  canEdit: boolean;
}) {
  const segments = splitSpans(text, startOffset, annotations);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picker, setPicker] = useState<string[] | null>(null); // annotation ids to choose from

  const byId = new Map(annotations.map((a) => [a.id, a]));

  function onSpanClick(ids: string[]) {
    setPicker(null);
    if (ids.length === 1) setOpenId(ids[0]);
    else setPicker(ids);
  }

  const open = openId ? byId.get(openId) : undefined;

  return (
    <>
      <p className="reading-p">
        {segments.map((seg, i) => {
          if (seg.annotations.length === 0) {
            return (
              <span key={i} data-source-id={sourceId} data-char-start={seg.charStart}>
                {seg.text}
              </span>
            );
          }
          const top = seg.annotations[seg.annotations.length - 1].color;
          const extra = seg.annotations.slice(0, -1);
          const boxShadow = extra.map((a, j) => `0 ${4 + j * 3}px 0 0 var(--hl-${a.color})`).join(", ");
          const ids = seg.annotations.map((a) => a.id);
          return (
            <span
              key={i}
              className="hl"
              data-source-id={sourceId}
              data-char-start={seg.charStart}
              style={{ borderBottom: `2px solid var(--hl-${top})`, boxShadow: boxShadow || undefined }}
              onClick={() => onSpanClick(ids)}
            >
              {seg.text}
            </span>
          );
        })}
      </p>

      {picker && (
        <div className="note-picker">
          <span className="muted">Overlapping notes:</span>
          {picker.map((id) => {
            const a = byId.get(id)!;
            return (
              <button key={id} className="link-btn" onClick={() => { setOpenId(id); setPicker(null); }}>
                {a.note ? a.note.slice(0, 24) : `(${a.color} highlight)`}
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <InlineNote annotation={open} canEdit={canEdit} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}
```

- [ ] **Step 7: Pass `canEdit` from `NodeSection`**

In `components/NodeSection.tsx`, add `canEdit={canEdit}` to the `SourcePassage` element:
```tsx
      {node.text && (
        <SourcePassage
          text={node.text}
          sourceId={node.sourceId}
          startOffset={node.startOffset}
          annotations={node.annotations}
          canEdit={canEdit}
        />
      )}
```

- [ ] **Step 8: Extend the `SourcePassage` test for open + picker**

Append to `components/__tests__/source-passage.test.tsx`:
```tsx
import { screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@/lib/actions/annotations", () => ({
  updateInlineAnnotation: async () => {},
  deleteInlineAnnotation: async () => {},
}));

it("opens a note when a single-annotation span is clicked", () => {
  const anns = [ann("a", 0, 4, "yellow")];
  render(<SourcePassage text="abcdef" sourceId="s1" startOffset={0} annotations={anns} canEdit={false} />);
  fireEvent.click(screen.getByText("abcd"));
  expect(document.querySelector(".inline-note")).not.toBeNull();
});

it("shows a picker when an overlapping span is clicked", () => {
  const anns = [ann("a", 0, 4, "yellow"), ann("b", 2, 6, "pink")];
  render(<SourcePassage text="abcdef" sourceId="s1" startOffset={0} annotations={anns} canEdit={false} />);
  fireEvent.click(screen.getByText("cd")); // overlap region: two annotations
  expect(document.querySelector(".note-picker")).not.toBeNull();
});
```
Update the two existing tests in this file to pass `canEdit={false}` to `SourcePassage` (the prop is now required).

- [ ] **Step 9: Add note/picker CSS**

Append to `app/globals.css`:
```css
.inline-note { border-left: 2px solid var(--rule); margin: 0.4rem 0 0.75rem 0.5rem; padding: 0.35rem 0.6rem; font-family: var(--mono, ui-monospace, monospace); font-size: 0.85rem; }
.note-body :is(p, ul, ol) { margin: 0 0 0.35rem; }
.note-actions { display: flex; gap: 0.75rem; margin-top: 0.35rem; }
.link-btn { background: none; border: none; color: var(--muted); cursor: pointer; padding: 0; font-size: 0.8rem; text-decoration: underline; }
.link-btn:hover { color: var(--ink); }
.note-colors { display: flex; gap: 0.35rem; margin-bottom: 0.4rem; }
.note-tags { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; margin-bottom: 0.35rem; }
.tag { background: none; border: 1px solid var(--rule); color: var(--muted); font-size: 0.75rem; padding: 0.05rem 0.35rem; cursor: default; }
.tag-input { border: none; border-bottom: 1px solid var(--rule); background: var(--paper); font-size: 0.75rem; outline: none; width: 5rem; }
.swatch { width: 1rem; height: 1rem; border: 1px solid var(--rule); cursor: pointer; padding: 0; }
.note-picker { border-left: 2px solid var(--rule); margin: 0.4rem 0 0.5rem 0.5rem; padding: 0.3rem 0.6rem; display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start; }
.note-textarea { min-height: 4rem; }
```

- [ ] **Step 10: Run the component suites**

Run: `pnpm test components/__tests__`
Expected: PASS (inline-note + source-passage open/picker + node-section + reading-surface all green).

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml components/InlineNote.tsx components/SourcePassage.tsx components/NodeSection.tsx app/globals.css components/__tests__/inline-note.test.tsx components/__tests__/source-passage.test.tsx
git commit -m "feat: add inline note view/edit with overlap picker"
```

---

### Task 8: `SelectionPopover` — select → color → create

**Files:**
- Create: `components/SelectionPopover.tsx`
- Modify: `components/ReadingSurface.tsx`, `app/d/[docId]/page.tsx`, `components/__tests__/reading-surface.test.tsx`, `app/globals.css`
- Test: `components/__tests__/selection-popover.test.tsx`

**Interfaces:**
- Consumes: `rangeToOffsets` (Task 3), `createInlineAnnotation` (Task 5), `COLORS`/`Color` (Task 2).
- Produces: `SelectionPopover({ documentId, rootId })` — one global instance; on `mouseup` it maps the current selection via `rangeToOffsets`, shows a fixed-position swatch row, and a swatch click calls `createInlineAnnotation`. `ReadingSurface` gains `documentId` and mounts it against `id="reading-root"`.

- [ ] **Step 1: Write the failing test**

`components/__tests__/selection-popover.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SelectionPopover } from "@/components/SelectionPopover";

const create = vi.fn(async () => "new-id");
vi.mock("@/lib/actions/annotations", () => ({ createInlineAnnotation: (...a: unknown[]) => create(...a) }));

// A reading root with a single-node source run.
function mountRoot(): HTMLElement {
  const root = document.createElement("div");
  root.id = "reading-root";
  root.innerHTML =
    `<section data-node-id="n1"><p>` +
      `<span data-source-id="s1" data-char-start="0">Hello world</span>` +
    `</p></section>`;
  document.body.appendChild(root);
  return root;
}

describe("SelectionPopover", () => {
  beforeEach(() => { document.body.innerHTML = ""; create.mockClear(); });

  it("renders nothing without a selection", () => {
    mountRoot();
    const { container } = render(<SelectionPopover documentId="d1" rootId="reading-root" />);
    expect(container.querySelector(".selection-popover")).toBeNull();
  });

  it("shows swatches on a valid selection and creates on click", () => {
    const root = mountRoot();
    render(<SelectionPopover documentId="d1" rootId="reading-root" />);

    const textNode = root.querySelector('[data-char-start="0"]')!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5); // "Hello"
    vi.spyOn(window, "getSelection").mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => range,
      removeAllRanges: () => {},
    } as unknown as Selection);

    fireEvent.mouseUp(document);

    const swatches = document.querySelectorAll(".selection-popover .swatch");
    expect(swatches.length).toBe(4);

    fireEvent.click(swatches[0]); // yellow
    expect(create).toHaveBeenCalledWith({ documentId: "d1", sourceId: "s1", startOffset: 0, endOffset: 5, color: "yellow" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/__tests__/selection-popover.test.tsx`
Expected: FAIL — `Cannot find module '@/components/SelectionPopover'`.

- [ ] **Step 3: Implement `SelectionPopover`**

`components/SelectionPopover.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, type Color } from "@/lib/annotations/types";
import { rangeToOffsets, type SourceRange } from "@/lib/annotations/offsets";
import { createInlineAnnotation } from "@/lib/actions/annotations";

export function SelectionPopover({ documentId, rootId }: { documentId: string; rootId: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const pending = useRef<SourceRange | null>(null);

  useEffect(() => {
    function onMouseUp() {
      const root = document.getElementById(rootId);
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0) {
        setPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const mapped = rangeToOffsets(range, root);
      if (!mapped) {
        setPos(null);
        pending.current = null;
        return;
      }
      const rect = range.getBoundingClientRect();
      pending.current = mapped;
      setPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [rootId]);

  async function pick(color: Color) {
    if (!pending.current) return;
    await createInlineAnnotation({ documentId, ...pending.current, color });
    window.getSelection()?.removeAllRanges();
    pending.current = null;
    setPos(null);
  }

  if (!pos) return null;
  return (
    <div
      className="selection-popover"
      style={{ position: "fixed", left: pos.x, top: pos.y, transform: "translate(-50%, -100%)" }}
    >
      {COLORS.map((c) => (
        <button
          key={c}
          className="swatch"
          aria-label={`Highlight ${c}`}
          style={{ background: `var(--hl-${c})` }}
          onMouseDown={(e) => e.preventDefault()} // keep the text selection alive through the click
          onClick={() => pick(c)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/__tests__/selection-popover.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount it in `ReadingSurface`**

`components/ReadingSurface.tsx`:
```tsx
import { NodeSection } from "./NodeSection";
import { SelectionPopover } from "./SelectionPopover";
import type { TreeNode } from "@/lib/tree/build";

export function ReadingSurface({
  title,
  tree,
  canEdit,
  documentId,
}: {
  title: string;
  tree: TreeNode[];
  canEdit: boolean;
  documentId: string;
}) {
  return (
    <>
      <article id="reading-root" className="reading">
        <h1 className="reading-title">{title}</h1>
        {tree.map((node) => (
          <NodeSection key={node.id} node={node} depth={0} canEdit={canEdit} />
        ))}
      </article>
      <SelectionPopover documentId={documentId} rootId="reading-root" />
    </>
  );
}
```

- [ ] **Step 6: Pass `documentId` from the page**

In `app/d/[docId]/page.tsx`, update the render:
```tsx
    <main className="page">
      <ReadingSurface title={data.doc.title} tree={data.tree} canEdit documentId={data.doc.id} />
    </main>
```

- [ ] **Step 7: Update the `ReadingSurface` test for the new prop**

In `components/__tests__/reading-surface.test.tsx`, add `documentId="d1"` to the `ReadingSurface` render call(s).

- [ ] **Step 8: Add popover CSS**

Append to `app/globals.css`:
```css
.selection-popover { display: flex; gap: 0.35rem; background: var(--paper); border: 1px solid var(--rule); padding: 0.3rem; z-index: 20; }
```

- [ ] **Step 9: Run the component suites**

Run: `pnpm test components/__tests__`
Expected: PASS (selection-popover + reading-surface + all others green).

- [ ] **Step 10: Commit**

```bash
git add components/SelectionPopover.tsx components/ReadingSurface.tsx "app/d/[docId]/page.tsx" components/__tests__/reading-surface.test.tsx components/__tests__/selection-popover.test.tsx app/globals.css
git commit -m "feat: add global selection popover to create inline highlights"
```

---

### Task 9: Full-suite verification, build, and progress update

**Files:**
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Produces: a green full suite, a clean production build, and an updated progress ledger. No new runtime code.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all prior tests plus the new spans/offsets/schema/actions/read/component/popover tests (green).

- [ ] **Step 2: Type-check + production build**

Run: `pnpm build`
Expected: build succeeds, no type errors. (Confirms the `TreeNode`/`SourcePassage`/`ReadingSurface` prop changes are consistent across every call site.)

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Record the milestone in the progress ledger**

Append an `## Milestone 3 — Inline Annotations` section to `.superpowers/sdd/progress.md` listing the 9 tasks, the commit range, "N tests green, build clean", and the human TODO below.

- [ ] **Step 5: Commit**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs: record M3 inline annotations progress"
```

- [ ] **Step 6: Push to `development`**

```bash
git push origin development
```
Expected: Vercel Git integration auto-deploys the `development` branch.

**Human TODO (browser, cannot be verified headless):** on the live URL, sign in as the doc owner, select a phrase → confirm the swatch popover → pick a color → confirm the underline persists on reload; click it → add a Markdown note + tag → save → reload; overlap two highlights → confirm the picker reaches each; delete one → confirm it disappears; confirm a selection crossing a node boundary shows no popover.

---

## Self-Review

**Spec coverage:**
- `inline_annotations` schema → Task 1. ✓
- `splitSpans` overlap engine (adjacent/nested/overlapping/clamp) → Task 2. ✓
- `rangeToOffsets` incl. single-node restriction + collapsed/outside/cross-source → Task 3. ✓
- Offsets against immutable `sources.text`; `TreeNode` gains `sourceId`/`startOffset`; `getDocument` loads+attaches annotations (primary source, oldest→newest) → Task 4. ✓
- Server Actions create/update/delete; create gated on read-access, edit/delete on authorship; color enum + range validation → Task 5. ✓
- Span rendering with `data-*` attributes + stacked underlines → Task 6. ✓
- `InlineNote` collapsed view (react-markdown) + owner editor (note/tags/recolor/delete) + overlap picker → Task 7. ✓
- Global `SelectionPopover` (color-first create, single-node) → Task 8. ✓
- Full-suite/build/deploy + human browser TODO → Task 9. ✓
- Deferred items (node annotations, threads, author filter, multi-source, cross-node) → not built, per Global Constraints. ✓

**Placeholder scan:** every code and test step carries complete code; every run step names the command and expected result. No TBD/TODO.

**Type consistency:** `Color`/`COLORS`/`InlineAnnotationView` (Task 2) are used identically in Tasks 4–8; `Segment` (Task 2) matches its use in Task 6/7; `SourceRange` (Task 3) matches `SelectionPopover` (Task 8); `createInlineAnnotation`/`updateInlineAnnotation`/`deleteInlineAnnotation` signatures (Task 5) match every call site; `TreeNode`'s new fields (Task 4) match `SourcePassage`/`NodeSection`/`ReadingSurface` props (Tasks 6–8) and all fixture updates.
