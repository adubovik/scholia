/**
 * One-off additive migration: add the nullable `nodes.alias` column.
 *
 *   pnpm exec tsx scripts/add-nodes-alias.ts
 *
 * Surgical DDL over the neon-http driver (NOT drizzle-kit push, which wants to
 * truncate node_source_ranges — the documented drift hazard). Additive + nullable
 * + IF NOT EXISTS, so it is safe and idempotent on the shared DB.
 */
import { config } from "dotenv";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

config({ path: ".env.local" });

// neon(url) resolves to the concrete NeonQueryFunction<false, false>; typing the
// param as the widened ReturnType<typeof neon> (<boolean, boolean>) makes the call
// unassignable and loses the row type (.map/.some). Use the concrete instance type.
const listCols = (sql: NeonQueryFunction<false, false>) => sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'nodes' AND column_name IN ('label', 'alias', 'title')
  ORDER BY column_name`;

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  console.log("before:", (await listCols(sql)).map((c) => c.column_name));
  await sql`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS alias text`;
  const after = await listCols(sql);
  console.log("after: ", after.map((c) => c.column_name));
  console.log(after.some((c) => c.column_name === "alias") ? "✅ alias present" : "❌ alias missing");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
