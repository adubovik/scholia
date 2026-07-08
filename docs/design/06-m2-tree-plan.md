# Scholia M2 — Tree — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the flat M1 reading surface into a node tree — import auto-creates one node per paragraph (decimal-nested for Tractatus, flat otherwise), the reader renders nested collapsible sections, and the owner restructures with indent / outdent / move controls.

**Architecture:** Extends M1 (Next.js 16 App Router · Neon + Drizzle · Clerk · Tailwind v4 · Vitest). Adds `nodes` + `node_source_ranges` tables; two pure tree modules (`plan` = write side, `build` = read side) plus a decimal-numbering parser; a thin `authorize()` owner-gate; owner-only tree-mutation Server Actions; and a recursive `NodeSection` renderer. Prose is never touched — nodes reference offsets into the immutable Source. See [`05-m2-tree-design.md`](05-m2-tree-design.md).

**Tech Stack additions:** `tsx` (dev-only, to run the one-shot backfill script); `dotenv` (already installed) for the script's env.

## Global Constraints

- All M0 + M1 Global Constraints still apply (Node 24, App Router, pnpm, secrets via env only; austere palette — black/white + four highlighter pastels, no shadows/rounded cards; TDD, commit per green step; **immutable `sources.text`**; **neon-http has NO interactive transactions** — generate ids in app code and use **`db.batch([...])`**; owner-gating via `requireUser()`).
- **One prose node per paragraph.** Import creates exactly one `node` per paragraph. A node's prose is that paragraph; nesting/reordering rewrites only `parent_id`/`position`.
- **Nodes reference offsets, never copies.** A `node_source_ranges` row stores offsets into the immutable `sources.text`. For a numbered node the range starts **past** the label token so the number renders once (as chrome), not twice.
- **Every tree mutation authorizes first.** Each Server Action in `lib/actions/tree.ts` calls `authorize(userId, docId, "editTree")` before writing. In M2 that means owner-only (no `memberships` yet; M5 extends the same helper).
- **Restructure-only scope.** No create-empty-node, no rename, no delete. Collapse state is **ephemeral** client `useState` — no schema, no persistence.
- **Positions are compact `0..n`** within each `(document_id, parent_id)` sibling group; renumber affected groups after every structural change.

---

### Task 1: Schema — `nodes` + `node_source_ranges`

**Files:**
- Modify: `lib/db/schema.ts`
- Test: `lib/db/__tests__/nodes-schema.test.ts`

**Interfaces:**
- Consumes: `documents`, `sources`, `paragraphs` (M1).
- Produces: `nodes`, `nodeSourceRanges` Drizzle tables; migration via `pnpm db:push`.

- [ ] **Step 1: Add tables to `lib/db/schema.ts`**

Extend the import line and append the two tables (keep everything existing):
```ts
import { pgTable, text, timestamp, uuid, boolean, integer, unique, index } from "drizzle-orm/pg-core";

// (existing users / documents / sources / paragraphs stay as-is)

export const nodes = pgTable(
  "nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"), // self-ref, app-enforced (matches documents.clonedFrom pattern)
    position: integer("position").notNull(),
    label: text("label"),
    title: text("title"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({ byParent: index("nodes_doc_parent_pos").on(t.documentId, t.parentId, t.position) }),
);

export const nodeSourceRanges = pgTable(
  "node_source_ranges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nodeId: uuid("node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    startParagraphId: uuid("start_paragraph_id").notNull().references(() => paragraphs.id, { onDelete: "cascade" }),
    startOffset: integer("start_offset").notNull(),
    endParagraphId: uuid("end_paragraph_id").notNull().references(() => paragraphs.id, { onDelete: "cascade" }),
    endOffset: integer("end_offset").notNull(),
  },
  (t) => ({ nodeSourceUnique: unique("node_source_ranges_node_source").on(t.nodeId, t.sourceId) }),
);
```

- [ ] **Step 2: Push the migration**

Run: `pnpm db:push`
Expected: `nodes` and `node_source_ranges` tables created; no errors.

- [ ] **Step 3: Write the failing round-trip test**

`lib/db/__tests__/nodes-schema.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { users, documents, sources, paragraphs, nodes, nodeSourceRanges } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("nodes schema", () => {
  const userId = "clerk_" + crypto.randomUUID();
  let docId = "";
  afterAll(async () => {
    if (docId) await db.delete(documents).where(eq(documents.id, docId)); // cascades to sources/paragraphs/nodes/ranges
    await db.delete(users).where(eq(users.id, userId));
  });

  it("stores a node with a source range and cascades on document delete", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const [doc] = await db.insert(documents).values({ ownerId: userId, title: "Doc" }).returning();
    docId = doc.id;
    const [src] = await db.insert(sources)
      .values({ documentId: doc.id, isPrimary: true, position: 0, text: "Hello world" }).returning();
    const [para] = await db.insert(paragraphs)
      .values({ sourceId: src.id, position: 0, charStart: 0, charEnd: 11 }).returning();
    const [node] = await db.insert(nodes)
      .values({ documentId: doc.id, parentId: null, position: 0, label: "1", title: null }).returning();
    await db.insert(nodeSourceRanges).values({
      nodeId: node.id, sourceId: src.id,
      startParagraphId: para.id, startOffset: 0, endParagraphId: para.id, endOffset: 11,
    });

    const ranges = await db.select().from(nodeSourceRanges).where(eq(nodeSourceRanges.nodeId, node.id));
    expect(ranges).toHaveLength(1);
    expect(src.text.slice(ranges[0].startOffset, ranges[0].endOffset)).toBe("Hello world");
  });
});
```

- [ ] **Step 4: Run — expect fail before Steps 1/2, pass after**

Run: `pnpm test lib/db/__tests__/nodes-schema.test.ts`
Expected: PASS once the tables exist.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/__tests__/nodes-schema.test.ts
git commit -m "feat: add nodes and node_source_ranges schema"
```

---

### Task 2: Numbering parser (`parseNumberedTree`)

**Files:**
- Create: `lib/tree/numbering.ts`
- Test: `lib/tree/__tests__/numbering.test.ts`

**Interfaces:**
- Produces:
  - `interface NumberedRelation { paragraphIndex: number; label: string; parentLabel: string | null; proseStart: number }`
  - `parseNumberedTree(paragraphs: { text: string }[]): NumberedRelation[] | null` — `null` when the text is not a clean numbered structure. Consumed by Task 3 (`planNodes`).

- [ ] **Step 1: Write the failing tests**

`lib/tree/__tests__/numbering.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseNumberedTree } from "@/lib/tree/numbering";

const P = (...texts: string[]) => texts.map((text) => ({ text }));

describe("parseNumberedTree", () => {
  it("builds Tractatus decimal nesting, climbing to the nearest existing ancestor", () => {
    const rels = parseNumberedTree(P(
      "1 The world is all that is the case.",
      "1.1 The world is the totality of facts.",
      "1.11 The facts in logical space are the world.",
      "1.2 The world divides into facts.",
      "2 What is the case is a fact.",
      "2.01 An atomic fact is a combination of objects.",
    ));
    expect(rels).not.toBeNull();
    const byLabel = Object.fromEntries(rels!.map((r) => [r.label, r.parentLabel]));
    expect(byLabel).toEqual({
      "1": null,
      "1.1": "1",
      "1.11": "1.1",
      "1.2": "1",
      "2": null,
      "2.01": "2", // 2.0 absent → climb to 2
    });
  });

  it("reports proseStart just past the label token", () => {
    const rels = parseNumberedTree(P("1.1 The world."))!;
    expect(rels[0].proseStart).toBe(4); // "1.1 ".length
    expect("1.1 The world.".slice(rels[0].proseStart)).toBe("The world.");
  });

  it("returns null for ordinary prose (not every paragraph is numbered)", () => {
    expect(parseNumberedTree(P("1 A numbered line.", "Then a plain paragraph."))).toBeNull();
  });

  it("returns null for multi-dot section numbering (out of scope)", () => {
    expect(parseNumberedTree(P("1 A.", "1.2.3 B."))).toBeNull();
  });

  it("returns null on duplicate labels", () => {
    expect(parseNumberedTree(P("1 A.", "1 B."))).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test lib/tree/__tests__/numbering.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/tree/numbering.ts`**

```ts
export interface NumberedRelation {
  paragraphIndex: number;
  label: string;
  parentLabel: string | null;
  proseStart: number;
}

const LABEL = /^(\d+(?:\.\d+)*)(\s+)/;

/** Ancestors of a single-dot decimal label, nearest first, ending at the integer root. */
function ancestorChain(label: string): string[] {
  const dot = label.indexOf(".");
  if (dot === -1) return []; // integer label: no ancestors
  const intPart = label.slice(0, dot);
  let frac = label.slice(dot + 1);
  const chain: string[] = [];
  while (frac.length > 1) {
    frac = frac.slice(0, -1);
    chain.push(intPart + "." + frac);
  }
  chain.push(intPart);
  return chain;
}

/**
 * Parse Tractatus-style decimal numbering into parent/child relations, or null
 * when the paragraphs are not a clean numbered structure. Numbered mode requires
 * every paragraph to carry a leading label, no label with more than one dot, and
 * no duplicate labels. The parent is the nearest ancestor that actually appears.
 */
export function parseNumberedTree(paragraphs: { text: string }[]): NumberedRelation[] | null {
  if (paragraphs.length === 0) return null;

  const matched: { label: string; proseStart: number }[] = [];
  for (const p of paragraphs) {
    const m = LABEL.exec(p.text);
    if (!m) return null;                 // a paragraph without a label → flat
    const label = m[1];
    if (label.indexOf(".") !== label.lastIndexOf(".")) return null; // >1 dot → out of scope
    matched.push({ label, proseStart: m[0].length });
  }

  const labelSet = new Set<string>();
  for (const { label } of matched) {
    if (labelSet.has(label)) return null; // duplicate → ambiguous
    labelSet.add(label);
  }

  return matched.map(({ label, proseStart }, paragraphIndex) => {
    const parentLabel = ancestorChain(label).find((a) => labelSet.has(a)) ?? null;
    return { paragraphIndex, label, parentLabel, proseStart };
  });
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm test lib/tree/__tests__/numbering.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/tree/numbering.ts lib/tree/__tests__/numbering.test.ts
git commit -m "feat: add Tractatus decimal-numbering parser"
```

---

### Task 3: Node planner (write side) — `planNodes`

**Files:**
- Create: `lib/tree/plan.ts`
- Test: `lib/tree/__tests__/plan.test.ts`

**Interfaces:**
- Consumes: `parseNumberedTree` (Task 2).
- Produces:
  - `interface ParaInput { start: number; end: number; text: string }`
  - `interface PlannedNode { id: string; parentId: string | null; position: number; label: string | null; title: string | null; paragraphIndex: number; startOffset: number; endOffset: number }`
  - `planNodes(paras: ParaInput[], newId: () => string): PlannedNode[]` — one PlannedNode per paragraph, nested by numbering when detected, flat otherwise. Consumed by Task 5 (`createDocument`) and Task 8 (backfill).

- [ ] **Step 1: Write the failing tests**

`lib/tree/__tests__/plan.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { planNodes, type ParaInput } from "@/lib/tree/plan";

// Deterministic ids: n0, n1, n2, ... in paragraph order.
function counter() {
  let i = 0;
  return () => `n${i++}`;
}

// Build ParaInput[] with contiguous offsets separated by a 2-char gap ("\n\n").
function paras(...texts: string[]): ParaInput[] {
  const out: ParaInput[] = [];
  let cursor = 0;
  for (const text of texts) {
    out.push({ start: cursor, end: cursor + text.length, text });
    cursor += text.length + 2;
  }
  return out;
}

describe("planNodes", () => {
  it("flat text → one top-level node per paragraph, whole-paragraph ranges", () => {
    const input = paras("First.", "Second.");
    const nodes = planNodes(input, counter());
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.parentId)).toEqual([null, null]);
    expect(nodes.map((n) => n.position)).toEqual([0, 1]);
    expect(nodes.map((n) => n.label)).toEqual([null, null]);
    expect(nodes[0]).toMatchObject({ id: "n0", startOffset: input[0].start, endOffset: input[0].end });
    expect(nodes[1]).toMatchObject({ id: "n1", startOffset: input[1].start, endOffset: input[1].end });
  });

  it("numbered text → nested nodes, labels set, range starts past the label", () => {
    const input = paras("1 A.", "1.1 B.", "1.2 C.", "2 D.");
    const nodes = planNodes(input, counter());
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    // ids follow paragraph order: n0="1", n1="1.1", n2="1.2", n3="2"
    expect(byId["n0"]).toMatchObject({ label: "1", parentId: null, position: 0 });
    expect(byId["n1"]).toMatchObject({ label: "1.1", parentId: "n0", position: 0 });
    expect(byId["n2"]).toMatchObject({ label: "1.2", parentId: "n0", position: 1 });
    expect(byId["n3"]).toMatchObject({ label: "2", parentId: null, position: 1 });
    // "1.1 B." → prose starts at offset 4 within the paragraph
    expect(byId["n1"].startOffset).toBe(input[1].start + 4);
    expect(byId["n1"].endOffset).toBe(input[1].end);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test lib/tree/__tests__/plan.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/tree/plan.ts`**

```ts
import { parseNumberedTree } from "./numbering";

export interface ParaInput {
  start: number;
  end: number;
  text: string;
}

export interface PlannedNode {
  id: string;
  parentId: string | null;
  position: number;
  label: string | null;
  title: string | null;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
}

/**
 * Plan one node per paragraph. When `parseNumberedTree` detects a clean numbered
 * structure the nodes are nested by label (range started past the label token);
 * otherwise every node is top-level with a whole-paragraph range. Ids come from
 * `newId` so callers control uuid generation (and tests stay deterministic).
 */
export function planNodes(paras: ParaInput[], newId: () => string): PlannedNode[] {
  const ids = paras.map(() => newId());
  const rels = parseNumberedTree(paras);
  const position = new Map<string, number>();
  const nextPosition = (parentId: string | null) => {
    const key = parentId ?? "\0root";
    const n = position.get(key) ?? 0;
    position.set(key, n + 1);
    return n;
  };

  if (rels === null) {
    return paras.map((p, i) => ({
      id: ids[i], parentId: null, position: nextPosition(null),
      label: null, title: null, paragraphIndex: i, startOffset: p.start, endOffset: p.end,
    }));
  }

  const idByLabel = new Map<string, string>();
  rels.forEach((r) => idByLabel.set(r.label, ids[r.paragraphIndex]));

  return rels.map((r) => {
    const parentId = r.parentLabel ? idByLabel.get(r.parentLabel)! : null;
    const p = paras[r.paragraphIndex];
    return {
      id: ids[r.paragraphIndex], parentId, position: nextPosition(parentId),
      label: r.label, title: null, paragraphIndex: r.paragraphIndex,
      startOffset: p.start + r.proseStart, endOffset: p.end,
    };
  });
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm test lib/tree/__tests__/plan.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add lib/tree/plan.ts lib/tree/__tests__/plan.test.ts
git commit -m "feat: add node planner for import (flat + numbered)"
```

---

### Task 4: Tree build (read side) — `buildTree`

**Files:**
- Create: `lib/tree/build.ts`
- Test: `lib/tree/__tests__/build.test.ts`

**Interfaces:**
- Produces:
  - `interface NodeRow { id: string; parentId: string | null; position: number; label: string | null; title: string | null }`
  - `interface NodeRange { nodeId: string; startOffset: number; endOffset: number }`
  - `interface TreeNode { id: string; label: string | null; title: string | null; text: string; children: TreeNode[] }`
  - `buildTree(nodes: NodeRow[], ranges: NodeRange[], sourceText: string): TreeNode[]` — top-level nodes, each with resolved text and ordered children. Consumed by Task 5 (`getDocument`) and Task 7 (rendering).

- [ ] **Step 1: Write the failing tests**

`lib/tree/__tests__/build.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildTree, type NodeRow, type NodeRange } from "@/lib/tree/build";

const SRC = "Root text. Child text.";

describe("buildTree", () => {
  it("nests children under parents, ordered by position, with resolved text", () => {
    const nodes: NodeRow[] = [
      { id: "b", parentId: "a", position: 1, label: "1.2", title: null },
      { id: "a", parentId: null, position: 0, label: "1", title: null },
      { id: "c", parentId: "a", position: 0, label: "1.1", title: null },
    ];
    const ranges: NodeRange[] = [
      { nodeId: "a", startOffset: 0, endOffset: 10 },   // "Root text."
      { nodeId: "c", startOffset: 11, endOffset: 22 },  // "Child text."
      { nodeId: "b", startOffset: 11, endOffset: 22 },
    ];
    const tree = buildTree(nodes, ranges, SRC);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("a");
    expect(tree[0].text).toBe("Root text.");
    // children ordered by position: c (0) before b (1)
    expect(tree[0].children.map((n) => n.id)).toEqual(["c", "b"]);
    expect(tree[0].children[0].text).toBe("Child text.");
  });

  it("orders multiple roots by position", () => {
    const nodes: NodeRow[] = [
      { id: "y", parentId: null, position: 1, label: "2", title: null },
      { id: "x", parentId: null, position: 0, label: "1", title: null },
    ];
    const tree = buildTree(nodes, [], SRC);
    expect(tree.map((n) => n.id)).toEqual(["x", "y"]);
    expect(tree[0].text).toBe(""); // no range → empty text
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test lib/tree/__tests__/build.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/tree/build.ts`**

```ts
export interface NodeRow {
  id: string;
  parentId: string | null;
  position: number;
  label: string | null;
  title: string | null;
}

export interface NodeRange {
  nodeId: string;
  startOffset: number;
  endOffset: number;
}

export interface TreeNode {
  id: string;
  label: string | null;
  title: string | null;
  text: string;
  children: TreeNode[];
}

/** Fold flat node rows + their source ranges into an ordered nested tree. */
export function buildTree(nodes: NodeRow[], ranges: NodeRange[], sourceText: string): TreeNode[] {
  const textById = new Map<string, string>();
  for (const r of ranges) textById.set(r.nodeId, sourceText.slice(r.startOffset, r.endOffset));

  const byId = new Map<string, TreeNode>();
  for (const n of nodes) {
    byId.set(n.id, { id: n.id, label: n.label, title: n.title, text: textById.get(n.id) ?? "", children: [] });
  }

  const roots: TreeNode[] = [];
  const positionById = new Map(nodes.map((n) => [n.id, n.position]));
  for (const n of nodes) {
    const tn = byId.get(n.id)!;
    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(tn);
    else roots.push(tn);
  }

  const sortByPos = (a: TreeNode, b: TreeNode) => (positionById.get(a.id)! - positionById.get(b.id)!);
  const sortRec = (list: TreeNode[]) => {
    list.sort(sortByPos);
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm test lib/tree/__tests__/build.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add lib/tree/build.ts lib/tree/__tests__/build.test.ts
git commit -m "feat: add flat-rows-to-nested tree builder"
```

---

### Task 5: Import creates nodes + `getDocument` returns the tree

**Files:**
- Modify: `lib/actions/documents.ts` (create nodes + ranges on import)
- Modify: `lib/data/documents.ts` (load nodes + ranges, build tree)
- Test: `lib/actions/__tests__/tree-import.test.ts`

**Interfaces:**
- Consumes: `planNodes` (Task 3), `buildTree` (Task 4), schema tables (Task 1), `requireUser` (M0).
- Produces:
  - `createDocument` unchanged signature, now also writes `nodes` + `node_source_ranges`.
  - `getDocument(docId)` now returns `{ doc, source, paragraphs, tree: TreeNode[] }` (adds `tree`; other fields unchanged).

- [ ] **Step 1: Write the failing integration test**

`lib/actions/__tests__/tree-import.test.ts`:
```ts
import { describe, it, expect, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { users, documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const userId = "clerk_" + crypto.randomUUID();
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: async () => ({ id: userId, displayName: "T" }),
}));

import { createDocument } from "@/lib/actions/documents";
import { getDocument } from "@/lib/data/documents";

describe("import builds nodes", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await db.delete(documents).where(eq(documents.id, id));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("flat paste → one top-level node per paragraph", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const id = await createDocument({ title: "Russell", text: "One.\n\nTwo." });
    created.push(id);

    const got = await getDocument(id);
    expect(got!.tree).toHaveLength(2);
    expect(got!.tree.map((n) => n.text)).toEqual(["One.", "Two."]);
    expect(got!.tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it("Tractatus paste → decimal nesting with labels and clean prose", async () => {
    const id = await createDocument({
      title: "Tractatus",
      text: "1 The world is all that is the case.\n\n1.1 The world is the totality of facts.\n\n2 A fact.",
    });
    created.push(id);

    const got = await getDocument(id);
    expect(got!.tree.map((n) => n.label)).toEqual(["1", "2"]);
    const one = got!.tree[0];
    expect(one.children.map((n) => n.label)).toEqual(["1.1"]);
    // range starts past the label → prose has no leading number
    expect(one.children[0].text).toBe("The world is the totality of facts.");
    expect(one.text).toBe("The world is all that is the case.");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test lib/actions/__tests__/tree-import.test.ts`
Expected: FAIL (`tree` undefined / nodes not created).

- [ ] **Step 3: Update `lib/actions/documents.ts` to write nodes + ranges**

Replace the file with (adds `nodes`/`nodeSourceRanges` inserts via `planNodes`, keeping the M1 doc/source/paragraph inserts and the single `db.batch`):
```ts
"use server";

import { db } from "@/lib/db";
import { documents, sources, paragraphs, nodes, nodeSourceRanges } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { normalizeText, paragraphize } from "@/lib/import/paragraphs";
import { planNodes } from "@/lib/tree/plan";

export async function createDocument(input: {
  title: string;
  language?: string;
  label?: string;
  text: string;
}): Promise<string> {
  const user = await requireUser();
  const normalized = normalizeText(input.text);
  const paras = paragraphize(normalized);

  const docId = crypto.randomUUID();
  const srcId = crypto.randomUUID();
  const paraIds = paras.map(() => crypto.randomUUID());

  const statements: any[] = [
    db.insert(documents).values({ id: docId, ownerId: user.id, title: input.title }),
    db.insert(sources).values({
      id: srcId, documentId: docId, language: input.language ?? null,
      label: input.label ?? null, isPrimary: true, position: 0, text: normalized,
    }),
  ];

  if (paras.length > 0) {
    statements.push(
      db.insert(paragraphs).values(
        paras.map((p, i) => ({ id: paraIds[i], sourceId: srcId, position: i, charStart: p.start, charEnd: p.end })),
      ),
    );

    const planned = planNodes(
      paras.map((p) => ({ start: p.start, end: p.end, text: p.text })),
      () => crypto.randomUUID(),
    );
    statements.push(
      db.insert(nodes).values(
        planned.map((n) => ({
          id: n.id, documentId: docId, parentId: n.parentId, position: n.position, label: n.label, title: n.title,
        })),
      ),
      db.insert(nodeSourceRanges).values(
        planned.map((n) => ({
          nodeId: n.id, sourceId: srcId,
          startParagraphId: paraIds[n.paragraphIndex], startOffset: n.startOffset,
          endParagraphId: paraIds[n.paragraphIndex], endOffset: n.endOffset,
        })),
      ),
    );
  }

  // neon-http has no interactive transactions; batch is a single atomic round-trip.
  await db.batch(statements as [any, ...any[]]);
  return docId;
}
```

- [ ] **Step 4: Update `lib/data/documents.ts` to load + build the tree**

Replace `getDocument` (keep `listDocuments` as-is):
```ts
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, sources, paragraphs, nodes, nodeSourceRanges } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { buildTree } from "@/lib/tree/build";

export async function listDocuments() {
  const user = await requireUser();
  return db
    .select({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt })
    .from(documents)
    .where(eq(documents.ownerId, user.id))
    .orderBy(desc(documents.updatedAt));
}

export async function getDocument(docId: string) {
  const user = await requireUser();
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.ownerId, user.id)));
  if (!doc) return null;

  const src = await db
    .select().from(sources).where(eq(sources.documentId, doc.id)).orderBy(sources.position);
  const source = src[0] ?? null;
  const paras = source
    ? await db.select().from(paragraphs).where(eq(paragraphs.sourceId, source.id)).orderBy(paragraphs.position)
    : [];

  const nodeRows = await db.select().from(nodes).where(eq(nodes.documentId, doc.id)).orderBy(nodes.position);
  const rangeRows = source
    ? await db.select().from(nodeSourceRanges).where(eq(nodeSourceRanges.sourceId, source.id))
    : [];
  const tree = source
    ? buildTree(
        nodeRows,
        rangeRows.map((r) => ({ nodeId: r.nodeId, startOffset: r.startOffset, endOffset: r.endOffset })),
        source.text,
      )
    : [];

  return { doc, source, paragraphs: paras, tree };
}
```

- [ ] **Step 5: Run the new test + the existing M1 suite — expect pass**

Run: `pnpm test lib/actions/__tests__/tree-import.test.ts lib/actions/__tests__/documents.test.ts`
Expected: PASS (new tree tests green; the M1 `documents.test.ts` still green — it only asserts `paragraphs`/`source`, which are unchanged).

- [ ] **Step 6: Commit**

```bash
git add lib/actions/documents.ts lib/data/documents.ts lib/actions/__tests__/tree-import.test.ts
git commit -m "feat: build node tree on import and return it from getDocument"
```

---

### Task 6: `authorize` owner-gate

**Files:**
- Create: `lib/auth/authorize.ts`
- Test: `lib/auth/__tests__/authorize.test.ts`

**Interfaces:**
- Consumes: `db`, `documents` (M1).
- Produces: `authorize(userId: string, docId: string, action: string): Promise<void>` — resolves ownership; throws `Error("Forbidden")` for a non-owner or missing doc. `action` is accepted for forward-compatibility (M5 role matrix) but M2 gates on ownership only. Consumed by Task 7 (tree actions).

- [ ] **Step 1: Write the failing test**

`lib/auth/__tests__/authorize.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { users, documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/authorize";

describe("authorize", () => {
  const owner = "clerk_owner_" + crypto.randomUUID();
  const other = "clerk_other_" + crypto.randomUUID();
  let docId = "";
  afterAll(async () => {
    if (docId) await db.delete(documents).where(eq(documents.id, docId));
    await db.delete(users).where(eq(users.id, owner));
    await db.delete(users).where(eq(users.id, other));
  });

  it("resolves for the owner and throws for anyone else", async () => {
    await db.insert(users).values([
      { id: owner, email: "o@x.c", displayName: "O" },
      { id: other, email: "e@x.c", displayName: "E" },
    ]);
    const [doc] = await db.insert(documents).values({ ownerId: owner, title: "D" }).returning();
    docId = doc.id;

    await expect(authorize(owner, docId, "editTree")).resolves.toBeUndefined();
    await expect(authorize(other, docId, "editTree")).rejects.toThrow("Forbidden");
    await expect(authorize(owner, crypto.randomUUID(), "editTree")).rejects.toThrow("Forbidden");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test lib/auth/__tests__/authorize.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/auth/authorize.ts`**

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";

/**
 * Gate a mutation on a document. M2: owner-only (no memberships yet). M5 will
 * extend this with the collaborator role matrix, keyed off `action`.
 */
export async function authorize(userId: string, docId: string, _action: string): Promise<void> {
  const [doc] = await db
    .select({ ownerId: documents.ownerId })
    .from(documents)
    .where(eq(documents.id, docId));
  if (!doc || doc.ownerId !== userId) throw new Error("Forbidden");
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm test lib/auth/__tests__/authorize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/authorize.ts lib/auth/__tests__/authorize.test.ts
git commit -m "feat: add owner-only authorize gate"
```

---

### Task 7: Tree-mutation Server Actions (indent / outdent / move)

**Files:**
- Create: `lib/actions/tree.ts` (`"use server"`)
- Test: `lib/actions/__tests__/tree-mutations.test.ts`

**Interfaces:**
- Consumes: `authorize` (Task 6), `requireUser` (M0), `nodes`/`documents` (Task 1), `getDocument` for verification.
- Produces (all `(nodeId: string): Promise<void>`, owner-gated, `revalidatePath` the doc):
  - `indentNode` — nest under the immediate previous sibling.
  - `outdentNode` — become a sibling of the parent, just after it.
  - `moveNodeUp` / `moveNodeDown` — swap with the adjacent sibling.

- [ ] **Step 1: Write the failing integration test**

`lib/actions/__tests__/tree-mutations.test.ts`:
```ts
import { describe, it, expect, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { users, documents, nodes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const userId = "clerk_" + crypto.randomUUID();
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: async () => ({ id: userId, displayName: "T" }),
}));
// next/cache revalidatePath is a no-op outside a request scope.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createDocument } from "@/lib/actions/documents";
import { getDocument } from "@/lib/data/documents";
import { indentNode, moveNodeDown } from "@/lib/actions/tree";

describe("tree mutations", () => {
  const created: string[] = [];
  const foreignUser = "clerk_foreign_" + crypto.randomUUID();
  afterAll(async () => {
    for (const id of created) await db.delete(documents).where(eq(documents.id, id));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(users).where(eq(users.id, foreignUser));
  });

  it("indents a node under its previous sibling and persists", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const id = await createDocument({ title: "R", text: "One.\n\nTwo.\n\nThree." });
    created.push(id);

    const before = await getDocument(id);
    const second = before!.tree[1]; // "Two."
    await indentNode(second.id);

    const after = await getDocument(id);
    expect(after!.tree.map((n) => n.text)).toEqual(["One.", "Three."]); // "Two." left top level
    expect(after!.tree[0].children.map((n) => n.text)).toEqual(["Two."]);
  });

  it("moves a node down among its siblings", async () => {
    const id = await createDocument({ title: "R2", text: "A.\n\nB.\n\nC." });
    created.push(id);
    const before = await getDocument(id);
    await moveNodeDown(before!.tree[0].id); // A. → after B.

    const after = await getDocument(id);
    expect(after!.tree.map((n) => n.text)).toEqual(["B.", "A.", "C."]);
  });

  it("denies a non-owner (Forbidden)", async () => {
    await db.insert(users).values({ id: foreignUser, email: "f@x.c", displayName: "F" });
    const [doc] = await db.insert(documents).values({ ownerId: foreignUser, title: "Theirs" }).returning();
    created.push(doc.id);
    const [node] = await db.insert(nodes)
      .values({ documentId: doc.id, parentId: null, position: 0, label: null, title: null }).returning();

    await expect(indentNode(node.id)).rejects.toThrow("Forbidden");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test lib/actions/__tests__/tree-mutations.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/actions/tree.ts`**

```ts
"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { documents, nodes } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { authorize } from "@/lib/auth/authorize";

type NodeRow = typeof nodes.$inferSelect;

async function siblingsOf(documentId: string, parentId: string | null): Promise<NodeRow[]> {
  return db
    .select()
    .from(nodes)
    .where(and(eq(nodes.documentId, documentId), parentId === null ? isNull(nodes.parentId) : eq(nodes.parentId, parentId)))
    .orderBy(nodes.position);
}

function renumber(list: { id: string }[]) {
  return list.map((n, i) => db.update(nodes).set({ position: i }).where(eq(nodes.id, n.id)));
}

async function loadOwnedNode(nodeId: string): Promise<NodeRow> {
  const user = await requireUser();
  const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
  if (!node) throw new Error("Not found");
  await authorize(user.id, node.documentId, "editTree");
  return node;
}

const touchDoc = (documentId: string) =>
  db.update(documents).set({ updatedAt: new Date() }).where(eq(documents.id, documentId));

export async function indentNode(nodeId: string): Promise<void> {
  const node = await loadOwnedNode(nodeId);
  const siblings = await siblingsOf(node.documentId, node.parentId);
  const idx = siblings.findIndex((s) => s.id === node.id);
  if (idx <= 0) return; // first among siblings → nothing to nest under

  const prev = siblings[idx - 1];
  const prevChildren = await siblingsOf(node.documentId, prev.id);
  const remaining = siblings.filter((s) => s.id !== node.id);

  await db.batch([
    db.update(nodes).set({ parentId: prev.id, position: prevChildren.length }).where(eq(nodes.id, node.id)),
    ...renumber(remaining),
    touchDoc(node.documentId),
  ] as [any, ...any[]]);
  revalidatePath(`/d/${node.documentId}`);
}

export async function outdentNode(nodeId: string): Promise<void> {
  const node = await loadOwnedNode(nodeId);
  if (node.parentId === null) return; // already top-level

  const [parent] = await db.select().from(nodes).where(eq(nodes.id, node.parentId));
  const grandSiblings = await siblingsOf(node.documentId, parent.parentId);
  const oldSiblings = await siblingsOf(node.documentId, node.parentId);

  const parentIdx = grandSiblings.findIndex((s) => s.id === parent.id);
  const newOrder = [
    ...grandSiblings.slice(0, parentIdx + 1),
    node,
    ...grandSiblings.slice(parentIdx + 1),
  ];
  const remaining = oldSiblings.filter((s) => s.id !== node.id);

  await db.batch([
    db.update(nodes).set({ parentId: parent.parentId }).where(eq(nodes.id, node.id)),
    ...renumber(newOrder),  // includes node at its new slot
    ...renumber(remaining), // compact the group it left
    touchDoc(node.documentId),
  ] as [any, ...any[]]);
  revalidatePath(`/d/${node.documentId}`);
}

async function swap(nodeId: string, dir: -1 | 1): Promise<void> {
  const node = await loadOwnedNode(nodeId);
  const siblings = await siblingsOf(node.documentId, node.parentId);
  const idx = siblings.findIndex((s) => s.id === node.id);
  const j = idx + dir;
  if (j < 0 || j >= siblings.length) return; // at a boundary

  const other = siblings[j];
  await db.batch([
    db.update(nodes).set({ position: other.position }).where(eq(nodes.id, node.id)),
    db.update(nodes).set({ position: node.position }).where(eq(nodes.id, other.id)),
    touchDoc(node.documentId),
  ] as [any, ...any[]]);
  revalidatePath(`/d/${node.documentId}`);
}

export async function moveNodeUp(nodeId: string): Promise<void> {
  await swap(nodeId, -1);
}

export async function moveNodeDown(nodeId: string): Promise<void> {
  await swap(nodeId, 1);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm test lib/actions/__tests__/tree-mutations.test.ts`
Expected: PASS (indent, move-down, and Forbidden cases).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/tree.ts lib/actions/__tests__/tree-mutations.test.ts
git commit -m "feat: add owner-gated tree restructure actions"
```

---

### Task 8: Render the tree (ReadingSurface / NodeSection / TreeEditControls)

**Files:**
- Modify: `components/ReadingSurface.tsx` (render tree, not flat paragraphs)
- Create: `components/NodeSection.tsx` (client, recursive), `components/TreeEditControls.tsx` (client)
- Modify: `app/d/[docId]/page.tsx` (pass `tree` + `canEdit`)
- Modify: `app/globals.css` (node/tree classes)
- Replace test: `components/__tests__/reading-surface.test.tsx`; Create: `components/__tests__/node-section.test.tsx`

**Interfaces:**
- Consumes: `TreeNode` (Task 4), the four actions in `lib/actions/tree.ts` (Task 7), `getDocument` (Task 5), `SourcePassage` (M1).
- Produces: `ReadingSurface({ title, tree, canEdit })`; `NodeSection({ node, depth, canEdit })`; `TreeEditControls({ nodeId })`.

- [ ] **Step 1: Replace `components/__tests__/reading-surface.test.tsx`**

The M1 test used the old flat props; rewrite it for the tree shape:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadingSurface } from "@/components/ReadingSurface";
import type { TreeNode } from "@/lib/tree/build";

const tree: TreeNode[] = [
  {
    id: "a", label: "1", title: null, text: "Root prose.",
    children: [{ id: "b", label: "1.1", title: null, text: "Child prose.", children: [] }],
  },
];

describe("ReadingSurface", () => {
  it("renders the title, node labels, and nested prose", () => {
    render(<ReadingSurface title="Tractatus" tree={tree} canEdit={false} />);
    expect(screen.getByRole("heading", { name: "Tractatus" })).toBeDefined();
    expect(screen.getByText("Root prose.")).toBeDefined();
    expect(screen.getByText("Child prose.")).toBeDefined();
    expect(screen.getByText("1.1")).toBeDefined();
  });
});
```

- [ ] **Step 2: Write the failing `NodeSection` test**

`components/__tests__/node-section.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeSection } from "@/components/NodeSection";
import type { TreeNode } from "@/lib/tree/build";

const node: TreeNode = {
  id: "a", label: "1", title: null, text: "Parent prose.",
  children: [{ id: "b", label: "1.1", title: null, text: "Child prose.", children: [] }],
};

describe("NodeSection", () => {
  it("toggles child visibility when the collapse glyph is clicked", () => {
    render(<NodeSection node={node} depth={0} canEdit={false} />);
    expect(screen.getByText("Child prose.")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByText("Child prose.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Child prose.")).toBeDefined();
  });
});
```

- [ ] **Step 3: Run — expect fail**

Run: `pnpm test components/__tests__/node-section.test.tsx`
Expected: FAIL (component not found).

- [ ] **Step 4: Implement `components/TreeEditControls.tsx`**

```tsx
"use client";

import { indentNode, outdentNode, moveNodeUp, moveNodeDown } from "@/lib/actions/tree";

export function TreeEditControls({ nodeId }: { nodeId: string }) {
  return (
    <span className="tree-controls">
      <button className="glyph" aria-label="Move up" onClick={() => moveNodeUp(nodeId)}>↑</button>
      <button className="glyph" aria-label="Move down" onClick={() => moveNodeDown(nodeId)}>↓</button>
      <button className="glyph" aria-label="Outdent" onClick={() => outdentNode(nodeId)}>⇤</button>
      <button className="glyph" aria-label="Indent" onClick={() => indentNode(nodeId)}>⇥</button>
    </span>
  );
}
```

- [ ] **Step 5: Implement `components/NodeSection.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/tree/build";
import { SourcePassage } from "./SourcePassage";
import { TreeEditControls } from "./TreeEditControls";

export function NodeSection({ node, depth, canEdit }: { node: TreeNode; depth: number; canEdit: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <section className="node" style={{ marginLeft: depth ? "1.5rem" : undefined }} data-node-id={node.id}>
      <div className="node-head">
        {hasChildren ? (
          <button
            className="glyph"
            aria-label={collapsed ? "Expand" : "Collapse"}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="glyph glyph-leaf" aria-hidden>·</span>
        )}
        {node.label && <span className="node-label">{node.label}</span>}
        {node.title && <span className="node-title">{node.title}</span>}
        {canEdit && <TreeEditControls nodeId={node.id} />}
      </div>

      {node.text && <SourcePassage text={node.text} />}

      {!collapsed && hasChildren && (
        <div className="node-children">
          {node.children.map((child) => (
            <NodeSection key={child.id} node={child} depth={depth + 1} canEdit={canEdit} />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Rewrite `components/ReadingSurface.tsx`**

```tsx
import { NodeSection } from "./NodeSection";
import type { TreeNode } from "@/lib/tree/build";

export function ReadingSurface({
  title, tree, canEdit,
}: { title: string; tree: TreeNode[]; canEdit: boolean }) {
  return (
    <article className="reading">
      <h1 className="reading-title">{title}</h1>
      {tree.map((node) => (
        <NodeSection key={node.id} node={node} depth={0} canEdit={canEdit} />
      ))}
    </article>
  );
}
```

- [ ] **Step 7: Run the component tests — expect pass**

Run: `pnpm test components/__tests__/node-section.test.tsx components/__tests__/reading-surface.test.tsx`
Expected: PASS (both).

- [ ] **Step 8: Wire the reading route `app/d/[docId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getDocument } from "@/lib/data/documents";
import { ReadingSurface } from "@/components/ReadingSurface";

export default async function DocumentPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const data = await getDocument(docId);
  if (!data || !data.source) notFound();
  // M2: only the owner can read (getDocument gates on owner_id), so canEdit is true.
  return (
    <main className="page">
      <ReadingSurface title={data.doc.title} tree={data.tree} canEdit />
    </main>
  );
}
```

- [ ] **Step 9: Add austere tree styles to `app/globals.css`**

Append classes using only the existing token variables (no new colors, no shadows, no rounded cards):
```css
.node { margin-top: 0.75rem; }
.node-head { display: flex; align-items: baseline; gap: 0.5rem; font-family: var(--mono, ui-monospace, monospace); color: var(--muted); }
.glyph { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.9rem; padding: 0; line-height: 1; }
.glyph-leaf { cursor: default; }
.node-label { color: var(--muted); font-size: 0.85rem; }
.node-title { color: var(--ink); }
.node-children { border-left: 1px solid var(--rule); padding-left: 0.75rem; }
.tree-controls { display: inline-flex; gap: 0.35rem; margin-left: 0.5rem; opacity: 0; transition: opacity 0.1s; }
.node-head:hover .tree-controls { opacity: 1; }
@media (max-width: 640px) { .tree-controls { display: none; } } /* tree-building is desktop-only */
```
(If `--mono` isn't defined in `:root`, either add it near the other tokens or drop the `var(--mono, …)` fallback — the fallback already degrades gracefully.)

- [ ] **Step 10: Verify full suite + build**

Run: `pnpm test` then `pnpm build`
Expected: all M0/M1/M2 tests green; build has no type errors. Manually sanity-check `pnpm dev`: a Tractatus paste renders a nested, collapsible tree; hovering a node reveals the ↑ ↓ ⇤ ⇥ controls; indenting a paragraph and reloading keeps the nesting.

- [ ] **Step 11: Commit**

```bash
git add components app/d/[docId]/page.tsx app/globals.css
git commit -m "feat: render collapsible node tree with restructure controls"
```

---

### Task 9: Backfill nodes for existing M1 documents

**Files:**
- Create: `scripts/backfill-nodes.ts`
- Modify: `package.json` (add `tsx` dev-dep + a `backfill` script)

**Interfaces:**
- Consumes: `planNodes` (Task 3), schema tables (Task 1). One-shot ops script; idempotent (skips docs that already have nodes). No automated test — it is a migration; verify by running it.

- [ ] **Step 1: Add `tsx` and a script entry**

```bash
pnpm add -D tsx
```
Add to `package.json` scripts: `"backfill": "tsx scripts/backfill-nodes.ts"`.

- [ ] **Step 2: Implement `scripts/backfill-nodes.ts`**

Uses relative imports (no `@/*` alias — `tsx` runs it outside Next's resolver) and loads `.env.local` via the already-installed `dotenv`:
```ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { documents, sources, paragraphs, nodes, nodeSourceRanges } from "../lib/db/schema";
import { planNodes } from "../lib/tree/plan";

async function main() {
  const docs = await db.select().from(documents);
  for (const doc of docs) {
    const existing = await db.select({ id: nodes.id }).from(nodes).where(eq(nodes.documentId, doc.id));
    if (existing.length > 0) continue; // idempotent: already has a tree

    const [src] = await db.select().from(sources).where(eq(sources.documentId, doc.id)).orderBy(sources.position);
    if (!src) continue;
    const paras = await db.select().from(paragraphs).where(eq(paragraphs.sourceId, src.id)).orderBy(paragraphs.position);
    if (paras.length === 0) continue;

    const planned = planNodes(
      paras.map((p) => ({ start: p.charStart, end: p.charEnd, text: src.text.slice(p.charStart, p.charEnd) })),
      () => crypto.randomUUID(),
    );
    await db.batch([
      db.insert(nodes).values(
        planned.map((n) => ({
          id: n.id, documentId: doc.id, parentId: n.parentId, position: n.position, label: n.label, title: n.title,
        })),
      ),
      db.insert(nodeSourceRanges).values(
        planned.map((n) => ({
          nodeId: n.id, sourceId: src.id,
          startParagraphId: paras[n.paragraphIndex].id, startOffset: n.startOffset,
          endParagraphId: paras[n.paragraphIndex].id, endOffset: n.endOffset,
        })),
      ),
    ] as [any, ...any[]]);
    console.log(`backfilled ${planned.length} nodes for "${doc.title}" (${doc.id})`);
  }
  console.log("backfill complete");
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run it once against the dev database**

Run: `pnpm backfill`
Expected: prints a line per legacy document and "backfill complete"; re-running prints only "backfill complete" (idempotent). Open an existing doc at `/d/[id]` — it now renders as a (flat) tree.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-nodes.ts package.json pnpm-lock.yaml
git commit -m "chore: backfill node trees for pre-M2 documents"
```

---

## Self-Review

- **Spec coverage:**
  - `nodes` + `node_source_ranges` schema → Task 1.
  - One-prose-node-per-paragraph model, whole-paragraph vs. past-label ranges → Tasks 3 (`planNodes`) + 5 (import).
  - Decimal-numbering parser with nearest-existing-ancestor climbing, single-dot/duplicate bail-out, `proseStart` → Task 2.
  - Tree assembly for reading → Task 4 (`buildTree`), consumed in Task 5 (`getDocument`) + Task 8 (render).
  - Recursive collapsible `NodeSection` with `▾/▸` + indentation, `TreeEditControls` (desktop-only) → Task 8.
  - Owner-only indent/outdent/move Server Actions, each `authorize`-gated, positions compact → Tasks 6 + 7.
  - Ephemeral collapse (client `useState`) → Task 8, no schema. **Confirmed cuts:** no create/rename/delete node; no collapse persistence.
  - Existing-doc migration → Task 9 (idempotent backfill).
  - Acceptance (Tractatus auto-nests; Russell paragraph nests + persists on reload) → Tasks 5 + 7 tests, plus Task 8 manual check.
- **Placeholder scan:** every code step contains complete, runnable code; the only prose-only steps are `pnpm db:push` (Task 1) and the one-shot `pnpm backfill` run (Task 9), both with exact commands and expected output.
- **Type consistency:**
  - `NumberedRelation` (Task 2) is consumed by `planNodes` (Task 3).
  - `PlannedNode` / `ParaInput` (Task 3) match the `createDocument` and backfill call sites (Tasks 5, 9), including `paragraphIndex` used to map `paraIds`.
  - `NodeRow` / `NodeRange` / `TreeNode` (Task 4) match `getDocument`'s `buildTree` call (Task 5) and every renderer prop (Task 8).
  - `authorize(userId, docId, action)` (Task 6) is called with `"editTree"` in all four actions (Task 7).
  - The four action names `indentNode` / `outdentNode` / `moveNodeUp` / `moveNodeDown` are identical in Task 7 definitions and Task 8's `TreeEditControls`.
  - `ReadingSurface({ title, tree, canEdit })` (Task 8) matches the reading route's props (Task 8, Step 8).
- **Driver pitfalls documented:** neon-http `db.batch` (not `db.transaction`) used for every multi-statement mutation (Tasks 5, 7, 9); `next/cache` `revalidatePath` mocked in the Server-Action test (Task 7).
