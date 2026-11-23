import { Client } from "pg";
import { runMigrations } from "../../src/db/migrate";

/**
 * When TEST_DATABASE_URL is set, wipe that database and apply migrations once
 * before the run. Without it, database tests are skipped.
 * Never point this at a real database: it drops the public schema.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error("TEST_DATABASE_URL must point at a database whose name contains 'test'");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await client.end();
  await runMigrations(url);
}
