# Local Docker E2E Environment — Design

**Date:** 2026-07-09
**Status:** Approved (design phase)

## Goal

Run Scholia fully e2e on a developer machine with a single `docker compose up`, with **no Vercel deploy, no Clerk account, and no Neon cloud** required. The environment bundles Postgres, runs the app in a container, bypasses auth behind a local-only flag, and seeds a realistic document (a Gutenberg book imported through the real import code path) plus a small demo tree and comments.

## Background / constraints discovered in the code

- **DB driver is Neon-specific.** `lib/db/index.ts` uses `drizzle-orm/neon-http` + `@neondatabase/serverless`'s `neon()`, an HTTP driver that does **not** speak the Postgres wire protocol. It cannot point at a plain `postgres` container directly.
- **`db.batch()` is used in 4 places** (`lib/actions/documents.ts:59`, `lib/actions/tree.ts:45/71/88`). `db.batch` exists only on the Neon/LibSQL/D1 drivers — **not** on `node-postgres`/`postgres-js`. So swapping to a plain Postgres driver would break those call sites. We therefore **keep the neon-http driver** and put a Neon-protocol proxy in front of vanilla Postgres.
- **Clerk has no offline mode.** Its official local-dev story is a cloud development instance + test keys + test-mode OTP `424242` + `@clerk/testing` tokens — all requiring an account and internet. For a self-contained compose we use a **dev-bypass flag** instead, leaving Clerk fully intact for the real Vercel path.
- **Auth surface is small:** `middleware.ts`, `ClerkProvider` in `app/layout.tsx`, `requireUser` in `lib/auth/current-user.ts`, and two raw `auth()` calls (`app/api/import/route.ts`, `lib/actions/extract.ts`). Sign-in/up pages exist but are unreachable in bypass mode.
- **Import via URL path:** `POST /api/import` → server `fetch(url)` → `htmlToParagraphs(html)` → client joins `paragraphs.join("\n\n")` → `createDocument({ title, text })`. `createDocument` re-paragraphizes and calls `planNodes`. It uses `db.batch` and calls **no** `revalidatePath`, so it is safe to call from a standalone script.
- **Tree/annotation actions call `revalidatePath`** and therefore throw outside a Next request context — the seed must not call them; it writes those rows directly via Drizzle.

## Architecture

### Auth: flag-gated dev bypass

- New module `lib/auth/mode.ts` exporting `isDevAuth()`: returns `true` iff `process.env.SCHOLIA_AUTH === "dev"` **and** `process.env.VERCEL` is unset (hard guard so it can never engage on a Vercel deploy).
- `lib/auth/current-user.ts`:
  - `requireUser()` — if `isDevAuth()`, upsert and return the fixed local user `{ id: "local-dev", displayName: "Local Dev" }` without touching Clerk.
  - Add a shared `requireUserId()` used by the two raw `auth()` call sites so they honor bypass too. Refactor `app/api/import/route.ts` and `lib/actions/extract.ts` to call it.
- `middleware.ts` — if `isDevAuth()`, export a pass-through middleware; otherwise the current `clerkMiddleware`. (Read the flag at module load.)
- `app/layout.tsx` — if `isDevAuth()`, render `children` without `ClerkProvider` (it throws without a publishable key); otherwise wrap as today.

The fixed user id `local-dev` becomes the `ownerId` of the seeded document, so `authorize` (owner-only) passes for all interactive edits.

### DB: Neon HTTP proxy over vanilla Postgres

- Container `db`: `postgres:16-alpine`, database `scholia`, user/pass `postgres/postgres`.
- Container `neon-proxy`: `ghcr.io/timowilhelm/local-neon-http-proxy`, configured to forward to `db`. The **running app** talks to this over HTTP.
- `lib/db/index.ts`: when `process.env.SCHOLIA_LOCAL_DB === "1"`, set `neonConfig.fetchEndpoint` (and `useSecureWebSocket=false` / `poolQueryViaFetch=true` as needed) to point the neon-http driver at `neon-proxy:4444` over `http`. Production path (flag unset) is unchanged.
- **Schema push + seed connect to Postgres directly** (`db:5432`) — `drizzle-kit push` and the seed's raw SQL do not use the neon-http driver, so they bypass the proxy entirely.

### Compose services & order

1. `db` — Postgres, with a healthcheck (`pg_isready`).
2. `neon-proxy` — depends on `db` healthy.
3. `migrate-seed` — one-shot container (app image) that waits for `db`, runs `drizzle-kit push`, then `tsx scripts/seed.ts`, then exits.
4. `app` — depends on `migrate-seed` completing; runs `next dev` with the repo bind-mounted for hot reload; published on `localhost:3000`.

### Container image

- Dev `Dockerfile` (single stage): Node 24, `corepack enable`, `pnpm install`, source mounted at runtime. Used by both `migrate-seed` and `app`.
- `.dockerignore` excludes `node_modules`, `.next`, `.git`.

### Env

- `.env.docker` (committed, non-secret): `SCHOLIA_AUTH=dev`, `SCHOLIA_LOCAL_DB=1`, `DATABASE_URL=postgres://postgres:postgres@db:5432/scholia`, and the neon-proxy host for the app. No Clerk keys.

## Seed (`scripts/seed.ts`)

1. **Import the book through the real path.** `fetch("https://www.gutenberg.org/files/5827/5827-h/5827-h.htm")` → `htmlToParagraphs(html)` → `createDocument({ title, text: paragraphs.join("\n\n") })`. Reuses the exact import functions; only the HTTP hop and Clerk check are skipped. (Ensure the `local-dev` user row exists first so the FK/`authorize` are satisfied.)
2. **Demo indent tree.** Read the created top-level nodes ordered by position (the book has no numbered structure, so `planNodes` yields a flat list). Nest the first three to demonstrate depth, via direct Drizzle `update`s to `parentId`/`position`:
   ```
   - block 0 (first)
       - block 1 (second)
           - block 2 (third)
   - block 3 (fourth)
   - … rest unchanged
   ```
3. **Comments (direct Drizzle inserts).**
   - A **node annotation** ("random comment") on the first two blocks (nodes 0 and 1), authored by `local-dev`.
   - One **inline annotation** ("inline comment") inside each of the first two blocks — a short offset range within each node's source span (respecting `startOffset < endOffset` and the node's `[start,end)`), authored by `local-dev`, with a default color and note.
4. **Idempotency:** seed is a no-op if a document titled like the book already exists (skip), so repeated `compose up` runs don't duplicate.

## Files to add / change

**Add:** `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `.env.docker`, `scripts/seed.ts`, `lib/auth/mode.ts`.
**Change:** `lib/db/index.ts` (local fetchEndpoint), `lib/auth/current-user.ts` (bypass + `requireUserId`), `middleware.ts` (bypass), `app/layout.tsx` (conditional `ClerkProvider`), `app/api/import/route.ts` + `lib/actions/extract.ts` (use `requireUserId`), `.env.example`/README (document the flags).

## Non-goals

- No production Docker image / no change to the Vercel deploy path.
- No self-hosted Clerk, no mock login form (dev-bypass only).
- No driver swap away from neon-http (would break `db.batch`).
- No new automated tests beyond keeping the existing suite green (this is a dev/e2e convenience, exercised by hand).

## Risks

- The community `local-neon-http-proxy` image is third-party; if it's unavailable, the fallback is a driver-swap branch + rewriting the 4 `db.batch` sites as transactions (larger change, explicitly avoided here).
- Gutenberg fetch requires network at seed time; the seed fails loudly if the book can't be fetched.
- `neonConfig` tuning (http vs ws, ports) may need iteration against the proxy image's actual interface during implementation.
