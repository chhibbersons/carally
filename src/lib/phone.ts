/**
 * Phone helpers. All stored phone numbers are E.164 (for India: +91 and
 * ten digits). Use `maskPhone` whenever a number could reach a log or an
 * error report.
 */

const INDIA_MOBILE = /^[6-9]\d{9}$/;
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Normalises a phone number to E.164, assuming India when no country code is
 * given. Returns null when the input is not a plausible number.
 *
 * Accepts: "98765 43210", "098765-43210", "919876543210", "+91 98765 43210",
 * "0091 98765 43210", and other countries written with a leading "+".
 */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");

  if (!hasPlus && digits.startsWith("00")) {
    digits = digits.slice(2);
    return E164.test(`+${digits}`) ? normaliseIndian(`+${digits}`) : null;
  }

  if (hasPlus) {
    return E164.test(`+${digits}`) ? normaliseIndian(`+${digits}`) : null;
  }

  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);

  return INDIA_MOBILE.test(digits) ? `+91${digits}` : null;
}

function normaliseIndian(e164: string): string | null {
  if (!e164.startsWith("+91")) return e164;
  return INDIA_MOBILE.test(e164.slice(3)) ? e164 : null;
}

/** "+919876543210" becomes "+91******3210". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  const last4 = digits.slice(-4);
  if (digits.length === 12 && digits.startsWith("91")) return `+91******${last4}`;
  return `******${last4}`;
}

/**
 * Masks anything that looks like a phone number inside free text, so that a
 * log message can't leak a buyer's number by accident.
 */
const PHONE_IN_TEXT = /(?:\+|\b00)?(?:\d[\s-]?){10,14}\d?\b/g;

export function maskPhonesInText(text: string): string {
  return text.replace(PHONE_IN_TEXT, (match) => {
    const digits = match.replace(/\D/g, "");
    return digits.length >= 10 ? maskPhone(match) : match;
  });
}
