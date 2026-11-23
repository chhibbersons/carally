import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Database schema. Every table that holds dealer data has `dealer_id` and an
 * index that starts with it (§2, §6). Read and write those tables through
 * `forDealer()` in ./tenant.ts, never directly.
 *
 * Later MVP steps add vehicles, kb_entries, leads, visits and followup_runs.
 */

export const planEnum = pgEnum("plan", ["starter", "growth", "pro"]);
export const roleEnum = pgEnum("user_role", ["operator", "dealer_admin", "salesperson"]);

export const PLANS = planEnum.enumValues;
export const ROLES = roleEnum.enumValues;
export const LANGUAGES = ["en", "hi", "hinglish", "mr"] as const;

export type Plan = (typeof PLANS)[number];
export type Role = (typeof ROLES)[number];
export type Language = (typeof LANGUAGES)[number];

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const dealers = pgTable("dealers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  plan: planEnum("plan").notNull().default("starter"),
  whatsappPhoneNumberId: text("whatsapp_phone_number_id"),
  wabaId: text("waba_id"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  languages: text("languages").array().$type<Language[]>().notNull().default(sql`'{en}'`),
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  /**
   * The dealer's own WhatsApp access token, encrypted with src/lib/crypto.ts.
   * When empty, sends use the platform's WA_SYSTEM_USER_TOKEN.
   */
  waAccessTokenEnc: text("wa_access_token_enc"),
  createdAt: createdAt(),
}, (t) => [
  // Incoming webhooks are routed to a dealer by this id, so it must be unique.
  unique("dealers_wa_phone_number_id_unique").on(t.whatsappPhoneNumberId),
]);

/** Opening hours per weekday, in the dealer's local time ("09:30"–"19:00"). */
export type BranchHours = Partial<
  Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", { open: string; close: string }>
>;

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    mapsUrl: text("maps_url"),
    hours: jsonb("hours").$type<BranchHours>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("branches_dealer_idx").on(t.dealerId)],
);

/**
 * Users of the dashboard. Operators have no dealer; everyone else belongs to
 * exactly one. A check constraint enforces that, so a dealer-scoped query can
 * never match an operator.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").references(() => dealers.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
    image: text("image"),
    whatsappNumber: text("whatsapp_number"),
    createdAt: createdAt(),
  },
  (t) => [
    index("users_dealer_idx").on(t.dealerId),
    check(
      "users_operator_has_no_dealer",
      sql`(${t.role} = 'operator') = (${t.dealerId} IS NULL)`,
    ),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null only for operator actions that are not about one dealer. */
    dealerId: uuid("dealer_id").references(() => dealers.id, { onDelete: "cascade" }),
    /** The acting user's id, or "system". */
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_dealer_created_idx").on(t.dealerId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// WhatsApp: contacts (buyers), one conversation per contact, and messages.
// ---------------------------------------------------------------------------

export const messageDirectionEnum = pgEnum("message_direction", ["in", "out"]);
export const messageSenderEnum = pgEnum("message_sender", ["buyer", "ai", "staff", "system"]);
export const messageStatusEnum = pgEnum("message_status", ["sent", "delivered", "read", "failed"]);
export const costCategoryEnum = pgEnum("cost_category", ["service", "utility", "marketing"]);

export type MessageDirection = (typeof messageDirectionEnum.enumValues)[number];
export type MessageSender = (typeof messageSenderEnum.enumValues)[number];
export type MessageStatus = (typeof messageStatusEnum.enumValues)[number];
export type CostCategory = (typeof costCategoryEnum.enumValues)[number];

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    phoneE164: text("phone_e164").notNull(),
    name: text("name"),
    languagePref: text("language_pref").$type<Language>(),
    optedOut: boolean("opted_out").notNull().default(false),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    /** Time of the buyer's latest message. Drives the 24-hour window (src/whatsapp/window.ts). */
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique("contacts_dealer_phone_unique").on(t.dealerId, t.phoneE164)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    aiPaused: boolean("ai_paused").notNull().default(false),
    pausedBy: uuid("paused_by").references(() => users.id, { onDelete: "set null" }),
    pausedUntil: timestamp("paused_until", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique("conversations_dealer_contact_unique").on(t.dealerId, t.contactId)],
);

/** Media we received (Meta media id) or sent (public URL). */
export type MessageMedia = {
  id?: string;
  url?: string;
  mimeType?: string;
  caption?: string;
  filename?: string;
};

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    sender: messageSenderEnum("sender").notNull(),
    /** WhatsApp message type: text, image, video, template, button, … */
    type: text("type").notNull(),
    body: text("body"),
    media: jsonb("media").$type<MessageMedia>(),
    /** Meta's message id ("wamid…"). Unique per dealer, which dedupes repeated webhooks. */
    waMessageId: text("wa_message_id"),
    templateName: text("template_name"),
    /** Delivery status of outbound messages; null for inbound. */
    status: messageStatusEnum("status"),
    /** Meta's error code and title when a send failed. */
    error: text("error"),
    /** Set on outbound messages, for the per-dealer cost report. */
    costCategory: costCategoryEnum("cost_category"),
    createdAt: createdAt(),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
  },
  (t) => [
    unique("messages_dealer_wa_message_id_unique").on(t.dealerId, t.waMessageId),
    index("messages_dealer_conversation_created_idx").on(t.dealerId, t.conversationId, t.createdAt),
    index("messages_dealer_created_idx").on(t.dealerId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Auth.js tables (shape required by @auth/drizzle-adapter). These hold login
// state only, not dealer data.
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  "auth_accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable(
  "auth_sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

export const verificationTokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export type Dealer = typeof dealers.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type User = typeof users.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
