import type { CostCategory } from "@/db/schema";

/**
 * The one place that decides whether a WhatsApp message may be sent (§8).
 * Every send in src/whatsapp/client.ts asks this first.
 *
 * Rules:
 *  - Never message a contact who opted out (the opt-out confirmation itself is
 *    the only exception).
 *  - Free-form messages (text, photos, video) only within 24 hours of the
 *    buyer's last message. Outside it, approved templates only.
 *  - Marketing templates never between 21:00 and 09:00 IST.
 */

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** IST has no daylight saving, so a fixed offset is exact. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
export const QUIET_HOURS_IST = { start: 21, end: 9 } as const;

export type SendKind =
  | { kind: "freeform" }
  | { kind: "template"; category: Exclude<CostCategory, "service"> }
  | { kind: "opt_out_confirmation" };

export type WindowContact = { optedOut: boolean; lastInboundAt: Date | null };

export type BlockReason = "opted_out" | "outside_window" | "quiet_hours";

export type SendDecision =
  | { allowed: true; costCategory: CostCategory }
  | { allowed: false; reason: BlockReason };

/** True when the buyer messaged within the last 24 hours. */
export function isWindowOpen(lastInboundAt: Date | null, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const age = now.getTime() - lastInboundAt.getTime();
  return age < SERVICE_WINDOW_MS;
}

/** When the window closes, or null if it is already closed. */
export function windowClosesAt(lastInboundAt: Date | null, now: Date = new Date()): Date | null {
  if (!isWindowOpen(lastInboundAt, now)) return null;
  return new Date(lastInboundAt!.getTime() + SERVICE_WINDOW_MS);
}

/** Hour of the day (0–23) in IST. */
export function istHour(date: Date): number {
  return new Date(date.getTime() + IST_OFFSET_MS).getUTCHours();
}

export function isQuietHours(now: Date = new Date()): boolean {
  const h = istHour(now);
  return h >= QUIET_HOURS_IST.start || h < QUIET_HOURS_IST.end;
}

export function decideSend(contact: WindowContact, send: SendKind, now: Date = new Date()): SendDecision {
  if (send.kind === "opt_out_confirmation") {
    // Sent once, straight after the buyer's own STOP, so the window is open.
    return isWindowOpen(contact.lastInboundAt, now)
      ? { allowed: true, costCategory: "service" }
      : { allowed: false, reason: "outside_window" };
  }

  if (contact.optedOut) return { allowed: false, reason: "opted_out" };

  if (send.kind === "freeform") {
    return isWindowOpen(contact.lastInboundAt, now)
      ? { allowed: true, costCategory: "service" }
      : { allowed: false, reason: "outside_window" };
  }

  if (send.category === "marketing" && isQuietHours(now)) {
    return { allowed: false, reason: "quiet_hours" };
  }
  return { allowed: true, costCategory: send.category };
}

/** Plain-English explanation of a blocked send, for the dashboard. */
export function describeBlock(reason: BlockReason): string {
  switch (reason) {
    case "opted_out":
      return "This person has opted out of WhatsApp messages.";
    case "outside_window":
      return "It has been more than 24 hours since this person last messaged, so only an approved template can be sent.";
    case "quiet_hours":
      return "Marketing messages are not sent between 9 PM and 9 AM IST.";
  }
}
