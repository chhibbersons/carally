import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb, type Db } from "./client";
import {
  auditLog,
  branches,
  contacts,
  conversations,
  dealers,
  messages,
  users,
  type BranchHours,
  type CostCategory,
  type MessageMedia,
  type MessageSender,
  type MessageStatus,
  type Role,
} from "./schema";

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

  const scope = <T extends { dealerId: AnyPgColumn }>(
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
      /** Saves the WhatsApp connection. Pass accessTokenEnc only to change the token. */
      async updateWhatsApp(values: {
        whatsappPhoneNumberId: string | null;
        wabaId: string | null;
        waAccessTokenEnc?: string | null;
      }) {
        const [row] = await db.update(dealers).set(values).where(eq(dealers.id, dealerId)).returning();
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

    contacts: {
      async get(id: string) {
        const [row] = await db
          .select()
          .from(contacts)
          .where(scope(contacts, eq(contacts.id, id)))
          .limit(1);
        return row ?? null;
      },
      async findByPhone(phoneE164: string) {
        const [row] = await db
          .select()
          .from(contacts)
          .where(scope(contacts, eq(contacts.phoneE164, phoneE164)))
          .limit(1);
        return row ?? null;
      },
      /** Returns the contact for this number, creating it if needed. */
      async ensure(phoneE164: string, name?: string | null) {
        const [row] = await db
          .insert(contacts)
          .values({ dealerId, phoneE164, name: name ?? null })
          .onConflictDoUpdate({
            target: [contacts.dealerId, contacts.phoneE164],
            set: { name: sql`coalesce(${contacts.name}, excluded.name)` },
          })
          .returning();
        return row!;
      },
      /**
       * Records a buyer's message: creates the contact if new, and moves
       * last_inbound_at forward only (webhooks can arrive out of order).
       */
      async recordInbound(phoneE164: string, at: Date, name?: string | null) {
        const [row] = await db
          .insert(contacts)
          .values({ dealerId, phoneE164, name: name ?? null, lastInboundAt: at })
          .onConflictDoUpdate({
            target: [contacts.dealerId, contacts.phoneE164],
            set: {
              name: sql`coalesce(${contacts.name}, excluded.name)`,
              lastInboundAt: sql`greatest(${contacts.lastInboundAt}, excluded.last_inbound_at)`,
            },
          })
          .returning();
        return row!;
      },
      /** Marks the contact opted out. Returns true only if they weren't already. */
      async optOut(id: string, at: Date = new Date()) {
        const rows = await db
          .update(contacts)
          .set({ optedOut: true, optedOutAt: at })
          .where(scope(contacts, and(eq(contacts.id, id), eq(contacts.optedOut, false))))
          .returning({ id: contacts.id });
        return rows.length > 0;
      },
      /** Clears an opt-out. Returns true only if they were opted out. */
      async optIn(id: string) {
        const rows = await db
          .update(contacts)
          .set({ optedOut: false, optedOutAt: null })
          .where(scope(contacts, and(eq(contacts.id, id), eq(contacts.optedOut, true))))
          .returning({ id: contacts.id });
        return rows.length > 0;
      },
    },

    conversations: {
      /** The contact's conversation, created on first use. */
      async forContact(contactId: string) {
        await db
          .insert(conversations)
          .values({ dealerId, contactId })
          .onConflictDoNothing({ target: [conversations.dealerId, conversations.contactId] });
        const [row] = await db
          .select()
          .from(conversations)
          .where(scope(conversations, eq(conversations.contactId, contactId)))
          .limit(1);
        return row!;
      },
    },

    messages: {
      /**
       * Stores a buyer's message. Returns null when this wa_message_id is
       * already stored, so a repeated webhook does nothing.
       */
      async insertInbound(values: {
        conversationId: string;
        waMessageId: string;
        type: string;
        body: string | null;
        media: MessageMedia | null;
        createdAt: Date;
      }) {
        const [row] = await db
          .insert(messages)
          .values({ ...values, dealerId, direction: "in", sender: "buyer" })
          .onConflictDoNothing({ target: [messages.dealerId, messages.waMessageId] })
          .returning();
        return row ?? null;
      },
      async insertOutbound(values: {
        conversationId: string;
        sender: Exclude<MessageSender, "buyer">;
        type: string;
        body: string | null;
        media?: MessageMedia | null;
        waMessageId: string | null;
        templateName?: string | null;
        status: MessageStatus;
        error?: string | null;
        costCategory: CostCategory;
      }) {
        const [row] = await db
          .insert(messages)
          .values({ ...values, dealerId, direction: "out", statusUpdatedAt: new Date() })
          .returning();
        return row!;
      },
      /**
       * Applies a delivery status from Meta. Status only moves forward
       * (sent → delivered → read; failed wins), because webhooks can arrive
       * out of order. Returns true if the message was updated.
       */
      async applyStatus(waMessageId: string, status: MessageStatus, at: Date, error: string | null) {
        const rank = (col: SQL | AnyPgColumn) =>
          sql`case ${col} when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else 0 end`;
        const rows = await db
          .update(messages)
          .set({ status, statusUpdatedAt: at, ...(error ? { error } : {}) })
          .where(
            scope(
              messages,
              and(
                eq(messages.waMessageId, waMessageId),
                eq(messages.direction, "out"),
                sql`${rank(messages.status)} < ${rank(sql`${status}::message_status`)}`,
              ),
            ),
          )
          .returning({ id: messages.id });
        return rows.length > 0;
      },
      /** Latest messages across all conversations, with the contact's phone. */
      recent(limit = 20) {
        return db
          .select({ message: messages, phoneE164: contacts.phoneE164, optedOut: contacts.optedOut })
          .from(messages)
          .innerJoin(conversations, eq(conversations.id, messages.conversationId))
          .innerJoin(contacts, eq(contacts.id, conversations.contactId))
          .where(scope(messages))
          .orderBy(desc(messages.createdAt))
          .limit(limit);
      },
      listForConversation(conversationId: string) {
        return db
          .select()
          .from(messages)
          .where(scope(messages, eq(messages.conversationId, conversationId)))
          .orderBy(asc(messages.createdAt));
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
