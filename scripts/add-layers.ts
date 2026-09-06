/**
 * One-off additive migration: the `layers` table + `node_annotations.layer_id`.
 *
 *   pnpm exec tsx scripts/add-layers.ts
 *
 * Surgical DDL over the neon-http driver (NOT drizzle-kit push, which wants to
 * truncate node_source_ranges — the documented drift hazard). Everything is
 * IF NOT EXISTS / additive, so it is safe and idempotent on the shared DB.
 *
 * The one destructive-looking step is swapping the node_annotations unique
 * constraint from (node_id, author_id) to (node_id, author_id, layer_id) NULLS NOT
 * DISTINCT. That is strictly weaker on existing rows — every current row has
 * layer_id NULL, and NULLS NOT DISTINCT keeps them colliding exactly as before — so
 * no data can violate the new constraint.
 */
import { config } from "dotenv";
import { neon, neonConfig, type NeonQueryFunction } from "@neondatabase/serverless";

config({ path: ".env.local" });

// Same switch as lib/db.ts: point the neon-http driver at the local proxy container
// when running inside docker compose, instead of Neon's cloud endpoint.
if (process.env.SCHOLIA_LOCAL_DB === "1") {
  neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
}

const state = (sql: NeonQueryFunction<false, false>) => sql`
  SELECT
    (SELECT count(*) FROM information_schema.tables  WHERE table_name = 'layers')                            AS layers_table,
    (SELECT count(*) FROM information_schema.columns WHERE table_name = 'node_annotations'
                                                       AND column_name = 'layer_id')                        AS layer_id_col,
    (SELECT count(*) FROM pg_constraint WHERE conname = 'node_annotations_node_author_layer')                AS new_unique`;

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  // A brand-new database has no node_annotations to alter — drizzle-kit push creates
  // the whole schema (layers included) from scratch there. Bail out quietly so this
  // can run *before* push in the docker seed, where an existing volume is the case
  // push can't handle on its own (the truncate prompt needs a TTY).
  const [{ ready }] = await sql`SELECT to_regclass('public.node_annotations') IS NOT NULL AS ready`;
  if (!ready) {
    console.log("no node_annotations table yet — fresh database, nothing to migrate.");
    return;
  }
  console.log("before:", (await state(sql))[0]);

  await sql`
    CREATE TABLE IF NOT EXISTS layers (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      name         text NOT NULL,
      color        text NOT NULL,
      position     integer NOT NULL,
      created_at   timestamp NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS layers_document_pos ON layers (document_id, position)`;
  await sql`
    ALTER TABLE node_annotations
      ADD COLUMN IF NOT EXISTS layer_id uuid REFERENCES layers(id) ON DELETE CASCADE`;
  await sql`ALTER TABLE node_annotations DROP CONSTRAINT IF EXISTS node_annotations_node_author`;
  // ADD CONSTRAINT has no IF NOT EXISTS — guard it so a re-run is a no-op.
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'node_annotations_node_author_layer') THEN
        ALTER TABLE node_annotations
          ADD CONSTRAINT node_annotations_node_author_layer
          UNIQUE NULLS NOT DISTINCT (node_id, author_id, layer_id);
      END IF;
    END $$`;

  const after = (await state(sql))[0];
  console.log("after: ", after);
  const ok = Number(after.layers_table) === 1 && Number(after.layer_id_col) === 1 && Number(after.new_unique) === 1;
  console.log(ok ? "✅ layers schema in place" : "❌ migration incomplete");
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
