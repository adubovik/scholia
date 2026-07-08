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

## Deployment

Deploys happen automatically via Vercel Git integration on push to `development`.
