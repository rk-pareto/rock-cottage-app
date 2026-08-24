import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { normalizeConnectionString, sslOptionFor } from "./connection";

const rawConnectionString = process.env.DATABASE_URL;
if (!rawConnectionString) {
  throw new Error("DATABASE_URL is not set");
}
const connectionString = normalizeConnectionString(rawConnectionString);

// Railway runs one long-lived Node process, so a small pooled client is the
// right shape here. Neon terminates idle connections, hence the low max.
const globalForDb = globalThis as unknown as { __cottagePool?: Pool };

const pool =
  globalForDb.__cottagePool ??
  new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    // Neon presents a publicly trusted certificate — verify it.
    ssl: sslOptionFor(connectionString),
  });

if (process.env.NODE_ENV !== "production") globalForDb.__cottagePool = pool;

export const db = drizzle(pool, { schema });
export { schema };
