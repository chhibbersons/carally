import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseWebhook, verifySignature, verifySubscription } from "../../src/whatsapp/webhook";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8"));

const sign = (body: string, secret: string) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifySignature", () => {
  const body = '{"object":"whatsapp_business_account","entry":[]}';

  it("accepts Meta's HMAC of the raw body", () => {
    expect(verifySignature(body, sign(body, "s3cret"), "s3cret")).toBe(true);
  });

  it("rejects a wrong secret, a changed body, or a missing header", () => {
    expect(verifySignature(body, sign(body, "other"), "s3cret")).toBe(false);
    expect(verifySignature(`${body} `, sign(body, "s3cret"), "s3cret")).toBe(false);
    expect(verifySignature(body, null, "s3cret")).toBe(false);
    expect(verifySignature(body, "sha256=abc", "s3cret")).toBe(false);
    expect(verifySignature(body, sign(body, "s3cret").replace("sha256=", "sha1="), "s3cret")).toBe(false);
  });
});

describe("verifySubscription", () => {
  const params = (o: Record<string, string>) => new URLSearchParams(o);

  it("echoes the challenge when the token matches", () => {
    expect(
      verifySubscription(
        params({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "1158201444" }),
        "tok",
      ),
    ).toBe("1158201444");
  });

  it("refuses a wrong token or mode", () => {
    expect(
      verifySubscription(params({ "hub.mode": "subscribe", "hub.verify_token": "bad", "hub.challenge": "1" }), "tok"),
    ).toBeNull();
    expect(
      verifySubscription(params({ "hub.mode": "unsubscribe", "hub.verify_token": "tok", "hub.challenge": "1" }), "tok"),
    ).toBeNull();
  });
});

describe("parseWebhook", () => {
  it("reads a text message with the buyer's number in E.164 and their profile name", () => {
    const parsed = parseWebhook(fixture("inbound-text.json"));
    expect(parsed.statuses).toEqual([]);
    expect(parsed.inbound).toEqual([
      {
        phoneNumberId: "106540352242922",
        waMessageId: "wamid.HBgMOTE5ODAwMDAwMDAxFQIAEhggQTFCMkMzRDRFNUY2",
        fromE164: "+919800000001",
        profileName: "Test Buyer",
        sentAt: new Date(1795430000 * 1000),
        type: "text",
        body: "Creta under 10 lakh hai kya?",
        media: null,
      },
    ]);
  });

  it("reads photos, button replies and locations, and skips an unreadable number", () => {
    const parsed = parseWebhook(fixture("inbound-mixed.json"));
    expect(parsed.inbound.map((m) => [m.type, m.body, m.media])).toEqual([
      ["image", "My old car for exchange", { id: "1479537139650973", mimeType: "image/jpeg", caption: "My old car for exchange" }],
      ["interactive", "Book a visit", null],
      ["location", "Andheri · 19.1197,72.8468", null],
    ]);
    expect(parsed.skipped).toBe(1);
  });

  it("reads delivery statuses and failure reasons, and skips unknown statuses", () => {
    const parsed = parseWebhook(fixture("statuses.json"));
    expect(parsed.statuses).toEqual([
      { phoneNumberId: "106540352242922", waMessageId: "wamid.OUT1", status: "delivered", at: new Date(1795430100 * 1000), error: null },
      {
        phoneNumberId: "106540352242922",
        waMessageId: "wamid.OUT2",
        status: "failed",
        at: new Date(1795430110 * 1000),
        error: "131047: Re-engagement message",
      },
    ]);
    expect(parsed.skipped).toBe(1);
  });

  it("ignores payloads that aren't WhatsApp", () => {
    expect(parseWebhook({ object: "page", entry: [] })).toEqual({ inbound: [], statuses: [], skipped: 1 });
    expect(parseWebhook("nonsense")).toEqual({ inbound: [], statuses: [], skipped: 1 });
  });
});
