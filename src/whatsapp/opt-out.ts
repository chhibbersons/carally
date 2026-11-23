import type { Language } from "@/db/schema";

/**
 * Recognises opt-out and opt-in messages (§8). We match the whole message, not
 * a word inside it, so "don't stop sending Creta photos" is not an opt-out.
 */

const OPT_OUT: Record<string, Language> = {
  stop: "en",
  "stop all": "en",
  "stop messages": "en",
  "stop messaging": "en",
  unsubscribe: "en",
  "opt out": "en",
  optout: "en",
  "band karo": "hinglish",
  "band kro": "hinglish",
  "band kar do": "hinglish",
  "band kardo": "hinglish",
  "bandh karo": "hinglish",
  "message mat karo": "hinglish",
  "msg mat karo": "hinglish",
  "message mat bhejo": "hinglish",
  "mat bhejo": "hinglish",
  "बंद करो": "hi",
  "बंद कर दो": "hi",
  "मैसेज मत भेजो": "hi",
  "बंद करा": "mr",
  "थांबवा": "mr",
  "मेसेज पाठवू नका": "mr",
};

const OPT_IN: Record<string, Language> = {
  start: "en",
  subscribe: "en",
  "opt in": "en",
  "shuru karo": "hinglish",
  "शुरू करो": "hi",
  "सुरू करा": "mr",
};

/** Lower-cases, trims, and drops punctuation and emoji around the words. */
export function normaliseKeyword(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type KeywordMatch = { action: "opt_out" | "opt_in"; language: Language };

export function matchOptKeyword(text: string | null | undefined): KeywordMatch | null {
  if (!text) return null;
  const key = normaliseKeyword(text);
  if (Object.hasOwn(OPT_OUT, key)) return { action: "opt_out", language: OPT_OUT[key]! };
  if (Object.hasOwn(OPT_IN, key)) return { action: "opt_in", language: OPT_IN[key]! };
  return null;
}
