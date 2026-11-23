import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe } from "vitest";
import { createDb, type Db } from "../../src/db/client";

const url = process.env.TEST_DATABASE_URL;

/** describe() that only runs when a test database is configured. */
export const describeDb = url ? describe : describe.skip;

export function useTestDb(): () => Db {
  let handle: ReturnType<typeof createDb> | undefined;
  beforeEach(async () => {
    handle ??= createDb(url!);
    await handle.db.execute(
      sql`truncate table audit_log, auth_sessions, auth_accounts, auth_verification_tokens, users, branches, dealers cascade`,
    );
  });
  afterAll(async () => {
    await handle?.pool.end();
  });
  return () => handle!.db;
}
