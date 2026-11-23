import pino from "pino";
import { maskPhone, maskPhonesInText } from "./phone";

/**
 * Structured JSON logger. Buyer phone numbers, names and emails must never be
 * logged in clear (§10). Two safety nets:
 *  1. Known personal fields are redacted wherever they appear (two levels deep).
 *  2. Phone-like numbers inside log message strings are masked.
 * Still prefer logging ids, not personal data.
 */

const PERSONAL_KEYS = [
  "phone",
  "phone_e164",
  "phoneE164",
  "whatsapp_number",
  "whatsappNumber",
  "email",
  "name",
];

const redactPaths = PERSONAL_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]);

function censor(value: unknown): string {
  if (typeof value === "string" && /\d{10,}/.test(value.replace(/\D/g, ""))) {
    return maskPhone(value);
  }
  return "[redacted]";
}

export function createLogger(options: { level?: string } = {}) {
  return pino({
    level: options.level ?? process.env.LOG_LEVEL ?? "info",
    base: { service: "dealerreply" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: redactPaths, censor },
    hooks: {
      logMethod(args, method) {
        const masked = args.map((a) => (typeof a === "string" ? maskPhonesInText(a) : a));
        method.apply(this, masked as Parameters<typeof method>);
      },
    },
  });
}

export const logger = createLogger();
