# Local Docker E2E Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Scholia end-to-end with a single `docker compose up` — bundled Postgres, no Vercel deploy, no Clerk account, no Neon cloud — seeded with a Gutenberg book imported through the real import code path plus a small demo tree and comments.

**Architecture:** Auth is bypassed behind a local-only flag (`SCHOLIA_AUTH=dev`, inert on Vercel) so no Clerk keys are needed. The app keeps its `neon-http` Drizzle driver (required because it uses `db.batch`, a Neon-only API) and talks to a `local-neon-http-proxy` container that fronts a vanilla `postgres:16` container. A one-shot service pushes the schema and runs a `tsx` seed that reuses `htmlToParagraphs` + `createDocument`.

**Tech Stack:** Next.js 16, Drizzle ORM (`drizzle-orm/neon-http`), `@neondatabase/serverless`, Postgres 16, `ghcr.io/timowilhelm/local-neon-http-proxy`, Docker Compose, `tsx`, Vitest.

## Global Constraints

- **Node 24** in all containers; **pnpm** via `corepack enable`.
- **No new npm dependencies** — everything needed (`tsx`, `drizzle-kit`, `dotenv`, `@neondatabase/serverless`) is already in `package.json`.
- **Do not swap the DB driver** away from `neon-http` — `db.batch` (`lib/actions/documents.ts`, `lib/actions/tree.ts`) exists only on Neon/LibSQL/D1 drivers.
- **The bypass must never engage on Vercel:** `isDevAuth()` returns true only when `SCHOLIA_AUTH === "dev"` AND `process.env.VERCEL` is unset.
- **Production code path unchanged:** every auth/db branch is gated on an env flag that is absent in the Vercel environment.
- **Testing discipline (repo preference):** write implementation and tests together, then a single green `pnpm test` run — do NOT do a separate "watch it fail" step. New unit tests must be hermetic (no DB/network); pure functions only.
- **Deploy-safety:** after any change under `app/`, `lib/`, or `middleware.ts`, run `pnpm build` (the ES2017 `tsc` target catches errors Vitest does not).
- **Fixed dev identity:** local user id is the literal string `local-dev`, display name `Local Dev`.
- **Compose env values (verbatim):**
  - Postgres: user `postgres`, password `postgres`, db `scholia`, service name `db`, port `5432`.
  - Proxy: service `neon-proxy`, HTTP port `4444`, `PG_CONNECTION_STRING=postgres://postgres:postgres@db:5432/scholia`.
  - App DB URL (via proxy): `postgres://postgres:postgres@neon-proxy:5432/scholia`.
  - Schema-push DB URL (direct): `postgres://postgres:postgres@db:5432/scholia`.

---

## File Structure

**Create:**
- `lib/auth/mode.ts` — the `isDevAuth()` guard (single responsibility: decide if bypass is active).
- `lib/auth/__tests__/mode.test.ts` — hermetic tests for the guard.
- `scripts/seed-tree.ts` — pure `computeDemoNesting()` helper (testable tree math).
- `scripts/__tests__/seed-tree.test.ts` — tests for the helper.
- `scripts/seed.ts` — the seed runner (book import + nesting + comments).
- `scripts/docker-seed.sh` — entrypoint for the one-shot migrate+seed service.
- `Dockerfile` — dev image (Node 24 + pnpm install + source).
- `.dockerignore`.
- `docker-compose.yml`.

**Modify:**
- `lib/auth/current-user.ts` — dev branch in `requireUser`; add `getUserId()`.
- `app/api/import/route.ts` — use `getUserId()`.
- `lib/actions/extract.ts` — use `getUserId()`.
- `middleware.ts` — pass-through when `isDevAuth()`.
- `app/layout.tsx` — omit `ClerkProvider` when `isDevAuth()`.
- `lib/db/index.ts` — local `neonConfig.fetchEndpoint` when `SCHOLIA_LOCAL_DB=1`.
- `.env.example` — document the local flags.
- `README.md` — add a "Local Docker e2e" section.

---

## Task 1: Auth mode guard

**Files:**
- Create: `lib/auth/mode.ts`
- Test: `lib/auth/__tests__/mode.test.ts`

**Interfaces:**
- Produces: `isDevAuth(): boolean` — true iff `process.env.SCHOLIA_AUTH === "dev"` and `process.env.VERCEL` is falsy.

- [ ] **Step 1: Write the module and its test together**

Create `lib/auth/mode.ts`:

```ts
/**
 * Local-only auth bypass switch. True only in the docker/e2e environment:
 * `SCHOLIA_AUTH=dev` must be set AND we must NOT be running on Vercel, so the
 * bypass can never activate on a real deploy.
 */
export function isDevAuth(): boolean {
  return process.env.SCHOLIA_AUTH === "dev" && !process.env.VERCEL;
}
```

Create `lib/auth/__tests__/mode.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { isDevAuth } from "@/lib/auth/mode";

const orig = { auth: process.env.SCHOLIA_AUTH, vercel: process.env.VERCEL };
afterEach(() => {
  process.env.SCHOLIA_AUTH = orig.auth;
  process.env.VERCEL = orig.vercel;
});

describe("isDevAuth", () => {
  it("is true when SCHOLIA_AUTH=dev and not on Vercel", () => {
    process.env.SCHOLIA_AUTH = "dev";
    delete process.env.VERCEL;
    expect(isDevAuth()).toBe(true);
  });
  it("is false when SCHOLIA_AUTH is unset", () => {
    delete process.env.SCHOLIA_AUTH;
    delete process.env.VERCEL;
    expect(isDevAuth()).toBe(false);
  });
  it("is false on Vercel even if SCHOLIA_AUTH=dev", () => {
    process.env.SCHOLIA_AUTH = "dev";
    process.env.VERCEL = "1";
    expect(isDevAuth()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test — expect green**

Run: `pnpm test mode`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/auth/mode.ts lib/auth/__tests__/mode.test.ts
git commit -m "feat(auth): add local-only isDevAuth bypass guard"
```

---

## Task 2: Dev branch in current-user + getUserId

**Files:**
- Modify: `lib/auth/current-user.ts`
- Modify: `app/api/import/route.ts`
- Modify: `lib/actions/extract.ts`

**Interfaces:**
- Consumes: `isDevAuth()` from Task 1; `upsertUser` from `@/lib/auth/upsert-user`.
- Produces:
  - `requireUser(): Promise<{ id: string; displayName: string }>` — in dev mode returns `{ id: "local-dev", displayName: "Local Dev" }` after upserting that row.
  - `getUserId(): Promise<string | null>` — dev mode returns `"local-dev"`; otherwise Clerk `userId` (or null).

- [ ] **Step 1: Rewrite `lib/auth/current-user.ts`**

```ts
import { auth, currentUser } from "@clerk/nextjs/server";
import { upsertUser } from "@/lib/auth/upsert-user";
import { isDevAuth } from "@/lib/auth/mode";

export { upsertUser };

const DEV_USER = { id: "local-dev", displayName: "Local Dev" };

export async function requireUser() {
  if (isDevAuth()) {
    await upsertUser({ id: DEV_USER.id, email: "dev@localhost", displayName: DEV_USER.displayName });
    return { id: DEV_USER.id, displayName: DEV_USER.displayName };
  }
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthenticated");
  const cu = await currentUser();
  const email = cu?.emailAddresses[0]?.emailAddress ?? "";
  const displayName = cu?.firstName || cu?.username || email || "Reader";
  await upsertUser({ id: userId, email, displayName });
  return { id: userId, displayName };
}

/** Lightweight id-only check used by route handlers / actions that don't need a display name. */
export async function getUserId(): Promise<string | null> {
  if (isDevAuth()) return DEV_USER.id;
  const { userId } = await auth();
  return userId;
}
```

- [ ] **Step 2: Update `app/api/import/route.ts`**

Replace the top of the handler. Change the import line:

```ts
import { getUserId } from "@/lib/auth/current-user";
```

(remove `import { auth } from "@clerk/nextjs/server";`) and replace the auth check:

```ts
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
```

Leave the rest of the handler unchanged.

- [ ] **Step 3: Update `lib/actions/extract.ts`**

```ts
"use server";
import { htmlToParagraphs, type ExtractedText } from "@/lib/import/html";
import { getUserId } from "@/lib/auth/current-user";

export async function extractHtml(html: string): Promise<ExtractedText> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthenticated");
  return htmlToParagraphs(html);
}
```

- [ ] **Step 4: Run tests + build**

Run: `pnpm test`
Expected: PASS (existing suite still green — action tests mock `requireUser`, unaffected).

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/current-user.ts app/api/import/route.ts lib/actions/extract.ts
git commit -m "feat(auth): dev-mode bypass in requireUser + getUserId for import/extract"
```

---

## Task 3: Middleware + layout respect dev mode

**Files:**
- Modify: `middleware.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `isDevAuth()` from Task 1.

- [ ] **Step 1: Rewrite `middleware.ts`**

```ts
import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { isDevAuth } from "@/lib/auth/mode";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/webhooks(.*)"]);

// In dev-bypass mode, skip Clerk entirely (the ternary short-circuits, so
// clerkMiddleware() is never invoked and no keys are required).
export default isDevAuth()
  ? () => NextResponse.next()
  : clerkMiddleware(async (auth, req) => {
      if (!isPublic(req)) await auth.protect();
    });

export const config = { matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"] };
```

- [ ] **Step 2: Update `app/layout.tsx`**

Add the import near the top:

```ts
import { isDevAuth } from "@/lib/auth/mode";
```

Replace the `return (...)` block of `RootLayout` with:

```tsx
  const tree = (
    <html
      lang="en"
      className={`${serif.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );

  // ClerkProvider throws without a publishable key, so omit it in dev-bypass mode.
  return isDevAuth() ? tree : <ClerkProvider>{tree}</ClerkProvider>;
```

Leave the `ClerkProvider` import in place (importing is harmless; only rendering needs a key).

- [ ] **Step 3: Run tests + build**

Run: `pnpm test`
Expected: PASS (unchanged).

Run: `pnpm build`
Expected: build succeeds (no Clerk keys required at build time for these files).

- [ ] **Step 4: Commit**

```bash
git add middleware.ts app/layout.tsx
git commit -m "feat(auth): pass-through middleware and no ClerkProvider in dev-bypass mode"
```

---

## Task 4: Local Neon HTTP proxy DB config

**Files:**
- Modify: `lib/db/index.ts`

**Interfaces:**
- Produces: unchanged `db` export; when `SCHOLIA_LOCAL_DB === "1"`, the `neon-http` driver's fetch endpoint is redirected to `http://<host>:4444/sql`.

- [ ] **Step 1: Rewrite `lib/db/index.ts`**

```ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon, neonConfig } from "@neondatabase/serverless";
import * as schema from "./schema";

// Local docker e2e: route the neon-http driver at the local proxy container
// (which fronts a vanilla Postgres) instead of Neon's cloud SQL-over-HTTP
// endpoint. `host` comes from DATABASE_URL (the `neon-proxy` service).
if (process.env.SCHOLIA_LOCAL_DB === "1") {
  neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
}

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

- [ ] **Step 2: Build check**

Run: `pnpm build`
Expected: build succeeds.

(No unit test — this is driver wiring, verified live in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add lib/db/index.ts
git commit -m "feat(db): route neon-http driver at local proxy when SCHOLIA_LOCAL_DB=1"
```

---

## Task 5: Seed script (book import + demo tree + comments)

**Files:**
- Create: `scripts/seed-tree.ts`
- Test: `scripts/__tests__/seed-tree.test.ts`
- Create: `scripts/seed.ts`

**Interfaces:**
- Produces: `computeDemoNesting(topLevelIds: string[]): NodeUpdate[]` where `NodeUpdate = { id: string; parentId: string | null; position: number }`.
- Consumes: `htmlToParagraphs` (`@/lib/import/html`), `createDocument` (`@/lib/actions/documents`), schema tables, `db` (`@/lib/db`).

- [ ] **Step 1: Write `scripts/seed-tree.ts` and its test together**

Create `scripts/seed-tree.ts`:

```ts
export interface NodeUpdate {
  id: string;
  parentId: string | null;
  position: number;
}

/**
 * Given the ordered top-level node ids of a freshly imported document, produce
 * the updates that nest the 2nd node under the 1st and the 3rd under the 2nd,
 * then re-number the remaining top-level nodes contiguously. Yields:
 *   - block 0 (top-level, pos 0)
 *       - block 1 (child of 0)
 *           - block 2 (child of 1)
 *   - block 3 (top-level, pos 1)
 *   - ...
 * Returns [] when there are fewer than 3 top-level nodes (nothing to demo).
 */
export function computeDemoNesting(topLevelIds: string[]): NodeUpdate[] {
  if (topLevelIds.length < 3) return [];
  const [a, b, c, ...rest] = topLevelIds;
  const updates: NodeUpdate[] = [
    { id: b, parentId: a, position: 0 },
    { id: c, parentId: b, position: 0 },
  ];
  [a, ...rest].forEach((id, i) => updates.push({ id, parentId: null, position: i }));
  return updates;
}
```

Create `scripts/__tests__/seed-tree.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDemoNesting } from "../seed-tree";

describe("computeDemoNesting", () => {
  it("nests the 2nd under 1st, 3rd under 2nd, and renumbers the rest", () => {
    expect(computeDemoNesting(["a", "b", "c", "d", "e"])).toEqual([
      { id: "b", parentId: "a", position: 0 },
      { id: "c", parentId: "b", position: 0 },
      { id: "a", parentId: null, position: 0 },
      { id: "d", parentId: null, position: 1 },
      { id: "e", parentId: null, position: 2 },
    ]);
  });
  it("returns [] when there are fewer than 3 top-level nodes", () => {
    expect(computeDemoNesting(["a", "b"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — expect green**

Run: `pnpm test seed-tree`
Expected: PASS (2 tests).

- [ ] **Step 3: Write `scripts/seed.ts`**

```ts
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, nodes, nodeSourceRanges, nodeAnnotations, inlineAnnotations } from "@/lib/db/schema";
import { htmlToParagraphs } from "@/lib/import/html";
import { createDocument } from "@/lib/actions/documents";
import { computeDemoNesting } from "./seed-tree";

const BOOK_URL = "https://www.gutenberg.org/files/5827/5827-h/5827-h.htm";
const DEV_USER = "local-dev";

async function main() {
  // Idempotent: if the dev user already owns a document, do nothing.
  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.ownerId, DEV_USER));
  if (existing.length > 0) {
    console.log("Seed: dev user already has documents — skipping.");
    return;
  }

  // 1) Import the book through the REAL import path (fetch -> htmlToParagraphs -> createDocument).
  console.log("Seed: fetching", BOOK_URL);
  const res = await fetch(BOOK_URL, { headers: { "user-agent": "ScholiaBot/1.0" } });
  if (!res.ok) throw new Error(`Seed fetch failed: ${res.status}`);
  const html = await res.text();
  const { title, paragraphs } = htmlToParagraphs(html);
  if (paragraphs.length === 0) throw new Error("Seed: no paragraphs extracted from book");
  const docId = await createDocument({ title: title ?? "Seeded Book", text: paragraphs.join("\n\n") });
  console.log(`Seed: created document ${docId} (${paragraphs.length} paragraphs)`);

  // 2) Demo indent tree over the first three top-level nodes.
  const top = await db
    .select()
    .from(nodes)
    .where(and(eq(nodes.documentId, docId), isNull(nodes.parentId)))
    .orderBy(nodes.position);
  for (const u of computeDemoNesting(top.map((n) => n.id))) {
    await db.update(nodes).set({ parentId: u.parentId, position: u.position }).where(eq(nodes.id, u.id));
  }
  console.log("Seed: nested the first three blocks");

  // 3) Comments on the first two blocks (original reading order): a node
  //    annotation on each, and one inline annotation inside each.
  for (const n of top.slice(0, 2)) {
    await db.insert(nodeAnnotations).values({
      documentId: docId,
      nodeId: n.id,
      authorId: DEV_USER,
      note: "Seeded demo comment on this block.",
      tags: [],
    });
    const [range] = await db.select().from(nodeSourceRanges).where(eq(nodeSourceRanges.nodeId, n.id));
    if (range) {
      const start = range.startOffset;
      const end = Math.min(range.endOffset, start + 24);
      if (end > start) {
        await db.insert(inlineAnnotations).values({
          documentId: docId,
          sourceId: range.sourceId,
          authorId: DEV_USER,
          startOffset: start,
          endOffset: end,
          color: "yellow",
          note: "inline comment",
          tags: [],
        });
      }
    }
  }
  console.log("Seed: added node + inline comments on the first two blocks");
  console.log("Seed: done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
```

- [ ] **Step 4: Full test run**

Run: `pnpm test`
Expected: PASS (new pure test green; `seed.ts` is not imported by any test, so it doesn't run here — it's exercised live in Task 8).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-tree.ts scripts/__tests__/seed-tree.test.ts scripts/seed.ts
git commit -m "feat(seed): book import via real path + demo tree nesting + comments"
```

---

## Task 6: Dev Dockerfile

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Write `Dockerfile`**

```dockerfile
# Dev image for local e2e. Ships source + deps so the one-shot seed service
# works standalone; the `app` service bind-mounts source over this for hot reload.
FROM node:24-slim

RUN corepack enable
WORKDIR /app

# Install deps first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000
CMD ["pnpm", "exec", "next", "dev", "-H", "0.0.0.0", "-p", "3000"]
```

- [ ] **Step 2: Write `.dockerignore`**

```
node_modules
.next
.git
.env.local
coverage
*.tsbuildinfo
.superpowers
```

- [ ] **Step 3: Build the image to verify it succeeds**

Run: `docker build -t scholia-dev .`
Expected: image builds; `pnpm install --frozen-lockfile` completes without lockfile errors.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat(docker): dev image (node 24 + pnpm) for local e2e"
```

---

## Task 7: Compose stack + migrate/seed entrypoint

**Files:**
- Create: `scripts/docker-seed.sh`
- Create: `docker-compose.yml`

- [ ] **Step 1: Write `scripts/docker-seed.sh`**

```sh
#!/bin/sh
set -e

# Schema push talks DIRECTLY to Postgres (drizzle-kit uses the standard pg
# protocol, not the neon-http driver, so it bypasses the proxy).
echo "==> Pushing schema to Postgres"
DATABASE_URL="postgres://postgres:postgres@db:5432/scholia" pnpm drizzle-kit push --force

# Seed runs the app's own code, so it uses the neon-http driver via the proxy.
echo "==> Seeding data"
SCHOLIA_LOCAL_DB=1 \
SCHOLIA_AUTH=dev \
DATABASE_URL="postgres://postgres:postgres@neon-proxy:5432/scholia" \
  pnpm exec tsx scripts/seed.ts

echo "==> Migrate + seed complete"
```

Note: if `drizzle-kit push --force` errors that `--force` is unknown, drop the flag — a fresh empty DB produces only create-table statements and will not prompt.

- [ ] **Step 2: Write `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: scholia
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d scholia"]
      interval: 5s
      timeout: 5s
      retries: 10

  neon-proxy:
    image: ghcr.io/timowilhelm/local-neon-http-proxy:main
    environment:
      PG_CONNECTION_STRING: postgres://postgres:postgres@db:5432/scholia
    ports:
      - "4444:4444"
    depends_on:
      db:
        condition: service_healthy

  migrate-seed:
    build: .
    command: ["sh", "scripts/docker-seed.sh"]
    depends_on:
      db:
        condition: service_healthy
      neon-proxy:
        condition: service_started
    restart: "no"

  app:
    build: .
    environment:
      SCHOLIA_AUTH: dev
      SCHOLIA_LOCAL_DB: "1"
      DATABASE_URL: postgres://postgres:postgres@neon-proxy:5432/scholia
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      migrate-seed:
        condition: service_completed_successfully
```

- [ ] **Step 3: Validate compose config**

Run: `docker compose config`
Expected: prints the resolved config with no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/docker-seed.sh docker-compose.yml
git commit -m "feat(docker): compose stack (postgres + neon proxy + migrate/seed + app)"
```

---

## Task 8: Docs + full end-to-end verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Append local flags to `.env.example`**

Add below the existing lines:

```
# --- Local docker e2e only (see README) — leave unset for the Vercel/Neon path ---
# SCHOLIA_AUTH=dev
# SCHOLIA_LOCAL_DB=1
```

- [ ] **Step 2: Add a README section**

Append to `README.md`:

```markdown
## Local e2e with Docker

Run the whole app locally — no Vercel, no Clerk account, no Neon cloud:

    docker compose up --build

- App: http://localhost:3000 (auth is bypassed via `SCHOLIA_AUTH=dev`; you are the fixed `Local Dev` user).
- Postgres runs in-compose; the `neon-proxy` service lets the app's `neon-http`
  driver talk to it. Schema is pushed and a Gutenberg book is seeded (imported
  through the real Import-via-URL path) with a small demo tree and comments.
- Re-running is idempotent (seed skips if the dev user already owns a document).
- Reset everything: `docker compose down -v` (the `-v` drops the Postgres volume).

The bypass is inert on Vercel (`isDevAuth()` requires `VERCEL` to be unset), so
production behavior is unchanged.
```

- [ ] **Step 3: Bring the stack up**

Run: `docker compose up --build`
Expected sequence in logs:
- `db` becomes healthy.
- `neon-proxy` starts.
- `migrate-seed` logs `==> Pushing schema`, `==> Seeding data`, `Seed: created document …`, `==> Migrate + seed complete`, then exits 0.
- `app` logs Next.js `Ready` on `0.0.0.0:3000`.

- [ ] **Step 4: Verify in the browser**

Open http://localhost:3000 and confirm:
- No sign-in redirect (dev bypass active).
- The seeded book document is listed; opening it shows the tree with the first three blocks nested (block 0 › block 1 › block 2) and the rest flat.
- The first two blocks each show a node comment, and each contains a yellow inline highlight ("inline comment").

- [ ] **Step 5: Verify idempotency**

Run: `docker compose up migrate-seed` again (without `-v`).
Expected: `Seed: dev user already has documents — skipping.` and exit 0.

- [ ] **Step 6: Commit**

```bash
git add .env.example README.md
git commit -m "docs: local docker e2e instructions and env flags"
```

---

## Self-Review Notes

- **Spec coverage:** dev-bypass auth (Tasks 1–3), Neon proxy over Postgres (Task 4 + 7), book seeded via real import path (Task 5), demo indent tree + node/inline comments on first two blocks (Task 5), compose bring-up + seed order (Task 7), docs (Task 8). All spec sections map to a task.
- **Deviation from spec:** non-secret local env is set inline in `docker-compose.yml` instead of a committed `.env.docker`, because `.gitignore` ignores `.env*` (except `.env.example`). Same effect, no gitignore fight. Direct-vs-proxy DB URLs are split in `scripts/docker-seed.sh` (push needs the direct Postgres wire; seed needs the proxy).
- **Type consistency:** `isDevAuth`, `getUserId`, `computeDemoNesting`/`NodeUpdate` names are used identically across tasks. `local-dev` / `Local Dev` constants match between `current-user.ts` and `seed.ts`.
- **Risk (third-party proxy):** if `ghcr.io/timowilhelm/local-neon-http-proxy` is unavailable or its port/endpoint differs, Task 8 Step 3 fails visibly at `migrate-seed`; the fallback (spec Non-goals) is a driver swap + rewriting `db.batch` sites, which is out of scope here.
```
