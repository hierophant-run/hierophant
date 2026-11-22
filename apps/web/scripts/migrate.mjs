import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const url = new URL(databaseUrl);
const enableChannelBinding = url.searchParams.get("channel_binding") === "require";
url.searchParams.delete("sslmode");
url.searchParams.delete("channel_binding");

const pool = new pg.Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: true },
  max: 1,
  connectionTimeoutMillis: 15_000,
  ...(enableChannelBinding ? { enableChannelBinding: true } : {}),
});

try {
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("Database migrations applied.");
} catch (error) {
  // Driver messages can include connection details.
  console.error("Migration failed:", error.code ?? error.name);
  process.exitCode = 1;
} finally {
  await pool.end();
}
