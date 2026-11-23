import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { MessageMedia, MessageStatus } from "@/db/schema";
import { toE164 } from "@/lib/phone";

/**
 * Meta webhook: verification and parsing (§8). No database access here;
 * src/whatsapp/inbound.ts does the work.
 */

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Checks X-Hub-Signature-256 ("sha256=<hex HMAC of the raw body>"). The HMAC
 * must be computed over the exact bytes Meta sent, before any JSON parsing.
 */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(header.slice("sha256=".length).toLowerCase(), expected);
}

/** Meta's GET handshake. Returns the challenge to echo back, or null to refuse. */
export function verifySubscription(params: URLSearchParams, verifyToken: string): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || !token || challenge === null) return null;
  return safeEqual(token, verifyToken) ? challenge : null;
}

// ---------------------------------------------------------------------------
// Payload shape (only the parts we use; everything else is ignored)
// ---------------------------------------------------------------------------

const mediaSchema = z.object({
  id: z.string().optional(),
  mime_type: z.string().optional(),
  caption: z.string().optional(),
  filename: z.string().optional(),
});

const inboundMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: mediaSchema.optional(),
  video: mediaSchema.optional(),
  audio: mediaSchema.optional(),
  document: mediaSchema.optional(),
  sticker: mediaSchema.optional(),
  button: z.object({ text: z.string().optional(), payload: z.string().optional() }).optional(),
  interactive: z
    .object({
      type: z.string().optional(),
      button_reply: z.object({ id: z.string().optional(), title: z.string().optional() }).optional(),
      list_reply: z.object({ id: z.string().optional(), title: z.string().optional() }).optional(),
    })
    .optional(),
  location: z
    .object({
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      name: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
  reaction: z.object({ emoji: z.string().optional() }).optional(),
});

const statusSchema = z.object({
  id: z.string(),
  status: z.string(),
  timestamp: z.string(),
  recipient_id: z.string().optional(),
  errors: z
    .array(z.object({ code: z.number().optional(), title: z.string().optional(), message: z.string().optional() }))
    .optional(),
});

const valueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string() }),
  contacts: z
    .array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() }))
    .optional(),
  messages: z.array(inboundMessageSchema).optional(),
  statuses: z.array(statusSchema).optional(),
});

export const webhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string().optional(),
      changes: z.array(z.object({ field: z.string(), value: z.unknown() })),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Normalised events
// ---------------------------------------------------------------------------

export type InboundMessage = {
  phoneNumberId: string;
  waMessageId: string;
  fromE164: string;
  profileName: string | null;
  sentAt: Date;
  type: string;
  body: string | null;
  media: MessageMedia | null;
};

export type StatusUpdate = {
  phoneNumberId: string;
  waMessageId: string;
  status: MessageStatus;
  at: Date;
  error: string | null;
};

export type ParsedWebhook = { inbound: InboundMessage[]; statuses: StatusUpdate[]; skipped: number };

const KNOWN_STATUSES: readonly MessageStatus[] = ["sent", "delivered", "read", "failed"];

function fromUnixSeconds(ts: string): Date {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
}

function bodyAndMedia(m: z.infer<typeof inboundMessageSchema>): { body: string | null; media: MessageMedia | null } {
  if (m.text) return { body: m.text.body, media: null };
  const media = m.image ?? m.video ?? m.audio ?? m.document ?? m.sticker;
  if (media) {
    const out: MessageMedia = {};
    if (media.id) out.id = media.id;
    if (media.mime_type) out.mimeType = media.mime_type;
    if (media.caption) out.caption = media.caption;
    if (media.filename) out.filename = media.filename;
    return { body: media.caption ?? null, media: out };
  }
  if (m.button) return { body: m.button.text ?? m.button.payload ?? null, media: null };
  if (m.interactive) {
    const reply = m.interactive.button_reply ?? m.interactive.list_reply;
    return { body: reply?.title ?? null, media: null };
  }
  if (m.location) {
    const parts = [m.location.name, m.location.address].filter(Boolean);
    const coords =
      m.location.latitude !== undefined && m.location.longitude !== undefined
        ? `${m.location.latitude},${m.location.longitude}`
        : null;
    return { body: [...parts, coords].filter(Boolean).join(" · ") || null, media: null };
  }
  if (m.reaction) return { body: m.reaction.emoji ?? null, media: null };
  return { body: null, media: null };
}

/**
 * Turns a raw webhook body into inbound messages and status updates. Parts we
 * can't read are counted in `skipped` instead of failing the whole payload.
 */
export function parseWebhook(payload: unknown): ParsedWebhook {
  const result: ParsedWebhook = { inbound: [], statuses: [], skipped: 0 };
  const top = webhookPayloadSchema.safeParse(payload);
  if (!top.success || top.data.object !== "whatsapp_business_account") {
    result.skipped++;
    return result;
  }

  for (const entry of top.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const value = valueSchema.safeParse(change.value);
      if (!value.success) {
        result.skipped++;
        continue;
      }
      const { phone_number_id: phoneNumberId } = value.data.metadata;
      const names = new Map(
        (value.data.contacts ?? []).map((c) => [c.wa_id ?? "", c.profile?.name ?? null] as const),
      );

      for (const m of value.data.messages ?? []) {
        const fromE164 = toE164(`+${m.from.replace(/^\+/, "")}`);
        if (!fromE164) {
          result.skipped++;
          continue;
        }
        result.inbound.push({
          phoneNumberId,
          waMessageId: m.id,
          fromE164,
          profileName: names.get(m.from) ?? null,
          sentAt: fromUnixSeconds(m.timestamp),
          type: m.type,
          ...bodyAndMedia(m),
        });
      }

      for (const s of value.data.statuses ?? []) {
        const status = KNOWN_STATUSES.find((k) => k === s.status);
        if (!status) {
          result.skipped++;
          continue;
        }
        const err = s.errors?.[0];
        result.statuses.push({
          phoneNumberId,
          waMessageId: s.id,
          status,
          at: fromUnixSeconds(s.timestamp),
          error: err ? `${err.code ?? "?"}: ${err.title ?? err.message ?? "error"}` : null,
        });
      }
    }
  }
  return result;
}
