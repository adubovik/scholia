import { drizzle } from "drizzle-orm/neon-http";
import { neon, neonConfig } from "@neondatabase/serverless";
import * as schema from "./schema";

// Local docker e2e: route the neon-http driver at the local proxy container
// (which fronts a vanilla Postgres) instead of Neon's cloud SQL-over-HTTP
// endpoint. `host` comes from DATABASE_URL (the `neon-proxy` service).
if (process.env.SCHOLIA_LOCAL_DB === "1") {
  neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
}

// neon() only ever runs server-side here (RSC/actions/route handlers), but the
// jsdom test environment looks browser-like, triggering the driver's "SQL from
// the browser" warning. It can't legitimately fire in this app, so silence it.
neonConfig.disableWarningInBrowsers = true;

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
