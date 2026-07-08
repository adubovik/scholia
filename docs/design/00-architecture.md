# Architecture & Tech Stack

Status: **Design** · Date: 2026-07-08

Implementation-side companion to the product spec in [`../`](../00-product-spec.md).
This file records *how* we build the approved product on a free hosting tier.

## Constraints that drove the stack

- **Free-tier hosting** (Vercel Hobby + free Marketplace DB). No always-on server.
- **Personal-first, async collaboration** — no realtime infra needed in V1.
- **Immutable Source** → annotations are integer offsets, so **no heavyweight
  rich-text editor** is required. We render plain paragraphs and split them into
  `<span>`s at annotation boundaries.
- **Austere, monochrome UI** → minimal dependencies, custom CSS tokens over a
  thin Tailwind base; icons are Unicode/outline SVG, no component-library chrome.

## Stack (locked)

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | **Next.js (App Router, TypeScript)** | First-class on Vercel Hobby; RSC for fast reads, Server Actions for mutations. |
| Hosting | **Vercel Hobby (free)** | Zero-config deploys, preview URLs, Fluid Compute functions. |
| Database | **Neon Postgres** (Vercel Marketplace, free tier) | Relational fits the document/node/annotation/thread graph; serverless; **branching** gives disposable test DBs. |
| Data layer | **Drizzle ORM** | Light, TS-native, serverless-friendly, SQL-first migrations. |
| Auth | **Clerk** (Vercel Marketplace, free MAU tier) | Google OAuth + email magic link with minimal code; hosted, restyleable UI. Identity lives in Clerk; its `userId` is the FK we store. |
| Styling | **Tailwind CSS** + custom design tokens | Utility base, but the austere palette/typography live in CSS variables (see [02](02-frontend-and-permissions.md)). |
| Command palette | **cmdk** | Tiny, unstyled, keyboard-first — matches the terminal aesthetic. |
| Unit/integration tests | **Vitest** | Fast, TS-native; runs DB tests against a Neon test branch. |
| E2E tests | **Playwright** | Exercises selection→annotation, tree collapse, parallel view across desktop/mobile viewports. |

## System shape

```
Browser (RSC-rendered reading surface, client islands for
         selection popover / command palette / tree editing)
   │  Server Actions (mutations)  ·  Route Handlers (URL import fetch)
   ▼
Next.js on Vercel (Fluid Compute functions)
   │  Drizzle
   ▼
Neon Postgres  ── Clerk (identity, verified via middleware + webhook-synced users table)
```

- **Reads** (rendering a document + its annotations) are React Server Components
  hitting Neon directly — fast, cacheable, no client data-fetching library.
- **Mutations** (create annotation, add node, post comment, clone) are **Server
  Actions** with permission checks (see [02](02-frontend-and-permissions.md)).
- **URL import** is a **Route Handler** (server-side fetch + HTML→paragraph
  cleanup) so we avoid browser CORS and keep parsing on the server.
- **Auth** is enforced in `middleware.ts` (Clerk). A lightweight `users` row is
  upserted from Clerk (webhook + on-demand) so comments/annotations can join to a
  local author record with a display name.

## Rendering annotations (the core algorithm)

Because a Source is immutable, each inline annotation is
`{sourceId, startOffset, endOffset, color}`. To render a paragraph:

1. Collect all inline annotations overlapping the paragraph's `[charStart,
   charEnd)`.
2. Compute **boundary points** (all starts/ends within the paragraph), producing
   ordered sub-segments.
3. Emit one `<span>` per segment; a segment covered by N annotations gets N
   stacked highlighter underlines (CSS `box-shadow`/`border-bottom` layering) and
   carries the annotation ids for click handling.
4. Clicking a segment opens the collapsed note(s) inline beneath the line.

This keeps overlaps correct without mutating text and without an editor.

## Environments & config

- Secrets via **Vercel env vars** (Neon `DATABASE_URL`, Clerk keys) — never
  committed. `.env.local` for local dev, pulled with `vercel env pull`.
- Marketplace integrations (Neon, Clerk) provisioned during Milestone 0; they
  auto-inject their env vars into the Vercel project.

## What we deliberately do NOT add in V1

- No realtime/websockets/CRDT (async only).
- No rich-text editor library.
- No Redis/queue/blob storage (nothing needs them yet).
- No design-system component library (austere custom UI).
