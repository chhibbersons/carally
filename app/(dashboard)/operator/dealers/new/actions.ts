"use server";

import { redirect } from "next/navigation";
import { requireOperator } from "@/auth/guards";
import { inviteEmail } from "@/auth/emails";
import { createDealer, EmailTakenError } from "@/db/operator";
import {
  fieldErrors,
  formDataToNewDealer,
  newDealerSchema,
  type FieldErrors,
} from "@/dealers/new-dealer-schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mailer";

export type NewDealerState = {
  errors?: FieldErrors;
  formError?: string;
  values?: Record<string, unknown>;
};

export async function createDealerAction(
  _prev: NewDealerState,
  form: FormData,
): Promise<NewDealerState> {
  const operator = await requireOperator();
  const raw = formDataToNewDealer(form);
  const parsed = newDealerSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  const f = parsed.data;
  let dealerId: string;
  try {
    const { dealer } = await createDealer(
      {
        name: f.name,
        city: f.city,
        plan: f.plan,
        languages: f.languages,
        branch: { name: f.branchName, address: f.branchAddress, mapsUrl: f.branchMapsUrl },
        admin: { name: f.adminName, email: f.adminEmail },
      },
      operator.userId,
    );
    dealerId = dealer.id;
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return { errors: { adminEmail: "This email already has an account." }, values: raw };
    }
    logger.error({ err }, "create dealer failed");
    return { formError: "Couldn't create the dealer. Please try again.", values: raw };
  }

  try {
    await sendMail({
      to: f.adminEmail,
      ...inviteEmail({ dealerName: f.name, loginUrl: `${env().APP_URL}/login` }),
    });
  } catch (err) {
    // The dealer exists; a failed invite shouldn't undo that. They can still log in.
    logger.error({ err, dealerId }, "invite email failed");
  }

  redirect(`/operator/dealers?created=${dealerId}`);
}
