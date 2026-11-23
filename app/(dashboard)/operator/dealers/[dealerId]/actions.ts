"use server";

import { revalidatePath } from "next/cache";
import { requireOperator } from "@/auth/guards";
import { forDealer } from "@/db/tenant";
import {
  formErrors,
  formStrings,
  testSendSchema,
  whatsappSettingsSchema,
  type FormErrors,
} from "@/dealers/whatsapp-forms-schema";
import { encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendMessage } from "@/whatsapp/client";

export type ActionState = {
  errors?: FormErrors;
  ok?: string;
  values?: Record<string, string>;
};

function isUniqueViolation(err: unknown): boolean {
  const cause = err instanceof Error && "cause" in err ? err.cause : err;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

export async function saveWhatsAppAction(
  dealerId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const operator = await requireOperator();
  const raw = formStrings(form, ["whatsappPhoneNumberId", "wabaId", "accessToken"]);
  const values = { whatsappPhoneNumberId: raw.whatsappPhoneNumberId!, wabaId: raw.wabaId! };
  const parsed = whatsappSettingsSchema.safeParse(raw);
  if (!parsed.success) return { errors: formErrors(parsed.error), values };

  const { accessToken, ...ids } = parsed.data;
  let waAccessTokenEnc: string | undefined;
  if (accessToken) {
    if (!env().ENCRYPTION_KEY) {
      return { errors: { accessToken: "Set ENCRYPTION_KEY in .env before saving a token." }, values };
    }
    waAccessTokenEnc = encryptSecret(accessToken);
  }

  const t = forDealer(dealerId);
  try {
    const row = await t.dealer.updateWhatsApp({ ...ids, ...(waAccessTokenEnc ? { waAccessTokenEnc } : {}) });
    if (!row) return { errors: { form: "Dealer not found." }, values };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { errors: { whatsappPhoneNumberId: "Another dealer already uses this number." }, values };
    }
    logger.error({ err, dealerId }, "save whatsapp settings failed");
    return { errors: { form: "Couldn't save. Please try again." }, values };
  }
  await t.audit.log(operator.userId, "dealer.whatsapp_updated", {
    phoneNumberId: ids.whatsappPhoneNumberId,
    tokenChanged: !!waAccessTokenEnc,
  });

  revalidatePath(`/operator/dealers/${dealerId}`);
  return { ok: "Saved.", values };
}

export async function sendTestAction(
  dealerId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const operator = await requireOperator();
  const values = formStrings(form, ["phone", "kind", "text"]);
  const parsed = testSendSchema.safeParse(values);
  if (!parsed.success) return { errors: formErrors(parsed.error), values };

  const t = forDealer(dealerId);
  const contact = await t.contacts.ensure(parsed.data.phone);
  const result = await sendMessage({
    dealerId,
    contactId: contact.id,
    sender: "staff",
    message:
      parsed.data.kind === "hello_world"
        ? { kind: "template", template: "hello_world" }
        : { kind: "text", body: parsed.data.text! },
  });
  await t.audit.log(operator.userId, "whatsapp.test_sent", {
    contactId: contact.id,
    ok: result.ok,
    ...(result.ok ? {} : { reason: result.reason }),
  });

  revalidatePath(`/operator/dealers/${dealerId}`);
  if (!result.ok) return { errors: { form: result.detail }, values };
  return { ok: "Sent. Check the phone, and watch the status below change to delivered and read.", values };
}
