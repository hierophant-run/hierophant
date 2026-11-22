import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "@/server/db/types";

/** A real Postgres engine in memory, migrated with the same files used in production. */
export async function createTestDb() {
  const client = new PGlite();
  const pglite = drizzle(client);
  await migrate(pglite, { migrationsFolder: resolve(process.cwd(), "drizzle") });

  return {
    client,
    db: pglite as unknown as Database,
    async reset() {
      await pglite.execute(
        sql`truncate table finding_feedback, report_findings, reports, rate_limits`,
      );
    },
    /** Returns every stored row as text, to prove what is and is not persisted. */
    async dump() {
      const tables = ["reports", "report_findings", "finding_feedback", "rate_limits"];
      const rows = await Promise.all(
        tables.map((table) => client.query(`select * from ${table}`).then((r) => r.rows)),
      );
      return JSON.stringify(rows);
    },
  };
}
