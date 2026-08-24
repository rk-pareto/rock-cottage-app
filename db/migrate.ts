import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { normalizeConnectionString, sslOptionFor } from "./connection";

async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const connectionString = normalizeConnectionString(raw);

  const pool = new Pool({
    connectionString,
    ssl: sslOptionFor(connectionString),
  });
  console.log("Running migrations…");
  await migrate(drizzle(pool), { migrationsFolder: "./db/migrations" });
  console.log("Migrations complete.");
  await pool.end();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
