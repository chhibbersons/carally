import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

/** Opens a connection pool. Tests and scripts use this with their own URL. */
export function createDb(url: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString: url, max: 10 });
  return { db: drizzle(pool, { schema }), pool };
}

const globalForDb = globalThis as unknown as { __dealerreplyDb?: Db };

/** The app's shared database handle (one pool per process, kept across hot reloads). */
export function getDb(): Db {
  globalForDb.__dealerreplyDb ??= createDb(env().DATABASE_URL).db;
  return globalForDb.__dealerreplyDb;
}
