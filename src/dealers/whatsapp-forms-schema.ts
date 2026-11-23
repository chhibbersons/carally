import { z } from "zod";
import { toE164 } from "@/lib/phone";

/** Operator form: connect a dealer's WhatsApp number. */
export const whatsappSettingsSchema = z.object({
  whatsappPhoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{6,25}$/, "Paste the Phone number ID from Meta (digits only)"),
  wabaId: z
    .string()
    .trim()
    .regex(/^(\d{6,25})?$/, "Paste the WhatsApp Business Account ID (digits only), or leave it empty")
    .transform((v) => (v ? v : null)),
  /** Empty means "keep the saved token". */
  accessToken: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => v === "" || v.length >= 20, "That doesn't look like an access token")
    .transform((v) => (v ? v : null)),
});

/** Operator form: send a test message. */
export const testSendSchema = z
  .object({
    phone: z
      .string()
      .transform((v, ctx) => {
        const e164 = toE164(v);
        if (!e164) {
          ctx.addIssue({ code: "custom", message: "Enter a valid mobile number, like 98765 43210" });
          return z.NEVER;
        }
        return e164;
      }),
    kind: z.enum(["hello_world", "text"]),
    text: z.string().trim().max(4096).optional(),
  })
  .refine((v) => v.kind !== "text" || !!v.text, { path: ["text"], message: "Type a message" });

export type FormErrors = Record<string, string>;

export function formErrors(error: z.ZodError): FormErrors {
  const out: FormErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

export function formStrings(form: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    keys.map((k) => {
      const v = form.get(k);
      return [k, typeof v === "string" ? v : ""];
    }),
  );
}
