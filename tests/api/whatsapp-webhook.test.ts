import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueue = vi.fn();
vi.mock("@/jobs/queue", () => ({ enqueue, QUEUES: { whatsappWebhook: "whatsapp-webhook" } }));

const { GET, POST } = await import("../../app/api/webhooks/whatsapp/route");

const SECRET = "test-app-secret"; // matches vitest.config.ts
const URL_BASE = "https://app.example/api/webhooks/whatsapp";
const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
const sign = (b: string) => `sha256=${createHmac("sha256", SECRET).update(b).digest("hex")}`;
const post = (b: string, sig: string | null) =>
  POST(new Request(URL_BASE, { method: "POST", body: b, headers: sig ? { "x-hub-signature-256": sig } : {} }));

describe("WhatsApp webhook route", () => {
  beforeEach(() => {
    enqueue.mockReset().mockResolvedValue("job-1");
  });

  it("answers Meta's verification handshake", async () => {
    const ok = await GET(new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=42`));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
    const bad = await GET(new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42`));
    expect(bad.status).toBe(403);
  });

  it("queues a correctly signed body and answers 200", async () => {
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(enqueue).toHaveBeenCalledWith("whatsapp-webhook", { payload: JSON.parse(body) });
  });

  it("rejects a missing or wrong signature without queueing", async () => {
    expect((await post(body, null)).status).toBe(401);
    expect((await post(body, sign(`${body}x`))).status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("answers 500 when the queue is down, so Meta retries", async () => {
    enqueue.mockImplementation(async () => {
      throw new Error("db down");
    });
    expect((await post(body, sign(body))).status).toBe(500);
  });
});
