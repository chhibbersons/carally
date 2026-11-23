import { z } from "zod";

/**
 * Environment variables, validated once with Zod.
 *
 * Core values are always required. Integration secrets (WhatsApp, Anthropic,
 * R2, inbound email, Sentry) are required in production but optional in
 * development and test, so the app can run locally before those accounts exist.
 * Each integration module should call `requireEnv("KEY")` when it needs one.
 */

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const coreSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  APP_URL: z.url().default("http://localhost:3000"),
  AUTH_EMAIL_FROM: optionalString,
  AUTH_EMAIL_SERVER: optionalString,
  AI_MODEL_FAST: z.string().default("claude-haiku-5-5"),
  AI_MODEL_SMART: z.string().default("claude-sonnet-5-5"),
  TZ_DISPLAY: z.string().default("Asia/Kolkata"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

const integrationKeys = [
  "ANTHROPIC_API_KEY",
  "WA_APP_SECRET",
  "WA_VERIFY_TOKEN",
  "WA_SYSTEM_USER_TOKEN",
  "ENCRYPTION_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "INBOUND_EMAIL_SECRET",
  "SENTRY_DSN",
] as const;

type IntegrationKey = (typeof integrationKeys)[number];

const integrationSchema = z.object(
  Object.fromEntries(integrationKeys.map((k) => [k, optionalString])) as Record<
    IntegrationKey,
    typeof optionalString
  >,
);

const schema = coreSchema.extend(integrationSchema.shape).superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") return;
  for (const key of integrationKeys) {
    if (!env[key]) {
      ctx.addIssue({ code: "custom", path: [key], message: "Required in production" });
    }
  }
  if (!env.AUTH_EMAIL_SERVER || !env.AUTH_EMAIL_FROM) {
    ctx.addIssue({
      code: "custom",
      path: ["AUTH_EMAIL_SERVER"],
      message: "AUTH_EMAIL_SERVER and AUTH_EMAIL_FROM are required in production",
    });
  }
});

export type Env = z.infer<typeof schema>;

/** Parses an env object. Throws one readable error listing every problem. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${lines.join("\n")}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** The validated env for this process. Parsed on first call. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Returns an integration secret, or throws if it is not set. */
export function requireEnv(key: IntegrationKey): string {
  const value = env()[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
}
