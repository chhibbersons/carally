import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, type Db } from "./client";
import { forDealer } from "./tenant";
import {
  auditLog,
  dealers,
  users,
  type BranchHours,
  type Language,
  type Plan,
} from "./schema";

/**
 * Cross-tenant data access. Only call these from code that has already checked
 * the caller is an operator (see requireOperator() in src/auth/guards.ts), or
 * from the login flow. Everything dealer-specific belongs in forDealer().
 */

/** All dealers with branch and user counts, newest first. */
export function listDealers(db: Db = getDb()) {
  return db
    .select({
      id: dealers.id,
      name: dealers.name,
      city: dealers.city,
      plan: dealers.plan,
      aiEnabled: dealers.aiEnabled,
      createdAt: dealers.createdAt,
      // Table-qualified on purpose: inside a subquery, a bare "id" would bind
      // to the inner table and every count would be 0.
      branchCount: sql<number>`(select count(*)::int from "branches" where "branches"."dealer_id" = "dealers"."id")`,
      userCount: sql<number>`(select count(*)::int from "users" where "users"."dealer_id" = "dealers"."id")`,
    })
    .from(dealers)
    .orderBy(desc(dealers.createdAt));
}

export type NewDealerInput = {
  name: string;
  city: string;
  plan: Plan;
  languages: Language[];
  branch: { name: string; address?: string | null; mapsUrl?: string | null; hours?: BranchHours };
  admin: { name: string; email: string };
};

export class EmailTakenError extends Error {
  constructor() {
    super("A user with this email already exists");
  }
}

/**
 * Creates a dealer, its first branch and its dealer_admin in one transaction,
 * and records it in the audit log.
 */
export async function createDealer(input: NewDealerInput, actorId: string, db: Db = getDb()) {
  const email = input.admin.email.toLowerCase();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) throw new EmailTakenError();

    const [dealer] = await tx
      .insert(dealers)
      .values({ name: input.name, city: input.city, plan: input.plan, languages: input.languages })
      .returning();

    const t = forDealer(dealer!.id, tx as unknown as Db);
    const branch = await t.branches.create(input.branch);
    const admin = await t.users.create({ role: "dealer_admin", email, name: input.admin.name });
    await t.audit.log(actorId, "dealer.created", {
      dealerId: dealer!.id,
      branchId: branch.id,
      adminUserId: admin.id,
      plan: input.plan,
    });

    return { dealer: dealer!, branch, admin };
  });
}

/** Looks a user up by email for login. Returns null if there is no such user. */
export async function findUserByEmail(email: string, db: Db = getDb()) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return row ?? null;
}

/** Operators only (dealer_id is null). */
export function listOperators(db: Db = getDb()) {
  return db
    .select()
    .from(users)
    .where(and(eq(users.role, "operator"), isNull(users.dealerId)));
}

/** Records an operator action that isn't about a single dealer. */
export async function logOperatorAction(
  actor: string,
  action: string,
  payload: Record<string, unknown> = {},
  db: Db = getDb(),
) {
  await db.insert(auditLog).values({ dealerId: null, actor, action, payload });
}
