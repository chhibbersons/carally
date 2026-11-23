import { eq } from "drizzle-orm";
import { createDb, type Db } from "./client";
import { createDealer, findUserByEmail } from "./operator";
import { dealers, users, type BranchHours } from "./schema";
import { pathToFileURL } from "node:url";

/**
 * Seeds the operator account and the "Demo Motors, Andheri" dealer.
 * Safe to run more than once. Stock and FAQ entries arrive with MVP step 3/4.
 *
 *   SEED_OPERATOR_EMAIL=you@example.com pnpm db:seed
 */

const DEMO_HOURS: BranchHours = {
  mon: { open: "10:00", close: "20:00" },
  tue: { open: "10:00", close: "20:00" },
  wed: { open: "10:00", close: "20:00" },
  thu: { open: "10:00", close: "20:00" },
  fri: { open: "10:00", close: "20:00" },
  sat: { open: "10:00", close: "20:00" },
  sun: { open: "11:00", close: "18:00" },
};

export async function seed(db: Db, operatorEmail: string) {
  const operator =
    (await findUserByEmail(operatorEmail, db)) ??
    (
      await db
        .insert(users)
        .values({ role: "operator", email: operatorEmail.toLowerCase(), name: "Operator" })
        .returning()
    )[0]!;

  const [existingDemo] = await db
    .select({ id: dealers.id })
    .from(dealers)
    .where(eq(dealers.name, "Demo Motors"))
    .limit(1);

  if (!existingDemo) {
    await createDealer(
      {
        name: "Demo Motors",
        city: "Mumbai",
        plan: "growth",
        languages: ["en", "hi", "hinglish", "mr"],
        branch: {
          name: "Andheri",
          address: "Link Road, Andheri West, Mumbai 400053",
          mapsUrl: null,
          hours: DEMO_HOURS,
        },
        admin: { name: "Demo Admin", email: "admin@demomotors.example" },
      },
      operator.id,
      db,
    );
  }

  return { operatorEmail: operator.email };
}

// Run only when called as a script. pathToFileURL handles Windows paths (C:\...).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const operatorEmail = process.env.SEED_OPERATOR_EMAIL ?? "operator@dealerreply.example";
  const { db, pool } = createDb(url);
  seed(db, operatorEmail)
    .then((r) => {
      console.log(`Seeded. Operator login: ${r.operatorEmail}`);
      console.log("Demo dealer admin login: admin@demomotors.example");
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
