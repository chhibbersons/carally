import { getDb, type Db } from "@/db/client";
import type { Dealer } from "@/db/schema";
import { findDealerByPhoneNumberId } from "@/db/system";
import { forDealer } from "@/db/tenant";
import { logger } from "@/lib/logger";
import { sendMessage, type SendDeps } from "./client";
import { matchOptKeyword } from "./opt-out";
import { OPT_IN_CONFIRMATION, OPT_OUT_CONFIRMATION } from "./templates";
import { parseWebhook, type InboundMessage, type StatusUpdate } from "./webhook";

/**
 * Processes one webhook body from Meta (run by the worker, not the web
 * request). Safe to run twice on the same body: messages are deduped on
 * wa_message_id and statuses only move forward.
 */

export type WebhookSummary = {
  stored: number;
  duplicates: number;
  statusesApplied: number;
  unknownNumber: number;
  skipped: number;
};

export async function handleWebhookPayload(payload: unknown, deps: SendDeps = {}): Promise<WebhookSummary> {
  const db = deps.db ?? getDb();
  const parsed = parseWebhook(payload);
  const summary: WebhookSummary = {
    stored: 0,
    duplicates: 0,
    statusesApplied: 0,
    unknownNumber: 0,
    skipped: parsed.skipped,
  };

  const dealerCache = new Map<string, Dealer | null>();
  const dealerFor = async (phoneNumberId: string) => {
    if (!dealerCache.has(phoneNumberId)) {
      dealerCache.set(phoneNumberId, await findDealerByPhoneNumberId(phoneNumberId, db));
    }
    return dealerCache.get(phoneNumberId)!;
  };

  for (const msg of parsed.inbound) {
    const dealer = await dealerFor(msg.phoneNumberId);
    if (!dealer) {
      summary.unknownNumber++;
      logger.warn({ phoneNumberId: msg.phoneNumberId }, "whatsapp message for an unknown phone number id");
      continue;
    }
    const stored = await storeInbound(dealer.id, msg, { ...deps, db });
    if (stored) summary.stored++;
    else summary.duplicates++;
  }

  for (const status of parsed.statuses) {
    const dealer = await dealerFor(status.phoneNumberId);
    if (!dealer) {
      summary.unknownNumber++;
      continue;
    }
    if (await applyStatus(dealer.id, status, db)) summary.statusesApplied++;
  }

  return summary;
}

/** Stores one buyer message. Returns false if it was already stored. */
async function storeInbound(dealerId: string, msg: InboundMessage, deps: SendDeps & { db: Db }) {
  const t = forDealer(dealerId, deps.db);
  const contact = await t.contacts.recordInbound(msg.fromE164, msg.sentAt, msg.profileName);
  const conversation = await t.conversations.forContact(contact.id);
  const row = await t.messages.insertInbound({
    conversationId: conversation.id,
    waMessageId: msg.waMessageId,
    type: msg.type,
    body: msg.body,
    media: msg.media,
    createdAt: msg.sentAt,
  });
  if (!row) return false;

  const log = logger.child({ dealerId, contactId: contact.id, messageId: row.id });
  log.info({ type: msg.type }, "whatsapp message received");

  const keyword = msg.type === "text" || msg.type === "button" ? matchOptKeyword(msg.body) : null;
  const language = contact.languagePref ?? keyword?.language ?? "en";

  if (keyword?.action === "opt_out" && (await t.contacts.optOut(contact.id, msg.sentAt))) {
    await t.audit.log("system", "contact.opted_out", { contactId: contact.id, messageId: row.id });
    const sent = await sendMessage(
      {
        dealerId,
        contactId: contact.id,
        sender: "system",
        isOptOutConfirmation: true,
        message: { kind: "text", body: OPT_OUT_CONFIRMATION[language] },
      },
      deps,
    );
    if (!sent.ok) log.warn({ reason: sent.reason }, "opt-out confirmation not sent");
  } else if (keyword?.action === "opt_in" && (await t.contacts.optIn(contact.id))) {
    await t.audit.log("system", "contact.opted_in", { contactId: contact.id, messageId: row.id });
    const sent = await sendMessage(
      {
        dealerId,
        contactId: contact.id,
        sender: "system",
        message: { kind: "text", body: OPT_IN_CONFIRMATION[language] },
      },
      deps,
    );
    if (!sent.ok) log.warn({ reason: sent.reason }, "opt-in confirmation not sent");
  }

  // MVP step 5 hands the message to the AI reply engine here.
  return true;
}

async function applyStatus(dealerId: string, status: StatusUpdate, db: Db) {
  const applied = await forDealer(dealerId, db).messages.applyStatus(
    status.waMessageId,
    status.status,
    status.at,
    status.error,
  );
  if (status.status === "failed") {
    logger.warn({ dealerId, error: status.error }, "whatsapp message failed to deliver");
  }
  return applied;
}
