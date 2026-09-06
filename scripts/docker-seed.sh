#!/bin/sh
set -e

# Additive DDL push can't do on its own. drizzle-kit stops to ask whether to truncate
# node_annotations before adding the (node_id, author_id, layer_id) unique constraint,
# and there is no TTY here to answer — so the whole push aborts and an existing volume
# never gets the layers schema. Run the surgical script first; it no-ops on a fresh
# database (nothing to alter) and on one already migrated.
echo "==> Applying additive DDL (layers)"
SCHOLIA_LOCAL_DB=1 \
DATABASE_URL="postgres://postgres:postgres@neon-proxy:5432/scholia" \
  pnpm exec tsx scripts/add-layers.ts

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
