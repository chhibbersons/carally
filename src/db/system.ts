import { eq } from "drizzle-orm";
import { getDb, type Db } from "./client";
import { dealers } from "./schema";

/**
 * Lookups that background jobs need before they know which dealer an event
 * belongs to. Once the dealer is known, switch to forDealer().
 */

/** The dealer that owns a WhatsApp phone number id, or null. */
export async function findDealerByPhoneNumberId(phoneNumberId: string, db: Db = getDb()) {
  const [row] = await db
    .select()
    .from(dealers)
    .where(eq(dealers.whatsappPhoneNumberId, phoneNumberId))
    .limit(1);
  return row ?? null;
}
