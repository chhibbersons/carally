import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { createDb } from "./client";
import { pathToFileURL } from "node:url";

/** Applies pending migrations from src/db/migrations. */
export async function runMigrations(url: string) {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "src/db/migrations") });
  } finally {
    await pool.end();
  }
}

// Run only when called as a script. pathToFileURL handles Windows paths (C:\...).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log("Migrations applied"))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
