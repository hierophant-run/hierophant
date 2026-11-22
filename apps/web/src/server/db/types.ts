import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/** Any Drizzle Postgres database, so tests can run the real queries on an in-memory Postgres. */
export type Database = PgDatabase<PgQueryResultHKT>;
