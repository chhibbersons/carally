import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("accepts the core values in development and fills defaults", () => {
    const env = parseEnv({ ...base, NODE_ENV: "development" });
    expect(env.AI_MODEL_FAST).toBe("claude-haiku-5-5");
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.WA_APP_SECRET).toBeUndefined();
  });

  it("treats empty strings as missing", () => {
    expect(parseEnv({ ...base, WA_APP_SECRET: "" }).WA_APP_SECRET).toBeUndefined();
  });

  it("lists every missing value", () => {
    expect(() => parseEnv({ NODE_ENV: "development" })).toThrow(/DATABASE_URL[\s\S]*AUTH_SECRET/);
  });

  it("requires integration secrets in production", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production" })).toThrow(/WA_APP_SECRET/);
  });
});
