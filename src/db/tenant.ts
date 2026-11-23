import { and, asc, eq, type SQL } from "drizzle-orm";
import { getDb, type Db } from "./client";
import { auditLog, branches, dealers, users, type BranchHours, type Role } from "./schema";

/**
 * Tenant-scoped data access (§2, §11). Every query here adds
 * `dealer_id = <dealerId>` itself, so callers can't forget it.
 *
 *   const t = forDealer(session.dealerId);
 *   await t.branches.list();
 *
 * Cross-tenant reads (operator console, login) live in ./operator.ts.
 */
export function forDealer(dealerId: string, db: Db = getDb()) {
  if (!dealerId) throw new Error("forDealer() needs a dealerId");

  const scope = <T extends { dealerId: typeof branches.dealerId | typeof users.dealerId }>(
    table: T,
    extra?: SQL,
  ) => and(eq(table.dealerId, dealerId), extra);

  return {
    dealerId,

    dealer: {
      async get() {
        const [row] = await db.select().from(dealers).where(eq(dealers.id, dealerId)).limit(1);
        return row ?? null;
      },
    },

    branches: {
      list() {
        return db.select().from(branches).where(scope(branches)).orderBy(asc(branches.createdAt));
      },
      async get(id: string) {
        const [row] = await db
          .select()
          .from(branches)
          .where(scope(branches, eq(branches.id, id)))
          .limit(1);
        return row ?? null;
      },
      async create(values: {
        name: string;
        address?: string | null;
        mapsUrl?: string | null;
        hours?: BranchHours;
      }) {
        const [row] = await db
          .insert(branches)
          .values({ ...values, dealerId })
          .returning();
        return row!;
      },
    },

    users: {
      list() {
        return db.select().from(users).where(scope(users)).orderBy(asc(users.createdAt));
      },
      async get(id: string) {
        const [row] = await db
          .select()
          .from(users)
          .where(scope(users, eq(users.id, id)))
          .limit(1);
        return row ?? null;
      },
      async create(values: {
        role: Exclude<Role, "operator">;
        email: string;
        name?: string | null;
        whatsappNumber?: string | null;
      }) {
        const [row] = await db
          .insert(users)
          .values({ ...values, email: values.email.toLowerCase(), dealerId })
          .returning();
        return row!;
      },
    },

    audit: {
      async log(actor: string, action: string, payload: Record<string, unknown> = {}) {
        await db.insert(auditLog).values({ dealerId, actor, action, payload });
      },
      list() {
        return db
          .select()
          .from(auditLog)
          .where(eq(auditLog.dealerId, dealerId))
          .orderBy(asc(auditLog.createdAt));
      },
    },
  };
}

export type TenantDb = ReturnType<typeof forDealer>;
