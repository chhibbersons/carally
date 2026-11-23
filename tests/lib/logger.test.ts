import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return { lines, stream };
}

describe("logger", () => {
  it("masks phones and redacts personal fields", async () => {
    const { lines, stream } = captureLogger();
    vi.resetModules();
    vi.doMock("pino", () => ({
      default: Object.assign((opts: pino.LoggerOptions) => pino(opts, stream), pino),
    }));
    const { createLogger } = await import("@/lib/logger");
    const log = createLogger();

    log.info({ phone: "+919876543210", email: "a@b.com", leadId: "L1" }, "new lead +919876543210");
    log.info({ contact: { name: "Ravi Kumar" } }, "contact");

    const all = lines.join("\n");
    expect(all).not.toContain("9876543210");
    expect(all).not.toContain("a@b.com");
    expect(all).not.toContain("Ravi Kumar");
    expect(all).toContain("+91******3210");
    expect(all).toContain("L1");
    vi.doUnmock("pino");
  });
});
