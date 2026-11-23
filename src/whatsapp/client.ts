import { z } from "zod";
import { getDb, type Db } from "@/db/client";
import type { Dealer, MessageMedia, MessageSender } from "@/db/schema";
import { forDealer } from "@/db/tenant";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { TEMPLATES, templateLanguageCode, type TemplateKey } from "./templates";
import { decideSend, describeBlock, type BlockReason, type SendKind } from "./window";

/**
 * Sends WhatsApp messages through Meta's Cloud API (§8). Every send:
 *  1. asks window.ts whether it is allowed (opt-out, 24-hour window, quiet hours),
 *  2. calls the Graph API with the dealer's number and token,
 *  3. stores the message with its cost category, including failed sends.
 */

export type OutboundMessage =
  | { kind: "text"; body: string }
  | { kind: "image" | "video"; url: string; caption?: string }
  | { kind: "template"; template: TemplateKey; params?: string[] };

export type SendFailure =
  | BlockReason
  | "not_connected"
  | "contact_not_found"
  | "bad_input"
  | "api_error";

export type SendResult =
  | { ok: true; messageId: string; waMessageId: string }
  | { ok: false; reason: SendFailure; detail: string; messageId?: string };

export type SendDeps = { db?: Db; fetch?: typeof fetch; now?: Date };

// ---------------------------------------------------------------------------
// Graph API call
// ---------------------------------------------------------------------------

const graphSuccessSchema = z.object({ messages: z.array(z.object({ id: z.string() })).min(1) });
const graphErrorSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    code: z.number().optional(),
    error_data: z.object({ details: z.string().optional() }).optional(),
  }),
});

type GraphResult = { ok: true; waMessageId: string } | { ok: false; error: string };

export async function callGraph(opts: {
  phoneNumberId: string;
  token: string;
  payload: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}): Promise<GraphResult> {
  const url = `https://graph.facebook.com/${env().WA_GRAPH_API_VERSION}/${encodeURIComponent(opts.phoneNumberId)}/messages`;
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(opts.payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return { ok: false, error: `network: ${err instanceof Error ? err.message : String(err)}` };
  }

  const json: unknown = await res.json().catch(() => null);
  if (res.ok) {
    const parsed = graphSuccessSchema.safeParse(json);
    if (parsed.success) return { ok: true, waMessageId: parsed.data.messages[0]!.id };
    return { ok: false, error: `unexpected response (HTTP ${res.status})` };
  }
  const parsed = graphErrorSchema.safeParse(json);
  if (parsed.success) {
    const e = parsed.data.error;
    const detail = e.error_data?.details ?? e.message ?? "error";
    return { ok: false, error: `${e.code ?? res.status}: ${detail}` };
  }
  return { ok: false, error: `HTTP ${res.status}` };
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

/** Meta wants the number without the leading "+". */
function toWaId(phoneE164: string): string {
  return phoneE164.replace(/^\+/, "");
}

export function buildPayload(
  to: string,
  message: OutboundMessage,
  language: Parameters<typeof templateLanguageCode>[1],
): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: toWaId(to) };
  switch (message.kind) {
    case "text":
      return { ...base, type: "text", text: { body: message.body, preview_url: false } };
    case "image":
    case "video":
      return {
        ...base,
        type: message.kind,
        [message.kind]: { link: message.url, ...(message.caption ? { caption: message.caption } : {}) },
      };
    case "template": {
      const def = TEMPLATES[message.template];
      const params = message.params ?? [];
      return {
        ...base,
        type: "template",
        template: {
          name: def.name,
          language: { code: templateLanguageCode(def, language) },
          ...(params.length
            ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] }
            : {}),
        },
      };
    }
  }
}

function sendKindFor(message: OutboundMessage, isOptOutConfirmation: boolean): SendKind {
  if (isOptOutConfirmation) return { kind: "opt_out_confirmation" };
  if (message.kind === "template") return { kind: "template", category: TEMPLATES[message.template].category };
  return { kind: "freeform" };
}

function validate(message: OutboundMessage): string | null {
  switch (message.kind) {
    case "text":
      if (!message.body.trim()) return "Message is empty.";
      if (message.body.length > 4096) return "Message is longer than WhatsApp's 4,096 characters.";
      return null;
    case "image":
    case "video":
      return /^https:\/\//.test(message.url) ? null : "Media must be a public https:// link.";
    case "template": {
      const want = TEMPLATES[message.template].bodyParams;
      const got = message.params?.length ?? 0;
      return want === got ? null : `Template needs ${want} values, got ${got}.`;
    }
  }
}

/** The dealer's phone number id and access token, or null if WhatsApp isn't set up. */
export function dealerCredentials(dealer: Dealer): { phoneNumberId: string; token: string } | null {
  if (!dealer.whatsappPhoneNumberId) return null;
  const token = dealer.waAccessTokenEnc
    ? decryptSecret(dealer.waAccessTokenEnc)
    : env().WA_SYSTEM_USER_TOKEN;
  return token ? { phoneNumberId: dealer.whatsappPhoneNumberId, token } : null;
}

function storedBody(message: OutboundMessage): { type: string; body: string | null; media: MessageMedia | null } {
  switch (message.kind) {
    case "text":
      return { type: "text", body: message.body, media: null };
    case "image":
    case "video":
      return { type: message.kind, body: message.caption ?? null, media: { url: message.url, caption: message.caption } };
    case "template":
      return { type: "template", body: message.params?.join(" | ") || null, media: null };
  }
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

/**
 * Sends one message to a contact of this dealer. Never throws for expected
 * problems (blocked, not connected, Meta error); check `ok` instead.
 */
export async function sendMessage(
  input: {
    dealerId: string;
    contactId: string;
    message: OutboundMessage;
    sender: Exclude<MessageSender, "buyer">;
    /** Only for the one confirmation after a buyer sends STOP. */
    isOptOutConfirmation?: boolean;
  },
  deps: SendDeps = {},
): Promise<SendResult> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const t = forDealer(input.dealerId, db);
  const log = logger.child({ dealerId: input.dealerId, contactId: input.contactId, kind: input.message.kind });

  const invalid = validate(input.message);
  if (invalid) return { ok: false, reason: "bad_input", detail: invalid };

  const [dealer, contact] = await Promise.all([t.dealer.get(), t.contacts.get(input.contactId)]);
  if (!dealer) return { ok: false, reason: "not_connected", detail: "Dealer not found." };
  if (!contact) return { ok: false, reason: "contact_not_found", detail: "Contact not found." };

  const decision = decideSend(contact, sendKindFor(input.message, !!input.isOptOutConfirmation), now);
  if (!decision.allowed) {
    log.info({ reason: decision.reason }, "whatsapp send blocked");
    return { ok: false, reason: decision.reason, detail: describeBlock(decision.reason) };
  }

  const creds = dealerCredentials(dealer);
  if (!creds) {
    return {
      ok: false,
      reason: "not_connected",
      detail: "This dealer's WhatsApp number isn't connected yet.",
    };
  }

  const result = await callGraph({
    ...creds,
    payload: buildPayload(contact.phoneE164, input.message, contact.languagePref),
    fetchImpl: deps.fetch,
  });

  const conversation = await t.conversations.forContact(contact.id);
  const stored = storedBody(input.message);
  const row = await t.messages.insertOutbound({
    conversationId: conversation.id,
    sender: input.sender,
    ...stored,
    waMessageId: result.ok ? result.waMessageId : null,
    templateName: input.message.kind === "template" ? TEMPLATES[input.message.template].name : null,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error,
    costCategory: decision.costCategory,
  });

  if (!result.ok) {
    log.warn({ messageId: row.id, error: result.error }, "whatsapp send failed");
    return { ok: false, reason: "api_error", detail: `WhatsApp said: ${result.error}`, messageId: row.id };
  }
  log.info({ messageId: row.id, costCategory: decision.costCategory }, "whatsapp message sent");
  return { ok: true, messageId: row.id, waMessageId: result.waMessageId };
}
