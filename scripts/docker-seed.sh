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
