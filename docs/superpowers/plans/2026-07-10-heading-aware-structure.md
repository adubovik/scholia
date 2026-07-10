# Heading-aware Document Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve chapter headings, drop the table of contents, and nest chapter prose under its chapter heading when importing HTML documents.

**Architecture:** Extraction emits an ordered `Block[]` (heading vs paragraph, TOC/boilerplate removed). A pure `blocksToSource` serializes blocks into the immutable source text plus a `headingLevels` array aligned 1:1 to `paragraphize()` output. A new `parseHeadingTree` planner nests paragraphs under the nearest higher heading, added to `planNodes` with precedence **numbered → heading → flat**.

**Tech Stack:** TypeScript, Next.js 16, linkedom + @mozilla/readability (import), Drizzle/Neon (persistence), Vitest.

## Global Constraints

- **Node 24 / pnpm.** Commands: `pnpm test` (vitest run once), `pnpm test <filter>` (subset), `pnpm build` (prod tsc, ES2017 target).
- **Green Vitest ≠ green `next build`.** Run `pnpm build` before declaring deploy-safe; it enforces the ES2017 target that esbuild does not.
- **Immutable source + integer offsets.** A heading becomes real characters in `source.text`; its node's `[start,end)` covers those characters. `text.slice(start,end)` must round-trip every block.
- **Path alias:** `@/*` → repo root.
- **Tests are colocated** in `__tests__/` dirs next to the code.
- Each block must become **exactly one paragraph** in the joined source text so `headingLevels[i]` aligns with `paragraphize()[i]`.

---

### Task 1: `Block` type + `htmlToBlocks` extraction

Replace the `<p>`-only collector with an ordered `h1–h6` + `p` walk that emits structured blocks with TOC, boilerplate, and byline removed and the title resolved.

**Files:**
- Modify: `lib/import/html.ts` (rewrite; keep Readability)
- Test: `lib/import/__tests__/html.test.ts` (add `htmlToBlocks` cases; keep file)

**Interfaces:**
- Produces:
  - `export type Block = { kind: "heading"; level: number; text: string } | { kind: "paragraph"; text: string }`
  - `export interface ExtractedDoc { title?: string; blocks: Block[] }`
  - `export function htmlToBlocks(html: string): ExtractedDoc`
- Consumes: `parseHTML` from `linkedom`, `Readability` from `@mozilla/readability` (already dependencies).

- [ ] **Step 1: Write the failing tests**

Add to `lib/import/__tests__/html.test.ts` (keep existing imports; add `htmlToBlocks` to the import line). A Gutenberg-shaped fixture exercises title, byline drop, contents-heading drop, heading capture, and prose:

```ts
import { describe, it, expect } from "vitest";
import { htmlToBlocks } from "@/lib/import/html";

const BOOK = `<!doctype html><html><head><title>ignored</title></head><body>
  <article>
    <h1>The Problems of Philosophy | Project Gutenberg</h1>
    <h2>By Bertrand Russell</h2>
    <h2>Contents</h2>
    <table>
      <tr><td><a href="#c1">.</a></td><td>CHAPTER I</td></tr>
      <tr><td><a href="#c2">.</a></td><td>CHAPTER II</td></tr>
    </table>
    <h2>CHAPTER I. APPEARANCE AND REALITY</h2>
    <p>Is there any knowledge in the world which is so certain that no reasonable man could doubt it? This is the hardest question.</p>
    <p>In daily life we assume as certain many things which on closer scrutiny are full of apparent contradictions and doubt.</p>
    <h2>CHAPTER II. THE EXISTENCE OF MATTER</h2>
    <p>In this chapter we have to ask ourselves whether, in any sense at all, there is such a thing as matter that exists.</p>
  </article>
</body></html>`;

describe("htmlToBlocks", () => {
  it("resolves the book title, stripping the site suffix", () => {
    const { title } = htmlToBlocks(BOOK);
    expect(title).toBe("The Problems of Philosophy");
  });

  it("keeps chapter headings as heading blocks in document order", () => {
    const { blocks } = htmlToBlocks(BOOK);
    const headings = blocks.filter((b) => b.kind === "heading").map((b) => b.text);
    expect(headings).toEqual([
      "CHAPTER I. APPEARANCE AND REALITY",
      "CHAPTER II. THE EXISTENCE OF MATTER",
    ]);
  });

  it("drops the byline, the Contents heading, and the TOC table", () => {
    const { blocks } = htmlToBlocks(BOOK);
    const texts = blocks.map((b) => b.text).join("\n");
    expect(texts).not.toContain("By Bertrand Russell");
    expect(texts).not.toMatch(/Contents/);
    expect(texts).not.toMatch(/CHAPTER I$/m); // the bare TOC entry, not the heading
  });

  it("first content block is the first chapter heading, not boilerplate", () => {
    const { blocks } = htmlToBlocks(BOOK);
    expect(blocks[0]).toEqual({ kind: "heading", level: 2, text: "CHAPTER I. APPEARANCE AND REALITY" });
  });

  it("drops Project Gutenberg START/END markers", () => {
    const html = `<article><h2>CHAPTER I</h2><p>*** START OF THE PROJECT GUTENBERG EBOOK 5827 ***</p><p>Real prose that is long enough to be kept by the reader extractor here.</p></article>`;
    const { blocks } = htmlToBlocks(html);
    expect(blocks.some((b) => /START OF THE PROJECT GUTENBERG/.test(b.text))).toBe(false);
  });

  it("drops a run of link-dominated paragraphs (list-style TOC)", () => {
    const html = `<article>
      <p><a href="#a">First chapter</a></p>
      <p><a href="#b">Second chapter</a></p>
      <p><a href="#c">Third chapter</a></p>
      <h2>CHAPTER I</h2>
      <p>Real prose that is comfortably long enough to survive the reader extractor stage of import.</p>
    </article>`;
    const { blocks } = htmlToBlocks(html);
    expect(blocks.some((b) => b.text === "First chapter")).toBe(false);
    expect(blocks.some((b) => b.kind === "heading" && b.text === "CHAPTER I")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test html`
Expected: FAIL — `htmlToBlocks` is not exported.

- [ ] **Step 3: Rewrite `lib/import/html.ts`**

```ts
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string };

export interface ExtractedDoc {
  title?: string;
  blocks: Block[];
}

const HEADING_TAGS = "h1,h2,h3,h4,h5,h6";
const GUTENBERG_MARKER = /\*{3}\s*(START|END) OF (THE|THIS) PROJECT GUTENBERG/i;
const CONTENTS_HEADING = /^(table of\s+)?contents$/i;
const BYLINE = /^by\s+\S/i;

/** A block plus the DOM-derived signal used only during TOC stripping. */
interface RawBlock {
  kind: "heading" | "paragraph";
  level: number; // heading level, or 0 for paragraphs
  text: string;
  linkish: boolean; // paragraph text is mostly internal (#) anchors
}

/** Strip a trailing "| Project Gutenberg" / " - Site" suffix from a title. */
function cleanTitle(raw: string): string {
  return raw.split(/\s+[|–—-]\s+/)[0].trim();
}

/** Walk h1–h6 + p in document order into raw blocks (h1 skipped: it is the title). */
function collectRawBlocks(rootHtml: string): { blocks: RawBlock[]; firstH1?: string } {
  const { document } = parseHTML(`<body>${rootHtml}</body>`);
  const root = document.querySelector("article") ?? document;
  const blocks: RawBlock[] = [];
  let firstH1: string | undefined;

  for (const el of root.querySelectorAll(`${HEADING_TAGS},p`)) {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (GUTENBERG_MARKER.test(text)) continue;

    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      if (level === 1) {
        firstH1 ??= text;
        continue;
      }
      blocks.push({ kind: "heading", level, text, linkish: false });
    } else {
      const anchors = [...el.querySelectorAll('a[href^="#"]')];
      const linkLen = anchors.reduce((s, a) => s + ((a.textContent ?? "").trim().length), 0);
      const linkish = text.length > 0 && linkLen / text.length >= 0.5;
      blocks.push({ kind: "paragraph", level: 0, text, linkish });
    }
  }
  return { blocks, firstH1 };
}

/** R1: drop Contents-style headings. Byline: drop a heading `By …` with no prose before the next heading. */
function stripHeadingCruft(blocks: RawBlock[]): RawBlock[] {
  return blocks.filter((b, i) => {
    if (b.kind !== "heading") return true;
    if (CONTENTS_HEADING.test(b.text)) return false;
    if (BYLINE.test(b.text)) {
      const next = blocks[i + 1];
      if (!next || next.kind === "heading") return false;
    }
    return true;
  });
}

/**
 * R2: drop link-dominated paragraph clusters (list/paragraph TOCs). A linkish
 * paragraph is dropped when it belongs to a run of >= 3 consecutive linkish
 * paragraphs, or on its own carries a heavy link load (>= 5 internal anchors
 * folded into one block). Isolated single links (footnote refs) are kept.
 */
function stripTocClusters(blocks: RawBlock[]): RawBlock[] {
  const drop = new Array(blocks.length).fill(false);
  let i = 0;
  while (i < blocks.length) {
    if (!(blocks[i].kind === "paragraph" && blocks[i].linkish)) {
      i++;
      continue;
    }
    let j = i;
    while (j < blocks.length && blocks[j].kind === "paragraph" && blocks[j].linkish) j++;
    if (j - i >= 3) for (let k = i; k < j; k++) drop[k] = true;
    i = j;
  }
  return blocks.filter((_, idx) => !drop[idx]);
}

/** Server-only: extract a clean title + ordered content blocks from arbitrary HTML. */
export function htmlToBlocks(html: string): ExtractedDoc {
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as Document).parse();
  const contentHtml = article?.content ?? html;

  const { blocks: raw, firstH1 } = collectRawBlocks(contentHtml);
  const kept = stripTocClusters(stripHeadingCruft(raw));
  const blocks: Block[] = kept.map((b) =>
    b.kind === "heading"
      ? { kind: "heading", level: b.level, text: b.text }
      : { kind: "paragraph", text: b.text },
  );

  const rawTitle = article?.title ?? firstH1;
  return { title: rawTitle ? cleanTitle(rawTitle) : undefined, blocks };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test html`
Expected: PASS (the new `htmlToBlocks` block). The old `htmlToParagraphs` tests in the same file now fail to import — that is expected; they are removed in Task 5. If the runner aborts on the missing export, temporarily comment the old `describe("htmlToParagraphs", …)` block and its import; Task 5 deletes them.

- [ ] **Step 5: Commit**

```bash
git add lib/import/html.ts lib/import/__tests__/html.test.ts
git commit -m "feat(import): extract ordered heading/paragraph blocks, drop TOC + byline"
```

---

### Task 2: `blocksToSource` serializer

Turn blocks into the immutable source text plus a `headingLevels` array aligned 1:1 to `paragraphize()`.

**Files:**
- Create: `lib/import/blocks.ts`
- Test: `lib/import/__tests__/blocks.test.ts`

**Interfaces:**
- Consumes: `Block` from `@/lib/import/html`; `paragraphize`, `normalizeText` from `@/lib/import/paragraphs` (test only).
- Produces: `export function blocksToSource(blocks: Block[]): { text: string; headingLevels: (number | null)[] }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { blocksToSource } from "@/lib/import/blocks";
import { normalizeText, paragraphize } from "@/lib/import/paragraphs";
import type { Block } from "@/lib/import/html";

const blocks: Block[] = [
  { kind: "heading", level: 2, text: "CHAPTER I" },
  { kind: "paragraph", text: "First paragraph of prose." },
  { kind: "paragraph", text: "Second paragraph\nwith a soft line break." },
  { kind: "heading", level: 3, text: "A subsection" },
  { kind: "paragraph", text: "Nested prose." },
];

describe("blocksToSource", () => {
  it("emits one paragraph per block, aligned to headingLevels", () => {
    const { text, headingLevels } = blocksToSource(blocks);
    const paras = paragraphize(normalizeText(text));
    expect(paras).toHaveLength(blocks.length);
    expect(headingLevels).toEqual([2, null, null, 3, null]);
  });

  it("keeps offsets exact: text.slice(start,end) round-trips each paragraph", () => {
    const { text } = blocksToSource(blocks);
    const norm = normalizeText(text);
    for (const p of paragraphize(norm)) {
      expect(norm.slice(p.start, p.end)).toBe(p.text);
    }
  });

  it("collapses any internal blank line so a block stays a single paragraph", () => {
    const { text, headingLevels } = blocksToSource([
      { kind: "paragraph", text: "line one\n\nline two" },
    ]);
    expect(paragraphize(normalizeText(text))).toHaveLength(1);
    expect(headingLevels).toEqual([null]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test blocks`
Expected: FAIL — cannot resolve `@/lib/import/blocks`.

- [ ] **Step 3: Implement `lib/import/blocks.ts`**

```ts
import type { Block } from "./html";

/**
 * Serialize ordered blocks into the immutable source text plus a per-paragraph
 * heading-level array. Blocks are joined with a blank line, and any blank-line
 * run *inside* a block is collapsed to a single newline so that each block maps
 * to exactly one `paragraphize()` paragraph (keeping headingLevels aligned).
 */
export function blocksToSource(blocks: Block[]): {
  text: string;
  headingLevels: (number | null)[];
} {
  const pieces = blocks.map((b) => b.text.replace(/\n[ \t]*\n+/g, "\n").trim());
  return {
    text: pieces.join("\n\n"),
    headingLevels: blocks.map((b) => (b.kind === "heading" ? b.level : null)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test blocks`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/import/blocks.ts lib/import/__tests__/blocks.test.ts
git commit -m "feat(import): serialize blocks to source text + aligned headingLevels"
```

---

### Task 3: `parseHeadingTree` planner

Compute parent/child relations from heading levels: paragraphs nest under the current deepest heading; a heading nests under the nearest preceding shallower heading.

**Files:**
- Create: `lib/tree/heading.ts`
- Test: `lib/tree/__tests__/heading.test.ts`

**Interfaces:**
- Produces:
  - `export interface HeadingRelation { paragraphIndex: number; parentIndex: number | null; isHeading: boolean }`
  - `export function parseHeadingTree(paras: { text: string }[], headingLevels: (number | null)[]): HeadingRelation[] | null`
- Returns `null` when no block is a heading (all levels `null`), so callers fall through to flat.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseHeadingTree } from "@/lib/tree/heading";

// helper: paras of the right length; text is irrelevant to nesting
const paras = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `p${i}` }));

describe("parseHeadingTree", () => {
  it("returns null when there are no headings", () => {
    expect(parseHeadingTree(paras(3), [null, null, null])).toBeNull();
  });

  it("nests paragraphs under the current chapter heading", () => {
    // h2, p, p, h2, p
    const rels = parseHeadingTree(paras(5), [2, null, null, 2, null]);
    expect(rels).toEqual([
      { paragraphIndex: 0, parentIndex: null, isHeading: true },
      { paragraphIndex: 1, parentIndex: 0, isHeading: false },
      { paragraphIndex: 2, parentIndex: 0, isHeading: false },
      { paragraphIndex: 3, parentIndex: null, isHeading: true },
      { paragraphIndex: 4, parentIndex: 3, isHeading: false },
    ]);
  });

  it("nests a deeper heading and its prose under the shallower one", () => {
    // h2, p, h3, p
    const rels = parseHeadingTree(paras(4), [2, null, 3, null]);
    expect(rels).toEqual([
      { paragraphIndex: 0, parentIndex: null, isHeading: true },
      { paragraphIndex: 1, parentIndex: 0, isHeading: false },
      { paragraphIndex: 2, parentIndex: 0, isHeading: true },
      { paragraphIndex: 3, parentIndex: 2, isHeading: false },
    ]);
  });

  it("pops back up when a heading is shallower than the previous one", () => {
    // h2, h3, h2  → third heading is top-level again
    const rels = parseHeadingTree(paras(3), [2, 3, 2]);
    expect(rels!.map((r) => r.parentIndex)).toEqual([null, 0, null]);
  });

  it("keeps prose before the first heading at top level", () => {
    const rels = parseHeadingTree(paras(2), [null, 2]);
    expect(rels).toEqual([
      { paragraphIndex: 0, parentIndex: null, isHeading: false },
      { paragraphIndex: 1, parentIndex: null, isHeading: true },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test heading`
Expected: FAIL — cannot resolve `@/lib/tree/heading`.

- [ ] **Step 3: Implement `lib/tree/heading.ts`**

```ts
export interface HeadingRelation {
  paragraphIndex: number;
  parentIndex: number | null;
  isHeading: boolean;
}

/**
 * Derive parent/child relations from heading levels. A paragraph's parent is the
 * current deepest open heading; a heading's parent is the nearest preceding
 * heading with a smaller level. Returns null when no block is a heading, so the
 * caller can fall through to flat structure.
 */
export function parseHeadingTree(
  paras: { text: string }[],
  headingLevels: (number | null)[],
): HeadingRelation[] | null {
  if (!headingLevels.some((l) => l !== null)) return null;

  const stack: { index: number; level: number }[] = [];
  return paras.map((_, index) => {
    const level = headingLevels[index];
    if (level == null) {
      const parentIndex = stack.length ? stack[stack.length - 1].index : null;
      return { paragraphIndex: index, parentIndex, isHeading: false };
    }
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parentIndex = stack.length ? stack[stack.length - 1].index : null;
    stack.push({ index, level });
    return { paragraphIndex: index, parentIndex, isHeading: true };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test heading`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tree/heading.ts lib/tree/__tests__/heading.test.ts
git commit -m "feat(tree): parseHeadingTree nests prose under headings by level"
```

---

### Task 4: `planNodes` heading branch

Add an optional `headingLevels` argument and a heading-structure branch, with precedence **numbered → heading → flat**. Heading nodes carry the heading text as `title`; ranges are whole-paragraph.

**Files:**
- Modify: `lib/tree/plan.ts`
- Test: `lib/tree/__tests__/plan.test.ts` (add cases)

**Interfaces:**
- Consumes: `parseHeadingTree`, `HeadingRelation` from `@/lib/tree/heading`; existing `parseNumberedTree`.
- Produces: `export function planNodes(paras: ParaInput[], newId: () => string, headingLevels?: (number | null)[]): PlannedNode[]` (third arg is new and optional — existing two-arg calls are unchanged).

- [ ] **Step 1: Write the failing tests**

Append to `lib/tree/__tests__/plan.test.ts` (the `paras` / `counter` helpers already exist in that file):

```ts
describe("planNodes — heading structure", () => {
  it("nests prose under heading nodes and titles the headings", () => {
    const input = paras("CHAPTER I", "Opening prose.", "More prose.", "CHAPTER II", "Next chapter prose.");
    const nodes = planNodes(input, counter(), [2, null, null, 2, null]);

    expect(nodes.map((n) => n.parentId)).toEqual([null, "n0", "n0", null, "n3"]);
    expect(nodes.map((n) => n.title)).toEqual(["CHAPTER I", null, null, "CHAPTER II", null]);
    // sibling positions reset per parent, assigned in document order
    expect(nodes.map((n) => n.position)).toEqual([0, 0, 1, 1, 0]);
    // heading node range covers the whole heading paragraph
    expect(nodes[0]).toMatchObject({ startOffset: input[0].start, endOffset: input[0].end });
  });

  it("prefers numbered structure over heading levels when both could apply", () => {
    const input = paras("1 First.", "2 Second.");
    const nodes = planNodes(input, counter(), [2, 2]);
    // numbered mode strips the label from the range (proseStart > 0)
    expect(nodes[0].startOffset).toBeGreaterThan(input[0].start);
    expect(nodes.map((n) => n.title)).toEqual([null, null]);
  });

  it("falls back to flat when headingLevels are all null", () => {
    const input = paras("First.", "Second.");
    const nodes = planNodes(input, counter(), [null, null]);
    expect(nodes.map((n) => n.parentId)).toEqual([null, null]);
    expect(nodes.map((n) => n.title)).toEqual([null, null]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test plan`
Expected: FAIL — heading nesting/titles not yet implemented (nodes come back flat with `null` titles).

- [ ] **Step 3: Update `lib/tree/plan.ts`**

Add the import and a heading branch between the numbered branch and the flat fallback. The full file:

```ts
import { parseNumberedTree } from "./numbering";
import { parseHeadingTree } from "./heading";

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
 * Plan one node per paragraph. Precedence: a clean numbered structure
 * (`parseNumberedTree`) nests by label; otherwise heading levels
 * (`parseHeadingTree`) nest prose under headings; otherwise every node is
 * top-level with a whole-paragraph range. Ids come from `newId` so callers
 * control uuid generation (and tests stay deterministic).
 */
export function planNodes(
  paras: ParaInput[],
  newId: () => string,
  headingLevels?: (number | null)[],
): PlannedNode[] {
  const ids = paras.map(() => newId());
  const position = new Map<string, number>();
  const nextPosition = (parentId: string | null) => {
    const key = parentId ?? "\0root";
    const n = position.get(key) ?? 0;
    position.set(key, n + 1);
    return n;
  };

  const numbered = parseNumberedTree(paras);
  if (numbered !== null) {
    const idByLabel = new Map<string, string>();
    numbered.forEach((r) => idByLabel.set(r.label, ids[r.paragraphIndex]));
    return numbered.map((r) => {
      const parentId = r.parentLabel ? idByLabel.get(r.parentLabel)! : null;
      const p = paras[r.paragraphIndex];
      return {
        id: ids[r.paragraphIndex], parentId, position: nextPosition(parentId),
        label: r.label, title: null, paragraphIndex: r.paragraphIndex,
        startOffset: p.start + r.proseStart, endOffset: p.end,
      };
    });
  }

  const headings = headingLevels ? parseHeadingTree(paras, headingLevels) : null;
  if (headings !== null) {
    return headings.map((r) => {
      const parentId = r.parentIndex === null ? null : ids[r.parentIndex];
      const p = paras[r.paragraphIndex];
      return {
        id: ids[r.paragraphIndex], parentId, position: nextPosition(parentId),
        label: null, title: r.isHeading ? p.text : null,
        paragraphIndex: r.paragraphIndex, startOffset: p.start, endOffset: p.end,
      };
    });
  }

  return paras.map((p, i) => ({
    id: ids[i], parentId: null, position: nextPosition(null),
    label: null, title: null, paragraphIndex: i, startOffset: p.start, endOffset: p.end,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test plan`
Expected: PASS — new heading suite plus all pre-existing `planNodes` tests (two-arg calls still work).

- [ ] **Step 5: Commit**

```bash
git add lib/tree/plan.ts lib/tree/__tests__/plan.test.ts
git commit -m "feat(tree): planNodes nests by heading level (numbered → heading → flat)"
```

---

### Task 5: Wire structure through import, `createDocument`, seed, and `/new`

Expose `htmlToSource`, thread `headingLevels` into `createDocument`, and update every caller. Remove the dead `htmlToParagraphs` path.

**Files:**
- Modify: `lib/import/html.ts` (add `htmlToSource` + `ExtractedText`; remove `htmlToParagraphs`, `ExtractedText.paragraphs`)
- Modify: `lib/actions/documents.ts:9-56` (`createDocument` gains `headingLevels`)
- Modify: `lib/actions/extract.ts` (return type)
- Modify: `app/api/import/route.ts:28`
- Modify: `app/new/page.tsx` (`fetchUrl`, `loadFile`, `doImport`, state)
- Modify: `scripts/seed.ts:29-34`
- Modify: `lib/import/__tests__/html.test.ts` (remove old `htmlToParagraphs` suite; add `htmlToSource`)

**Interfaces:**
- Consumes: `htmlToBlocks`, `Block` (Task 1); `blocksToSource` (Task 2); `planNodes` 3-arg (Task 4).
- Produces:
  - `export interface ExtractedText { title?: string; text: string; headingLevels: (number | null)[] }`
  - `export function htmlToSource(html: string): ExtractedText`
  - `createDocument(input: { title: string; language?: string; label?: string; text: string; headingLevels?: (number | null)[] }): Promise<string>`

- [ ] **Step 1: Add `htmlToSource` + `ExtractedText` to `lib/import/html.ts`; delete `htmlToParagraphs`**

Append to `lib/import/html.ts` and remove the old `ExtractedText`, `collectParagraphs`, `extractTitle`, and `htmlToParagraphs` definitions:

```ts
import { blocksToSource } from "./blocks";

export interface ExtractedText {
  title?: string;
  text: string;
  headingLevels: (number | null)[];
}

/** Server-only: extract clean title + immutable source text + heading levels. */
export function htmlToSource(html: string): ExtractedText {
  const { title, blocks } = htmlToBlocks(html);
  const { text, headingLevels } = blocksToSource(blocks);
  return { title, text, headingLevels };
}
```

- [ ] **Step 2: Thread `headingLevels` through `createDocument`**

In `lib/actions/documents.ts`, extend the input type and the `planNodes` call:

```ts
export async function createDocument(input: {
  title: string;
  language?: string;
  label?: string;
  text: string;
  headingLevels?: (number | null)[];
}): Promise<string> {
```

and change the planning call (currently `lib/actions/documents.ts:38-41`):

```ts
    const planned = planNodes(
      paras.map((p) => ({ start: p.start, end: p.end, text: p.text })),
      () => crypto.randomUUID(),
      input.headingLevels,
    );
```

- [ ] **Step 3: Update `extract.ts`, the import route, and `seed.ts`**

`lib/actions/extract.ts`:

```ts
"use server";
import { htmlToSource, type ExtractedText } from "@/lib/import/html";
import { getUserId } from "@/lib/auth/current-user";

export async function extractHtml(html: string): Promise<ExtractedText> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthenticated");
  return htmlToSource(html);
}
```

`app/api/import/route.ts` — change the import and the final return:

```ts
import { htmlToSource } from "@/lib/import/html";
// …
  return NextResponse.json(htmlToSource(html));
```

`scripts/seed.ts` — replace the `htmlToParagraphs` import with `htmlToSource` and the extraction/create block (currently lines 29-34):

```ts
import { htmlToSource } from "@/lib/import/html";
// …
  const { title, text, headingLevels } = htmlToSource(html);
  if (text.length === 0) throw new Error("Seed: no text extracted from book");
  const docId = await withSpinner(
    `Seed: importing document`,
    () => createDocument({ title: title ?? "Seeded Book", text, headingLevels }),
  );
```

- [ ] **Step 4: Update `app/new/page.tsx` to carry `headingLevels` with an unedited guard**

The textarea is user-editable, so heading levels are only valid while the text is untouched since fetch. Track the pristine structured text in a ref; pass `headingLevels` only on an exact match.

Add near the other refs (after `dragDepth`):

```tsx
  // headingLevels are valid only while `text` is exactly what extraction produced;
  // once the user edits the textarea the paragraph count can drift, so we drop them.
  const structured = useRef<{ text: string; headingLevels: (number | null)[] } | null>(null);
```

In `loadFile` (the `.html?` branch) replace the extract lines:

```tsx
        const { title: t, text: extracted, headingLevels } = await extractHtml(await file.text());
        structured.current = { text: extracted, headingLevels };
        setText(extracted);
        setTitle((cur) => cur || t || base);
```

In `fetchUrl` replace the response handling:

```tsx
      const { title: t, text: extracted, headingLevels } = await res.json();
      structured.current = { text: extracted, headingLevels };
      setText(extracted);
      setTitle((cur) => cur || t || "");
```

In `doImport` pass levels only when unedited:

```tsx
      const headingLevels =
        structured.current && structured.current.text === text
          ? structured.current.headingLevels
          : undefined;
      const id = await createDocument({ title: title.trim() || "Untitled", text, headingLevels });
```

- [ ] **Step 5: Replace the `htmlToParagraphs` test suite with an `htmlToSource` suite**

In `lib/import/__tests__/html.test.ts`, delete the old `describe("htmlToParagraphs", …)` block and its `ARTICLE` constant, keep the `htmlToBlocks` suite from Task 1, and add:

```ts
import { htmlToSource } from "@/lib/import/html";
import { normalizeText, paragraphize } from "@/lib/import/paragraphs";

describe("htmlToSource", () => {
  it("returns source text whose paragraphs align with headingLevels", () => {
    const { title, text, headingLevels } = htmlToSource(BOOK);
    expect(title).toBe("The Problems of Philosophy");
    const paras = paragraphize(normalizeText(text));
    expect(paras.length).toBe(headingLevels.length);
    // first block is the CHAPTER I heading
    expect(headingLevels[0]).toBe(2);
    expect(paras[0].text).toBe("CHAPTER I. APPEARANCE AND REALITY");
  });
});
```

- [ ] **Step 6: Run the full test suite**

Run: `pnpm test`
Expected: PASS across `html`, `blocks`, `heading`, `plan`, and all pre-existing suites.

- [ ] **Step 7: Verify the deploy target compiles**

Run: `pnpm build`
Expected: build succeeds (no TS/ES2017 errors). This is the gate Vitest does not enforce.

- [ ] **Step 8: Interactive skeleton check against the real book**

Create `scratch/skeleton.ts` (the `scratch/` dir is git-ignored):

```ts
import { readFileSync } from "fs";
import { htmlToSource } from "@/lib/import/html";
import { normalizeText, paragraphize } from "@/lib/import/paragraphs";
import { planNodes } from "@/lib/tree/plan";

const html = readFileSync("/tmp/book.htm", "utf8");
const { title, text, headingLevels } = htmlToSource(html);
const paras = paragraphize(normalizeText(text));
let i = 0;
const nodes = planNodes(
  paras.map((p) => ({ start: p.start, end: p.end, text: p.text })),
  () => `n${i++}`,
  headingLevels,
);
const byId = new Map(nodes.map((n) => [n.id, n]));
console.log("TITLE:", title);
for (const n of nodes.filter((n) => n.parentId === null).slice(0, 8)) {
  const kids = nodes.filter((c) => c.parentId === n.id).length;
  console.log(`▸ ${n.title ?? text.slice(n.startOffset, n.startOffset + 50)}  (${kids} children)`);
}
```

Run (fetch the book first if `/tmp/book.htm` is absent):
`curl -s https://www.gutenberg.org/files/5827/5827-h/5827-h.htm -o /tmp/book.htm && pnpm exec tsx scratch/skeleton.ts`

Expected: title `The Problems of Philosophy`; top-level nodes are `PREFACE`, `CHAPTER I. …` … `CHAPTER XV. …`, each with a non-zero child count; no `Contents` node and no Gutenberg marker node.

- [ ] **Step 9: Commit**

```bash
git add lib/import/html.ts lib/actions/documents.ts lib/actions/extract.ts app/api/import/route.ts app/new/page.tsx scripts/seed.ts lib/import/__tests__/html.test.ts
git commit -m "feat(import): thread heading structure into createDocument and callers"
```

---

## Self-Review notes

- **Spec coverage:** TOC detection → Task 1 (R1 headings + R2 clusters); keep chapter names → Task 1 (heading blocks) + Task 4 (titles); nest under headings → Tasks 3–4; title fix + byline + boilerplate → Task 1; offset invariant → Task 2 test; wiring (seed, route, createDocument) → Task 5; `/new` desync (discovered) → Task 5 Step 4.
- **Type consistency:** `Block`, `ExtractedDoc`, `htmlToBlocks` (Task 1) → `blocksToSource` (Task 2) → `parseHeadingTree`/`HeadingRelation` (Task 3) → `planNodes(…, headingLevels?)` (Task 4) → `htmlToSource`/`ExtractedText` + `createDocument({…, headingLevels})` (Task 5). Names match across tasks.
- **Precedence** is numbered → heading → flat in every mention.
