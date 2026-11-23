import { describe, expect, it, vi } from "vitest";
import { buildPayload, callGraph } from "../../src/whatsapp/client";

describe("buildPayload", () => {
  it("builds a text message without the leading +", () => {
    expect(buildPayload("+919800000001", { kind: "text", body: "Hi" }, null)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "919800000001",
      type: "text",
      text: { body: "Hi", preview_url: false },
    });
  });

  it("builds image and video messages from a link", () => {
    expect(buildPayload("+919800000001", { kind: "image", url: "https://cdn.example/a.jpg", caption: "Creta" }, null)).toMatchObject({
      type: "image",
      image: { link: "https://cdn.example/a.jpg", caption: "Creta" },
    });
    expect(buildPayload("+919800000001", { kind: "video", url: "https://cdn.example/a.mp4" }, null)).toMatchObject({
      type: "video",
      video: { link: "https://cdn.example/a.mp4" },
    });
  });

  it("builds a template with Meta's language code", () => {
    expect(buildPayload("+919800000001", { kind: "template", template: "hello_world" }, "hi")).toMatchObject({
      type: "template",
      template: { name: "hello_world", language: { code: "en_US" } },
    });
  });
});

describe("callGraph", () => {
  const json = (status: number, body: unknown) =>
    vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it("posts to the phone number's messages endpoint with the token", async () => {
    const fetchImpl = json(200, { messages: [{ id: "wamid.NEW" }] });
    const result = await callGraph({ phoneNumberId: "123", token: "tok", payload: { a: 1 }, fetchImpl });
    expect(result).toEqual({ ok: true, waMessageId: "wamid.NEW" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v24.0/123/messages");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok" });
    expect(init?.body).toBe('{"a":1}');
  });

  it("returns Meta's error code and detail", async () => {
    const fetchImpl = json(400, {
      error: { message: "(#131030) Recipient phone number not in allowed list", code: 131030, error_data: { details: "Recipient not in allowed list" } },
    });
    expect(await callGraph({ phoneNumberId: "1", token: "t", payload: {}, fetchImpl })).toEqual({
      ok: false,
      error: "131030: Recipient not in allowed list",
    });
  });

  it("turns a network failure into an error result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("ECONNRESET"));
    expect(await callGraph({ phoneNumberId: "1", token: "t", payload: {}, fetchImpl })).toEqual({
      ok: false,
      error: "network: ECONNRESET",
    });
  });
});
