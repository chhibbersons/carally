import type { Language } from "@/db/schema";

/**
 * WhatsApp copy (§11): approved templates, and the fixed messages the system
 * sends itself. Every entry has a version for each language we support.
 *
 * Templates must be created and approved in Meta's WhatsApp Manager first,
 * with exactly the name, language and category below. The category decides
 * the price and when we may send it (marketing is never sent 21:00–09:00 IST).
 * Later steps add welcome, follow-up, visit reminder and salesperson alert.
 */

export type TemplateCategory = "utility" | "marketing";

export type TemplateDef = {
  /** Name as approved in WhatsApp Manager. */
  name: string;
  category: TemplateCategory;
  /** Our language → Meta's language code, for each approved translation. */
  languages: Partial<Record<Language, string>>;
  /** How many {{n}} placeholders the body has. */
  bodyParams: number;
  description: string;
};

export const TEMPLATES = {
  /** Meta's ready-made sample template. Every new WhatsApp number has it, so it is good for a first test. */
  hello_world: {
    name: "hello_world",
    category: "utility",
    languages: { en: "en_US" },
    bodyParams: 0,
    description: "Meta's sample \"Hello World\" message, for testing a new number",
  },
} as const satisfies Record<string, TemplateDef>;

export type TemplateKey = keyof typeof TEMPLATES;

export function isTemplateKey(key: string): key is TemplateKey {
  return Object.hasOwn(TEMPLATES, key);
}

/** Meta language code for a template, preferring the buyer's language and falling back to English. */
export function templateLanguageCode(def: TemplateDef, preferred: Language | null | undefined): string {
  const codes = def.languages;
  const code = (preferred && codes[preferred]) ?? codes.en ?? Object.values(codes)[0];
  if (!code) throw new Error(`Template ${def.name} has no languages`);
  return code;
}

// ---------------------------------------------------------------------------
// Free-form system messages (sent only inside the 24-hour window)
// ---------------------------------------------------------------------------

export const OPT_OUT_CONFIRMATION: Record<Language, string> = {
  en: "You won't get any more messages from us. Reply START if you change your mind.",
  hi: "अब आपको हमारी तरफ़ से कोई मैसेज नहीं आएगा। दोबारा शुरू करने के लिए START लिखें।",
  hinglish: "Ab aapko humari taraf se koi message nahi aayega. Dobara shuru karne ke liye START likhein.",
  mr: "आता तुम्हाला आमच्याकडून कोणताही मेसेज येणार नाही. पुन्हा सुरू करण्यासाठी START लिहा.",
};

export const OPT_IN_CONFIRMATION: Record<Language, string> = {
  en: "Welcome back! You'll hear from us again.",
  hi: "आपका फिर से स्वागत है! अब आपको हमारे मैसेज मिलेंगे।",
  hinglish: "Welcome back! Ab aapko humare messages milenge.",
  mr: "पुन्हा स्वागत आहे! आता तुम्हाला आमचे मेसेज मिळतील.",
};
