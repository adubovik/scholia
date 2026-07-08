# TextAnnotator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a free-tier-hosted web app for tree-structured, multi-translation close-reading with inline + per-node annotations and async threaded collaboration.

**Architecture:** Next.js App Router on Vercel Hobby; RSC renders an immutable Source split into annotated spans (no rich-text editor); Server Actions mutate; Neon Postgres via Drizzle; Clerk for identity. See [`00-architecture.md`](00-architecture.md), [`01-data-schema.md`](01-data-schema.md), [`02-frontend-and-permissions.md`](02-frontend-and-permissions.md).

**Tech Stack:** Next.js (App Router, TS) · Vercel Hobby · Neon Postgres · Drizzle ORM · Clerk · Tailwind CSS · cmdk · Vitest · Playwright.

## Global Constraints

- **Node.js 24 LTS** (Vercel default runtime).
- **Next.js** App Router only; Server Components by default, client components only for the islands in [`02`](02-frontend-and-permissions.md).
- **Package manager:** `pnpm`.
- **Secrets** only via env vars (`DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_*`, `CLERK_WEBHOOK_SECRET`); never commit them. `.env.local` is gitignored.
- **Palette:** black, white, and the four highlighter pastels from [`02`](02-frontend-and-permissions.md) only. No other colors, no shadows, no rounded cards.
- **TDD:** every behavioral change starts with a failing test. Commit after each green step.
- **Immutable Source invariant:** no code path updates `sources.text` after insert.
- **Permission invariant:** every Server Action calls `authorize(userId, docId, action)` before mutating.

---

## Milestone Roadmap

Each milestone produces working, testable, deployable software. **M0 is fully specified below.** M1–M7 are outlined with scope, key files, and acceptance criteria; each will be expanded into its own task-by-task plan (its own spec→plan cycle) before execution — do **not** implement M1+ from the outlines alone.

| # | Milestone | Delivers |
|---|-----------|----------|
| **M0** | Foundation | Deployed, authed skeleton on Vercel + Neon. **(detailed below)** |
| M1 | Import & read | Paste/URL/file import → immutable Source → austere single-column reading. |
| M2 | Tree | Auto-parse numbering + manual build/reorder; inline collapsible nodes. |
| M3 | Annotations | Inline (select→popover, underline, note, tags, overlap, collapsed) + node (hover reveal). |
| M4 | Translations | Add parallel Source, node-level alignment, interleaved view. |
| M5 | Sharing & threads | Memberships/roles, author filter, forum-threaded comments. |
| M6 | Cloning | Fork document: copy Sources+tree, strip annotations/threads. |
| M7 | Palette & polish | Command palette, hotkeys, mobile pass, empty/loading/error states. |

---

## Milestone 0 — Foundation

Outcome: a deployed Vercel app where a signed-in user lands on an authed home page backed by a live Neon database. No product features yet; this is the spine everything hangs off.

### Task 1: Scaffold app + tooling

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `vitest.config.ts`
- Test: `lib/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: a runnable Next.js app and a working Vitest runner (`pnpm test`).

- [ ] **Step 1: Scaffold Next.js**

Run (non-interactive):
```bash
pnpm dlx create-next-app@latest . \
  --ts --app --tailwind --eslint --src-dir=false \
  --import-alias "@/*" --use-pnpm --no-turbopack --yes
```

- [ ] **Step 2: Add test tooling**

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, include: ["**/*.test.ts", "**/*.test.tsx"] },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Write the failing smoke test**

`lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { appName } from "@/lib/config";

describe("config", () => {
  it("exposes the app name", () => {
    expect(appName).toBe("Scholia");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '@/lib/config'`.

- [ ] **Step 5: Implement minimal code**

`lib/config.ts`:
```ts
export const appName = "Scholia";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS (1 test).

- [ ] **Step 7: Apply austere design tokens**

Replace `app/globals.css` `:root` with the token block from [`02-frontend-and-permissions.md`](02-frontend-and-permissions.md) (ink/paper/rule/muted + four `--hl-*`). Set `body { background: var(--paper); color: var(--ink); }`. Remove default Next.js demo markup from `app/page.tsx`, leaving `<main>Scholia</main>`.

- [ ] **Step 8: Verify dev build**

Run: `pnpm build`
Expected: build succeeds, no type errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with tokens and Vitest"
```

### Task 2: Database (Neon + Drizzle) with `users` schema

**Files:**
- Create: `lib/db/index.ts`, `lib/db/schema.ts`, `drizzle.config.ts`, `lib/db/__tests__/connection.test.ts`
- Modify: `package.json` (scripts), `.env.local` (gitignored)

**Interfaces:**
- Produces: `db` (Drizzle client), `users` table, `pnpm db:push` migration command. Consumed by every later mutation task.

- [ ] **Step 1: Install Drizzle + Neon driver**

```bash
pnpm add drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit
```

- [ ] **Step 2: Define schema and client**

`lib/db/schema.ts`:
```ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),            // Clerk user id
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

`lib/db/index.ts`:
```ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

`drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Add scripts: `"db:push": "drizzle-kit push"`, `"db:studio": "drizzle-kit studio"`.

- [ ] **Step 3: Point `.env.local` at a Neon test branch**

Create a Neon project (Vercel Marketplace, done in Task 4) and a **branch** `test`. Put its connection string in `.env.local` as `DATABASE_URL=...`. Run `pnpm db:push` to create the `users` table.

- [ ] **Step 4: Write the failing integration test**

`lib/db/__tests__/connection.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("db users", () => {
  const id = "test_user_" + Date.now();
  afterAll(async () => { await db.delete(users).where(eq(users.id, id)); });

  it("inserts and reads a user", async () => {
    await db.insert(users).values({ id, email: "a@b.c", displayName: "Tester" });
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row.displayName).toBe("Tester");
  });
});
```

- [ ] **Step 5: Run test to verify it passes against Neon**

Run: `DATABASE_URL=... pnpm test lib/db`
Expected: PASS (round-trips through the Neon `test` branch).
(If it fails with a connection error, the `DATABASE_URL` or `db:push` step is wrong — fix before proceeding.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire Neon Postgres via Drizzle with users schema"
```

### Task 3: Clerk auth + protected home + user sync

**Files:**
- Create: `middleware.ts`, `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx`, `lib/auth/current-user.ts`, `lib/auth/__tests__/current-user.test.ts`
- Modify: `app/layout.tsx`, `app/page.tsx`, `.env.local`

**Interfaces:**
- Consumes: `db`, `users` (Task 2).
- Produces: `requireUser(): Promise<{ id, displayName }>` — used by every authed page/action; upserts the Clerk user into `users`.

- [ ] **Step 1: Install Clerk**

```bash
pnpm add @clerk/nextjs
```
Add Clerk keys to `.env.local` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) from the Clerk dashboard; enable Google OAuth + Email magic link in the Clerk instance.

- [ ] **Step 2: Add middleware + provider**

`middleware.ts`:
```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/webhooks(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

export const config = { matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"] };
```

Wrap `app/layout.tsx` body in `<ClerkProvider>`. Add `SignIn`/`SignUp` pages using Clerk's components. Restyle later in M7.

- [ ] **Step 3: Write the failing test for user upsert logic**

`lib/auth/__tests__/current-user.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { upsertUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("upsertUser", () => {
  const id = "clerk_" + Date.now();
  afterAll(async () => { await db.delete(users).where(eq(users.id, id)); });

  it("creates then updates the mirrored user row", async () => {
    await upsertUser({ id, email: "x@y.z", displayName: "First" });
    await upsertUser({ id, email: "x@y.z", displayName: "Second" });
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row.displayName).toBe("Second");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `DATABASE_URL=... pnpm test lib/auth`
Expected: FAIL — `upsertUser` not exported.

- [ ] **Step 5: Implement `current-user.ts`**

`lib/auth/current-user.ts`:
```ts
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function upsertUser(u: { id: string; email: string; displayName: string }) {
  await db
    .insert(users)
    .values(u)
    .onConflictDoUpdate({ target: users.id, set: { email: u.email, displayName: u.displayName } });
}

export async function requireUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthenticated");
  const cu = await currentUser();
  const email = cu?.emailAddresses[0]?.emailAddress ?? "";
  const displayName = cu?.firstName ?? cu?.username ?? email ?? "Reader";
  await upsertUser({ id: userId, email, displayName });
  return { id: userId, displayName };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `DATABASE_URL=... pnpm test lib/auth`
Expected: PASS.

- [ ] **Step 7: Use it on the home page**

`app/page.tsx` (Server Component):
```tsx
import { requireUser } from "@/lib/auth/current-user";
export default async function Home() {
  const user = await requireUser();
  return <main>Signed in as {user.displayName}</main>;
}
```

- [ ] **Step 8: Manual verification**

Run: `pnpm dev`, open `/`. Expected: redirected to Clerk sign-in; after Google/magic-link sign-in, home shows "Signed in as …". Confirm a `users` row exists via `pnpm db:studio`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add Clerk auth with protected home and user sync"
```

### Task 4: Provision Marketplace integrations + deploy to Vercel

**Files:**
- Create: `vercel.json` (only if needed), `.github/` untouched
- Modify: `README.md` (setup notes)

**Interfaces:**
- Produces: a live preview + production URL with `DATABASE_URL` and Clerk keys injected by the Marketplace integrations.

- [ ] **Step 1: Link the project**

```bash
pnpm dlx vercel link --yes
```

- [ ] **Step 2: Provision Neon + Clerk via Marketplace**

In the Vercel dashboard (or `vercel integration add neon` / `clerk`), add **Neon Postgres** and **Clerk** to the project. These inject `DATABASE_URL` and the Clerk keys into all environments. Pull them locally:
```bash
pnpm dlx vercel env pull .env.local
```

- [ ] **Step 3: Run migration against the production branch**

```bash
pnpm db:push
```
Expected: `users` table created on the primary Neon branch.

- [ ] **Step 4: Deploy a preview**

```bash
pnpm dlx vercel deploy
```
Expected: build succeeds; visiting the preview URL shows the Clerk sign-in flow and, after login, the authed home.

- [ ] **Step 5: Promote to production**

```bash
pnpm dlx vercel deploy --prod
```
Expected: production URL live and authed.

- [ ] **Step 6: Document setup + commit**

Add a `README.md` "Getting started" section (env vars, `pnpm db:push`, `pnpm dev`). Commit:
```bash
git add -A
git commit -m "chore: provision Neon+Clerk and deploy to Vercel"
```

**Milestone 0 acceptance:** a signed-in user reaches an authed home page on the production Vercel URL, backed by a live Neon `users` table; `pnpm test` and `pnpm build` are green.

---

## M1 — Import & Read (outline; expand before building)

**Scope:** Import wizard (paste, URL via `/api/import`, file upload, numbered auto-parse detection stub), create `documents` + `sources` + `paragraphs`, render the austere single-column reading surface (`ReadingSurface`, `NodeSection` for a trivial one-node tree, `SourcePassage`).
**Key files:** `app/new/page.tsx`, `app/api/import/route.ts`, `lib/import/{paste,url,file}.ts`, `lib/import/paragraphs.ts`, `lib/actions/documents.ts`, `app/d/[docId]/page.tsx`, components above.
**Tests:** paragraph splitter (Vitest); HTML→paragraph cleanup on a saved Gutenberg fixture; E2E import→read.
**Acceptance:** paste Russell → see clean paragraphs at `/d/[id]`; import Gutenberg URL yields the same.

## M2 — Tree (outline)

**Scope:** `nodes` + `node_source_ranges` CRUD (owner-only); numbered-structure parser building the tree on import (Tractatus); manual add-child / move / collapse; recursive `NodeSection` with `▾/▸` and indentation; `TreeEditControls`.
**Tests:** numbering parser (`1`,`1.1`,`1.11` → tree) with Tractatus fixture; move/reorder Server Actions + `authorize` denies collaborator.
**Acceptance:** import Tractatus → auto-built decimal tree; manually nest a Russell paragraph under another and reload.

## M3 — Annotations (outline)

**Scope:** span-splitting renderer (overlaps), `SelectionPopover` + DOM↔offset mapping, `inline_annotations` (color/note/tags, collapsed `InlineNote`), `node_annotations` (`NodeAnnotationReveal` on hover/tap), tag storage.
**Tests:** span-splitting unit tests (adjacent/nested/overlapping ranges); offset-mapping (jsdom); E2E select→highlight→note.
**Acceptance:** highlight a phrase (yellow), add a note collapsed by default, reveal on click; add a node note shown on hover.

## M4 — Translations (outline)

**Scope:** add a second `source` to a document, node-level `node_source_ranges` per source, interleaved rendering in `NodeSection`, per-reader translation visibility toggle; inline annotations scoped to their source.
**Tests:** interleaved render shows both sources per node; inline annotation only appears on its own source.
**Acceptance:** add English Tractatus alongside German → stacked per proposition; a German highlight does not bleed into English.

## M5 — Sharing & Threads (outline)

**Scope:** `memberships` + `authorize()` full matrix, share UI (owner adds collaborators by email/Clerk lookup), `AuthorFilter`, `comments` with `parent_comment_id` nesting on both annotation kinds.
**Tests:** `authorize()` matrix unit tests; collaborator can annotate but not edit tree; nested comment thread renders in order.
**Acceptance:** share to a second account → they add annotations + threaded replies; owner filters by author.

## M6 — Cloning (outline)

**Scope:** `cloneDocument(docId, userId)` transaction: copy `sources`/`paragraphs`/`nodes`/`node_source_ranges` with id remap, set `cloned_from`, create owner membership; **skip** annotations/comments/memberships.
**Tests:** clone copies layout + all translations; asserts zero annotations/comments; cloner is owner with edit rights.
**Acceptance:** clone a shared doc → same structure/translations, no highlights/notes, full edit.

## M7 — Palette & Polish (outline)

**Scope:** `CommandPalette` (cmdk) wiring all actions + hotkeys; restyle Clerk pages to tokens; mobile breakpoints (hide tree-build controls, hover→tap); empty/loading/error states; optional in-doc search (stretch).
**Acceptance:** `⌘K` runs annotate/add-child/move/add-translation/clone/jump; usable on a phone.

---

## Self-Review

- **Spec coverage:** import (M1), tree + auto-parse numbering (M2), inline + node annotations + tags + overlap + collapsed/hover (M3), translations + interleaved + node-level alignment + per-source inline (M4), cloud accounts (M0), async sharing + roles + author filter + threads (M5), cloning strips annotations (M6), single austere surface + palette + mobile (M2/M3/M7). All spec sections map to a milestone.
- **Placeholder scan:** M0 tasks contain real code/commands; M1–M7 are explicitly labeled outlines to expand, not execution-ready placeholders.
- **Type consistency:** `requireUser`/`upsertUser`, `db`, `users`, `authorize` names are used consistently across tasks and the frontend doc.
