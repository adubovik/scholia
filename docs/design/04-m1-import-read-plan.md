# Scholia M1 — Import & Read — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a text (paste / URL / file) as an immutable Source and render it on the austere single-column reading surface. No tree, no annotations yet.

**Architecture:** Extends the M0 foundation (Next.js 16 App Router · Neon + Drizzle · Clerk · Tailwind v4 · Vitest). Adds `documents`/`sources`/`paragraphs` tables, pure import helpers (paragraph splitter + Readability HTML extraction), owner-gated Server Actions / data reads, a URL-import Route Handler, and RSC reading UI. Tree/nodes are deliberately deferred to M2.

**Tech Stack additions:** `@mozilla/readability` + `linkedom` (server-side HTML → clean paragraphs).

## Global Constraints

- All M0 Global Constraints still apply (Node 24, App Router, pnpm, secrets via env only, austere palette — black/white + four highlighter pastels, no shadows/rounded cards, TDD, commit per green step).
- **Immutable Source:** `sources.text` is written once and never updated. `paragraphs` store `char_start`/`char_end` offsets that index into the **stored (normalized) `sources.text`** — never into the raw pre-normalization input.
- **Newline normalization happens once, before storage:** CRLF/CR → LF via `normalizeText`, and that normalized string is both stored as `sources.text` and the string `paragraphize` receives, so offsets always align with stored text.
- **Neon HTTP driver has NO interactive transactions.** `db.transaction(async …)` throws on `drizzle-orm/neon-http`. For multi-statement atomic writes, generate ids in app code (`crypto.randomUUID()`) and use **`db.batch([...])`** (single atomic HTTP round-trip). Do not switch drivers.
- **Owner-gating:** every document read/write resolves the caller via `requireUser()` and filters by `documents.owner_id === user.id`. Sharing/roles arrive in M5; in M1 a user sees only their own documents.
- **Reading renders from offsets:** a paragraph's text is `source.text.slice(charStart, charEnd)` — do not store paragraph text separately.

---

### Task 1: Schema — documents, sources, paragraphs

**Files:**
- Modify: `lib/db/schema.ts`
- Test: `lib/db/__tests__/documents-schema.test.ts`

**Interfaces:**
- Consumes: `users` (M0).
- Produces: `documents`, `sources`, `paragraphs` Drizzle tables; migration via `pnpm db:push`.

- [ ] **Step 1: Add tables to `lib/db/schema.ts`**

Add imports and tables (keep existing `users`):
```ts
import { pgTable, text, timestamp, uuid, boolean, integer } from "drizzle-orm/pg-core";

// (existing users table stays as-is)

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  clonedFrom: uuid("cloned_from"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  language: text("language"),
  label: text("label"),
  isPrimary: boolean("is_primary").notNull().default(false),
  position: integer("position").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paragraphs = pgTable("paragraphs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  charStart: integer("char_start").notNull(),
  charEnd: integer("char_end").notNull(),
});
```

- [ ] **Step 2: Push the migration**

Run: `pnpm db:push`
Expected: `documents`, `sources`, `paragraphs` tables created; no errors.

- [ ] **Step 3: Write the failing round-trip test**

`lib/db/__tests__/documents-schema.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { users, documents, sources, paragraphs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("documents schema", () => {
  const userId = "clerk_" + crypto.randomUUID();
  let docId = "";
  afterAll(async () => {
    if (docId) await db.delete(documents).where(eq(documents.id, docId)); // cascades to sources/paragraphs
    await db.delete(users).where(eq(users.id, userId));
  });

  it("stores a document with a source and paragraphs (FK + cascade)", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    const [doc] = await db.insert(documents).values({ ownerId: userId, title: "Doc" }).returning();
    docId = doc.id;
    const [src] = await db.insert(sources)
      .values({ documentId: doc.id, isPrimary: true, position: 0, text: "Hello world" })
      .returning();
    await db.insert(paragraphs).values({ sourceId: src.id, position: 0, charStart: 0, charEnd: 11 });

    const rows = await db.select().from(paragraphs).where(eq(paragraphs.sourceId, src.id));
    expect(rows).toHaveLength(1);
    expect(src.text.slice(rows[0].charStart, rows[0].charEnd)).toBe("Hello world");
  });
});
```

- [ ] **Step 4: Run — expect fail then pass**

Run: `pnpm test lib/db/__tests__/documents-schema.test.ts`
Expected: fails before Step 1/2 (unknown tables), passes after.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/__tests__/documents-schema.test.ts
git commit -m "feat: add documents/sources/paragraphs schema"
```

---

### Task 2: Paragraph splitter (`paragraphize` + `normalizeText`)

**Files:**
- Create: `lib/import/paragraphs.ts`
- Test: `lib/import/__tests__/paragraphs.test.ts`

**Interfaces:**
- Produces: `normalizeText(raw: string): string`; `interface Paragraph { text: string; start: number; end: number }`; `paragraphize(text: string): Paragraph[]`. Consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

`lib/import/__tests__/paragraphs.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeText, paragraphize } from "@/lib/import/paragraphs";

describe("normalizeText", () => {
  it("converts CRLF and CR to LF", () => {
    expect(normalizeText("a\r\nb\rc")).toBe("a\nb\nc");
  });
});

describe("paragraphize", () => {
  it("splits on blank lines and reports offsets into the input", () => {
    const input = "First para.\n\nSecond para.";
    const paras = paragraphize(input);
    expect(paras.map(p => p.text)).toEqual(["First para.", "Second para."]);
    expect(input.slice(paras[0].start, paras[0].end)).toBe("First para.");
    expect(input.slice(paras[1].start, paras[1].end)).toBe("Second para.");
  });

  it("treats runs of blank lines (with spaces/tabs) as one separator and trims", () => {
    const input = "  A line\nstill A\n \t\n\n  B line  ";
    const paras = paragraphize(input);
    expect(paras.map(p => p.text)).toEqual(["A line\nstill A", "B line"]);
    for (const p of paras) expect(input.slice(p.start, p.end)).toBe(p.text);
  });

  it("returns [] for blank input", () => {
    expect(paragraphize("   \n\n  ")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test lib/import/__tests__/paragraphs.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/import/paragraphs.ts`**

```ts
export function normalizeText(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export interface Paragraph {
  text: string;
  start: number;
  end: number;
}

/**
 * A paragraph is a maximal run of non-blank lines. Blank-line runs
 * (optionally containing spaces/tabs) separate paragraphs. Offsets index
 * into the given `text` exactly, so `text.slice(start, end) === paragraph.text`.
 */
export function paragraphize(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  const sep = /\n[ \t]*\n/g;
  let segStart = 0;
  const push = (from: number, to: number) => {
    const raw = text.slice(from, to);
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;
    const leading = raw.length - raw.trimStart().length;
    const start = from + leading;
    out.push({ text: trimmed, start, end: start + trimmed.length });
  };
  let m: RegExpExecArray | null;
  while ((m = sep.exec(text)) !== null) {
    push(segStart, m.index);
    segStart = m.index + m[0].length;
  }
  push(segStart, text.length);
  return out;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm test lib/import/__tests__/paragraphs.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/import/paragraphs.ts lib/import/__tests__/paragraphs.test.ts
git commit -m "feat: add paragraph splitter with offset tracking"
```

---

### Task 3: HTML → paragraphs (Readability)

**Files:**
- Create: `lib/import/html.ts`
- Test: `lib/import/__tests__/html.test.ts`
- Modify: `package.json` (deps)

**Interfaces:**
- Produces: `interface ExtractedText { title?: string; paragraphs: string[] }`; `htmlToParagraphs(html: string): ExtractedText`. Consumed by Tasks 5 & 6.

- [ ] **Step 1: Install deps**

```bash
pnpm add @mozilla/readability linkedom
```

- [ ] **Step 2: Write the failing test**

`lib/import/__tests__/html.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { htmlToParagraphs } from "@/lib/import/html";

const ARTICLE = `<!doctype html><html><head><title>Site</title></head><body>
  <nav>Home · About · Donate</nav>
  <article>
    <h1>The Problems of Philosophy</h1>
    <p>Is there any knowledge in the world so certain that no reasonable man could doubt it?</p>
    <p>This question, which at first sight might not seem difficult, is really one of the most difficult that can be asked.</p>
    <p>In this book we shall consider whether any such certainty exists.</p>
  </article>
  <footer>Project Gutenberg License: this eBook is for the use of anyone anywhere at no cost.</footer>
</body></html>`;

describe("htmlToParagraphs", () => {
  it("extracts the article title and body paragraphs", () => {
    const { title, paragraphs } = htmlToParagraphs(ARTICLE);
    expect(title).toContain("Problems of Philosophy");
    expect(paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(paragraphs[0]).toContain("no reasonable man could doubt it");
  });

  it("excludes nav/footer boilerplate", () => {
    const { paragraphs } = htmlToParagraphs(ARTICLE);
    const joined = paragraphs.join("\n");
    expect(joined).not.toContain("Donate");
    expect(joined).not.toContain("Gutenberg License");
  });
});
```

- [ ] **Step 3: Run — expect fail**

Run: `pnpm test lib/import/__tests__/html.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `lib/import/html.ts`**

```ts
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

export interface ExtractedText {
  title?: string;
  paragraphs: string[];
}

function collectParagraphs(html: string): string[] {
  const { document } = parseHTML(`<body>${html}</body>`);
  return [...document.querySelectorAll("p")]
    .map((p) => (p.textContent ?? "").trim())
    .filter((t) => t.length > 0);
}

/** Server-only: extract a clean title + body paragraphs from arbitrary HTML. */
export function htmlToParagraphs(html: string): ExtractedText {
  const { document } = parseHTML(html);
  // Readability mutates the document; linkedom's document is compatible.
  const article = new Readability(document as unknown as Document).parse();
  if (article?.content) {
    return {
      title: article.title ?? undefined,
      paragraphs: collectParagraphs(article.content),
    };
  }
  // Fallback: naive <p> extraction from the original document.
  const { document: doc2 } = parseHTML(html);
  return {
    title: doc2.querySelector("title")?.textContent?.trim() || undefined,
    paragraphs: collectParagraphs(html),
  };
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm test lib/import/__tests__/html.test.ts`
Expected: PASS. If Readability returns null for this small fixture, the fallback path still satisfies the assertions; if the `nav`/`footer` leak through the fallback, tighten `collectParagraphs` to only read `<article> p` when an `<article>` exists. Report any such adjustment.

- [ ] **Step 6: Commit**

```bash
git add lib/import/html.ts lib/import/__tests__/html.test.ts package.json pnpm-lock.yaml
git commit -m "feat: extract clean paragraphs from HTML via Readability"
```

---

### Task 4: Document Server Actions + data reads

**Files:**
- Create: `lib/actions/documents.ts` (`"use server"`), `lib/data/documents.ts` (server-only reads)
- Test: `lib/actions/__tests__/documents.test.ts`

**Interfaces:**
- Consumes: `requireUser` (M0), `db`, schema tables, `normalizeText`/`paragraphize` (Task 2).
- Produces:
  - `createDocument(input: { title: string; language?: string; label?: string; text: string }): Promise<string>` — returns new document id.
  - `listDocuments(): Promise<{ id: string; title: string; updatedAt: Date }[]>`
  - `getDocument(docId: string): Promise<{ doc; source; paragraphs } | null>` (owner-gated)

- [ ] **Step 1: Write the failing integration test**

`lib/actions/__tests__/documents.test.ts` (mocks `requireUser`; exercises real Neon writes/reads):
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
import { getDocument, listDocuments } from "@/lib/data/documents";

describe("document actions", () => {
  let docId = "";
  afterAll(async () => {
    if (docId) await db.delete(documents).where(eq(documents.id, docId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("creates a document with paragraphs and reads it back", async () => {
    await db.insert(users).values({ id: userId, email: "a@b.c", displayName: "T" });
    docId = await createDocument({ title: "Russell", text: "One.\r\n\r\nTwo." });

    const got = await getDocument(docId);
    expect(got).not.toBeNull();
    expect(got!.doc.title).toBe("Russell");
    expect(got!.paragraphs.map(p => got!.source.text.slice(p.charStart, p.charEnd)))
      .toEqual(["One.", "Two."]);

    const list = await listDocuments();
    expect(list.some(d => d.id === docId)).toBe(true);
  });

  it("owner-gates getDocument (returns null for a non-existent id)", async () => {
    expect(await getDocument(crypto.randomUUID())).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test lib/actions/__tests__/documents.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `lib/actions/documents.ts`**

```ts
"use server";

import { db } from "@/lib/db";
import { documents, sources, paragraphs } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { normalizeText, paragraphize } from "@/lib/import/paragraphs";

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
        paras.map((p, i) => ({ sourceId: srcId, position: i, charStart: p.start, charEnd: p.end })),
      ),
    );
  }
  // neon-http has no interactive transactions; batch is a single atomic round-trip.
  await db.batch(statements as [any, ...any[]]);
  return docId;
}
```

- [ ] **Step 4: Implement `lib/data/documents.ts`**

```ts
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, sources, paragraphs } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";

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
    .select()
    .from(sources)
    .where(eq(sources.documentId, doc.id))
    .orderBy(sources.position);
  const source = src[0] ?? null;
  const paras = source
    ? await db.select().from(paragraphs).where(eq(paragraphs.sourceId, source.id)).orderBy(paragraphs.position)
    : [];
  return { doc, source, paragraphs: paras };
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm test lib/actions/__tests__/documents.test.ts`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add lib/actions/documents.ts lib/data/documents.ts lib/actions/__tests__/documents.test.ts
git commit -m "feat: add document create action and owner-gated reads"
```

---

### Task 5: URL import Route Handler

**Files:**
- Create: `app/api/import/route.ts`
- Test: `app/api/import/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `htmlToParagraphs` (Task 3), Clerk `auth`.
- Produces: `POST /api/import` — body `{ url: string }` → `200 { title?, paragraphs[] }`; `401` unauth, `400` bad url, `502` fetch failure.

- [ ] **Step 1: Write the failing test**

`app/api/import/__tests__/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "u1" }) }));
import { POST } from "@/app/api/import/route";

const HTML = `<html><head><title>T</title></head><body><article>
  <h1>Title</h1><p>Hello paragraph one.</p><p>Hello paragraph two.</p></article></body></html>`;

function req(body: unknown) {
  return new Request("http://localhost/api/import", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/import", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns paragraphs for a fetched page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(HTML, { status: 200 })));
    const res = await POST(req({ url: "https://example.com/book" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(json.paragraphs[0]).toContain("paragraph one");
  });

  it("rejects a non-http url", async () => {
    const res = await POST(req({ url: "ftp://nope" }));
    expect(res.status).toBe(400);
  });

  it("502s on upstream failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 404 })));
    const res = await POST(req({ url: "https://example.com/missing" }));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test app/api/import/__tests__/route.test.ts`
Expected: FAIL (route not found).

- [ ] **Step 3: Implement `app/api/import/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { htmlToParagraphs } from "@/lib/import/html";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  let html: string;
  try {
    const res = await fetch(url, { headers: { "user-agent": "ScholiaBot/1.0" } });
    if (!res.ok) return NextResponse.json({ error: `Fetch failed: ${res.status}` }, { status: 502 });
    html = await res.text();
  } catch {
    return NextResponse.json({ error: "Fetch error" }, { status: 502 });
  }

  return NextResponse.json(htmlToParagraphs(html));
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm test app/api/import/__tests__/route.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add app/api/import/route.ts app/api/import/__tests__/route.test.ts
git commit -m "feat: add URL import route handler"
```

---

### Task 6: Reading UI — home list, import wizard, reading surface

**Files:**
- Modify: `app/page.tsx` (home → documents list)
- Create: `app/new/page.tsx` (import wizard, client), `lib/actions/extract.ts` (`"use server"` HTML extract for file/.html)
- Create: `app/d/[docId]/page.tsx`, `components/ReadingSurface.tsx`, `components/SourcePassage.tsx`
- Test: `components/__tests__/reading-surface.test.tsx`

**Interfaces:**
- Consumes: `listDocuments`, `getDocument` (Task 4), `createDocument` (Task 4), `htmlToParagraphs` (Task 3), `/api/import` (Task 5).
- Produces: `extractHtml(html: string): Promise<ExtractedText>` server action; the three routes; `ReadingSurface`/`SourcePassage` components.

- [ ] **Step 1: Write the failing component test**

`components/__tests__/reading-surface.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadingSurface } from "@/components/ReadingSurface";

describe("ReadingSurface", () => {
  it("renders the title and each paragraph sliced from source text by offsets", () => {
    render(
      <ReadingSurface
        title="Russell"
        sourceText="First para.\n\nSecond para."
        paragraphs={[
          { charStart: 0, charEnd: 11 },
          { charStart: 13, charEnd: 25 },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Russell" })).toBeDefined();
    expect(screen.getByText("First para.")).toBeDefined();
    expect(screen.getByText("Second para.")).toBeDefined();
  });
});
```
(Note: in the literal above, use a real newline in `sourceText`; the offsets `0..11` and `13..25` assume `"First para.\n\nSecond para."` with actual `\n`. The implementer should build the string so `slice` yields the two sentences.)

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test components/__tests__/reading-surface.test.tsx`
Expected: FAIL (component not found).

- [ ] **Step 3: Implement `components/SourcePassage.tsx` and `components/ReadingSurface.tsx`**

`components/SourcePassage.tsx`:
```tsx
export function SourcePassage({ text }: { text: string }) {
  return <p className="reading-p">{text}</p>;
}
```

`components/ReadingSurface.tsx`:
```tsx
import { SourcePassage } from "./SourcePassage";

export interface ParagraphRange { charStart: number; charEnd: number }

export function ReadingSurface({
  title, sourceText, paragraphs,
}: { title: string; sourceText: string; paragraphs: ParagraphRange[] }) {
  return (
    <article className="reading">
      <h1 className="reading-title">{title}</h1>
      {paragraphs.map((p, i) => (
        <SourcePassage key={i} text={sourceText.slice(p.charStart, p.charEnd)} />
      ))}
    </article>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm test components/__tests__/reading-surface.test.tsx`
Expected: PASS.

- [ ] **Step 5: Reading route `app/d/[docId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getDocument } from "@/lib/data/documents";
import { ReadingSurface } from "@/components/ReadingSurface";

export default async function DocumentPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const data = await getDocument(docId);
  if (!data || !data.source) notFound();
  return (
    <main className="page">
      <ReadingSurface
        title={data.doc.title}
        sourceText={data.source.text}
        paragraphs={data.paragraphs.map((p) => ({ charStart: p.charStart, charEnd: p.charEnd }))}
      />
    </main>
  );
}
```

- [ ] **Step 6: Home documents list `app/page.tsx`**

Replace the M0 placeholder with a list + a link to `/new`:
```tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listDocuments } from "@/lib/data/documents";

export default async function Home() {
  await requireUser();
  const docs = await listDocuments();
  return (
    <main className="page">
      <header className="home-head">
        <h1>Scholia</h1>
        <Link href="/new" className="btn">＋ New</Link>
      </header>
      {docs.length === 0 ? (
        <p className="muted">No documents yet. Import one to begin.</p>
      ) : (
        <ul className="doc-list">
          {docs.map((d) => (
            <li key={d.id}><Link href={`/d/${d.id}`}>{d.title}</Link></li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 7: HTML extract action `lib/actions/extract.ts`** (for pasted-HTML / .html file)

```ts
"use server";
import { htmlToParagraphs, type ExtractedText } from "@/lib/import/html";
import { auth } from "@clerk/nextjs/server";

export async function extractHtml(html: string): Promise<ExtractedText> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthenticated");
  return htmlToParagraphs(html);
}
```

- [ ] **Step 8: Import wizard `app/new/page.tsx`** (client component)

Build a minimal three-mode wizard (paste / url / file), austere, using the tokens. Behavior:
- **Paste:** a title input + a textarea; on submit call `createDocument({ title, text })`, then `router.push('/d/' + id)`.
- **URL:** a url input; on submit `fetch('/api/import', { method:'POST', body: JSON.stringify({ url }) })`; use returned `title` (prefill the title input, editable) and set `text = paragraphs.join('\n\n')`; then `createDocument` as above.
- **File:** `<input type="file" accept=".txt,.md,.html,.htm">`; read via `file.text()`; if the name ends `.html`/`.htm`, call `extractHtml(text)` and join paragraphs with `\n\n`; else use the file text directly; default the title to the filename (without extension); then `createDocument`.

Reference shape (implementer may refine, keep each handler small and the component focused):
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDocument } from "@/lib/actions/documents";
import { extractHtml } from "@/lib/actions/extract";

type Mode = "paste" | "url" | "file";

export default function NewDocumentPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("paste");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(finalTitle: string, finalText: string) {
    setBusy(true); setError(null);
    try {
      const id = await createDocument({ title: finalTitle.trim() || "Untitled", text: finalText });
      router.push(`/d/${id}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  async function importUrl() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Import failed");
      const { title: t, paragraphs } = await res.json();
      if (t && !title) setTitle(t);
      await submit(t ?? title, (paragraphs as string[]).join("\n\n"));
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  async function importFile(file: File) {
    setBusy(true); setError(null);
    try {
      const raw = await file.text();
      const base = file.name.replace(/\.[^.]+$/, "");
      let finalText = raw;
      if (/\.html?$/i.test(file.name)) {
        const { title: t, paragraphs } = await extractHtml(raw);
        if (t && !title) setTitle(t);
        finalText = paragraphs.join("\n\n");
      }
      await submit(title || base, finalText);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <main className="page">
      <h1>Import a text</h1>
      <nav className="tabs">
        {(["paste", "url", "file"] as Mode[]).map((m) => (
          <button key={m} className={m === mode ? "tab active" : "tab"} onClick={() => setMode(m)}>{m}</button>
        ))}
      </nav>
      <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      {mode === "paste" && (
        <>
          <textarea className="textarea" placeholder="Paste text or Markdown…" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn" disabled={busy || !text.trim()} onClick={() => submit(title, text)}>Import</button>
        </>
      )}
      {mode === "url" && (
        <>
          <input className="input" placeholder="https://www.gutenberg.org/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn" disabled={busy || !url.trim()} onClick={importUrl}>Fetch & import</button>
        </>
      )}
      {mode === "file" && (
        <input className="input" type="file" accept=".txt,.md,.html,.htm"
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} disabled={busy} />
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 9: Austere styles**

In `app/globals.css`, add minimal classes used above (`.page`, `.reading`, `.reading-title`, `.reading-p`, `.home-head`, `.doc-list`, `.tabs`, `.tab`, `.input`, `.textarea`, `.btn`, `.muted`, `.error`) using only the token variables — hairline `--rule` borders, `--paper`/`--ink`, generous line-height for `.reading-p`, comfortable max-width (~34rem) reading column, no shadows, no rounded cards. Keep it terminal-plain.

- [ ] **Step 10: Verify build + full suite**

Run: `pnpm test` (all M1 + M0 tests green) then `pnpm build` (no type errors).
Expected: green. Manually sanity-check `pnpm dev`: paste text → redirected to `/d/…` reading view; home lists it. (Full E2E is deferred to M3.)

- [ ] **Step 11: Commit**

```bash
git add app/page.tsx app/new/page.tsx app/d lib/actions/extract.ts components app/globals.css
git commit -m "feat: home list, import wizard, and reading surface"
```

---

## Self-Review

- **Spec coverage:** import via paste/url/file (Tasks 4/5/6), immutable Source + paragraph offsets (Tasks 1/2/4), Readability HTML cleanup for Gutenberg (Task 3), austere single-column reading surface (Task 6), owner-gated per-user documents (Task 4). Tree/nodes, numbered auto-parse, annotations, sharing, `.epub`, and E2E are explicitly deferred (stated in the M1 design and this plan's constraints).
- **Placeholder scan:** every code step contains real code; the wizard reference implementation is complete and runnable.
- **Type consistency:** `ExtractedText` (Task 3) is reused by Tasks 5/6; `createDocument`/`listDocuments`/`getDocument` signatures match between Task 4 definitions and Task 6 consumers; `ParagraphRange` (`charStart`/`charEnd`) matches the `paragraphs` schema columns.
- **Known driver pitfall documented:** neon-http `db.batch` (not `db.transaction`) for atomic multi-insert — called out in Global Constraints and Task 4.
