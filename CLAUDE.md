# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **PII: this is a public GitHub repo.** Never write personal data — real email addresses, names, phone numbers, tokens — into any committed file (code, docs, OpenSpec artifacts, comments). Refer to the owner as "the admin"/"the owner" and use placeholders (`admin@example.com`) in examples.

## What this is

Scholia — a tree-structured, multi-translation close-reading and annotation web app. Next.js 16 (App Router) + Neon Postgres + Drizzle + Clerk, deployed on Vercel Hobby. Product/design docs live in `docs/` (`docs/00-product-spec.md`, `docs/design/00-architecture.md`); milestone plans in `docs/design/`.

## Finding UI code — read `docs/ui-map.md` first

**[`docs/ui-map.md`](docs/ui-map.md) maps every visible part of the app to the component that renders it, the context that drives its behaviour, and the CSS block that styles it** — plus a glossary of plain-English names ("the running head", "the edge tab", "the Aa sheet") and the places where names collide (there are two ⚙ buttons; "note" means two different things).

- **Start there, don't grep**, whenever a request names something visible rather than a file. It resolves a description to a path in one read.
- **Keep it current in the same commit.** Adding, removing, renaming, or moving a UI component — or introducing a new on-screen name — means updating the map alongside the code. A stale map is worse than none: it sends a cold-context agent confidently to the wrong file.

## Commands

```bash
pnpm dev              # dev server
pnpm build            # production build — see gotcha below, this catches errors Vitest won't
pnpm lint             # eslint
pnpm test             # vitest run (once)
pnpm test spans       # run a subset — arg is a filename/path filter (script is `vitest run`)
pnpm test:watch       # vitest watch mode
pnpm db:push          # push Drizzle schema to Neon — no migration files (see drift hazard)
pnpm db:studio        # drizzle-kit studio
pnpm backfill         # scripts/backfill-nodes.ts (one-off data backfills, uses .env.local)
```

Requires Node 24 and pnpm (`corepack enable`). Secrets in `.env.local` (`DATABASE_URL`, Clerk keys); `.env.example` lists the full set.

**End-to-end check without Vercel/Clerk/Neon:** `docker compose up --build -d app` runs the full app locally at **http://localhost:3000/** with auth bypassed and a local Postgres (see the compose file / `local-docker-e2e` memory for the bypass + neon-proxy gotchas). Rebuild the `app` service with the same command after code changes; this is the way to verify a change in the real UI, not just tests.

## Architecture

**Request shapes** (from `docs/design/00-architecture.md`):
- **Reads** = React Server Components hitting Neon directly (no client data-fetching lib). The document read path is `app/d/[docId]/page.tsx` → `lib/data/documents.ts::getDocument` → `lib/tree/build.ts::buildTree`.
- **Mutations** = Server Actions in `lib/actions/*` (`"use server"`), each gated by an auth check then `revalidatePath(\`/d/${documentId}\`)`.
- **URL/HTML import** = Route Handler `app/api/import/route.ts` (server-side fetch + `@mozilla/readability`/`linkedom` cleanup in `lib/import/`), avoiding browser CORS.
- **Auth** = `proxy.ts` (Clerk) protects everything except sign-in/up and webhooks. (Next 16 renamed the `middleware` file convention to `proxy`; `export default` + `export const config` are unchanged, and it now defaults to the Node.js runtime.)

**The core invariant — immutable Sources + integer offsets.** A `source` row holds the full text and never changes. Everything layered on top (`nodes` → tree structure, `inline_annotations`, `node_annotations`) references it by `{startOffset, endOffset}` character positions, not by mutating prose. This is why there's no rich-text editor.

**The load-bearing algorithm** is `lib/annotations/spans.ts::splitSpans`: it takes a node's text + overlapping annotations and produces ordered, non-overlapping `<span>` segments, each tagged with the annotations covering it (input order preserved, oldest→newest, so the newest highlight renders "on top"). Overlaps are handled by computing boundary points, never by editing text. If you touch annotation rendering, this function and its tests are the contract.

**Schema** (`lib/db/schema.ts`): `users` (Clerk id as PK) → `documents` → `sources` → `paragraphs`; `nodes` form a self-referential tree (parent enforced in app code, not a DB FK) with `node_source_ranges` mapping each node to a `[start,end)` span of a source; `inline_annotations` and `node_annotations` carry `note` + `tags[]` (GIN-indexed). `getDocument` fans these out and `buildTree` folds them into a nested `TreeNode[]`.

**Auth pattern:** `lib/auth/current-user.ts::requireUser` resolves the Clerk user and **upserts a local `users` row on every call** (so annotations can join to a display name). Mutations then call one of two gates: `lib/auth/authorize.ts::authorize` (document-level, currently owner-only) for creates, or a `loadOwn*` author-check (e.g. `loadOwnAnnotation` in `lib/actions/annotations.ts`) for edit/delete. Enum-like columns (annotation `color`) are validated in app code, not the DB — see `assertColor`.

**Path alias:** `@/*` → repo root (configured in both `tsconfig.json` and `vitest.config.ts`).

## Conventions & gotchas

- **Green Vitest ≠ green `next build`.** The production build runs `tsc` against the `ES2017` target; Vitest/esbuild do not enforce the target. A dotAll (`/s`) regex once passed all tests and broke the deploy. Run `pnpm build` before claiming a change is deploy-safe, especially for anything using newer JS syntax/APIs.
- **Schema changes use `db:push`, not migration files** — there are no committed migrations. Pushing to a shared DB can silently drift; be deliberate about schema edits (the app is mid-roadmap around M4, where the data model expands to multi-source reads — grep for `M4`/`M5` TODOs in `lib/data/documents.ts` and `lib/auth/authorize.ts` for the seams already marked for it).
- **Tests are colocated** in `__tests__/` dirs next to the code they cover; React components use `@testing-library/react` + jsdom.
- Deploys are automatic via Vercel Git integration on push to `development` (the working branch).
