import { z } from "zod";
import { LANGUAGES, PLANS } from "@/db/schema";

/** Validates the operator's "New dealer" form. */
export const newDealerSchema = z.object({
  name: z.string().trim().min(2, "Enter the dealer's business name").max(120),
  city: z.string().trim().min(2, "Enter a city").max(80),
  plan: z.enum(PLANS, { error: "Pick a plan" }),
  languages: z
    .array(z.enum(LANGUAGES))
    .min(1, "Pick at least one language")
    .transform((l) => Array.from(new Set(l))),
  branchName: z.string().trim().min(2, "Enter the branch name, for example the area").max(80),
  branchAddress: z.string().trim().max(300).optional().transform(emptyToNull),
  branchMapsUrl: z
    .union([z.literal(""), z.url({ protocol: /^https$/, error: "Use a full https:// link" })])
    .optional()
    .transform(emptyToNull),
  adminName: z.string().trim().min(2, "Enter the owner's name").max(80),
  adminEmail: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
});

export type NewDealerForm = z.infer<typeof newDealerSchema>;

function emptyToNull(v: string | undefined): string | null {
  return v ? v : null;
}

/** Reads the form fields out of FormData into a plain object for Zod. */
export function formDataToNewDealer(form: FormData): Record<string, unknown> {
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  return {
    name: str("name"),
    city: str("city"),
    plan: str("plan"),
    languages: form.getAll("languages").filter((v): v is string => typeof v === "string"),
    branchName: str("branchName"),
    branchAddress: str("branchAddress"),
    branchMapsUrl: str("branchMapsUrl"),
    adminName: str("adminName"),
    adminEmail: str("adminEmail"),
  };
}

export type FieldErrors = Partial<Record<keyof NewDealerForm, string>>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof NewDealerForm | undefined;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}
