# Scholia

A tree-structured, multi-translation close-reading and annotation web app.

## Getting Started

### Prerequisites

- Node 24
- pnpm (enabled via `corepack enable`)

### Install dependencies

```bash
pnpm install
```

### Environment variables

Create `.env.local` at the project root with the following keys (see `.env.example` for the full list):

```
DATABASE_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

### Create database tables

```bash
pnpm db:push
```

### Run the development server

```bash
pnpm dev
```

### Run tests

```bash
pnpm test
```

## Local e2e with Docker

Run the whole app locally — no Vercel, no Clerk account, no Neon cloud:

    docker compose up --build

- App: http://localhost:3000 (auth is bypassed via `SCHOLIA_AUTH=dev`; you are the fixed `Local Dev` user).
- Postgres runs in-compose; the `neon-proxy` service lets the app's `neon-http`
  driver talk to it. Schema is pushed and a Gutenberg book is seeded (imported
  through the real Import-via-URL path) with a small demo tree and comments.
- Re-running is idempotent (seed skips if the dev user already owns a document).
- The seed fetches the book over the network; if gutenberg.org is unreachable the
  `migrate-seed` step fails and the app won't start — re-run once it's reachable.
- Reset everything: `docker compose down -v` (the `-v` drops the Postgres volume).

The bypass is inert on Vercel (`isDevAuth()` requires `VERCEL` to be unset), so
production behavior is unchanged.

## Deployment

Deploys happen automatically via Vercel Git integration on push to `development`.
