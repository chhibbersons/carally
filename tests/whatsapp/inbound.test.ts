import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { createDealer } from "../../src/db/operator";
import { contacts, messages, users } from "../../src/db/schema";
import { forDealer } from "../../src/db/tenant";
import { sendMessage } from "../../src/whatsapp/client";
import { handleWebhookPayload } from "../../src/whatsapp/inbound";
import { describeDb, useTestDb } from "../support/db";

const PHONE_ID_A = "106540352242922";
const PHONE_ID_B = "200000000000001";
const BUYER = "919800000001";
const T0 = 1795430000; // unix seconds

const inbound = (opts: { id: string; text: string; ts?: number; phoneNumberId?: string; from?: string }) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550000000", phone_number_id: opts.phoneNumberId ?? PHONE_ID_A },
            contacts: [{ profile: { name: "Test Buyer" }, wa_id: opts.from ?? BUYER }],
            messages: [
              { from: opts.from ?? BUYER, id: opts.id, timestamp: String(opts.ts ?? T0), type: "text", text: { body: opts.text } },
            ],
          },
        },
      ],
    },
  ],
});

const statuses = (items: { id: string; status: string; ts: number; error?: { code: number; title: string } }[]) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: PHONE_ID_A },
            statuses: items.map((s) => ({
              id: s.id,
              status: s.status,
              timestamp: String(s.ts),
              recipient_id: BUYER,
              ...(s.error ? { errors: [s.error] } : {}),
            })),
          },
        },
      ],
    },
  ],
});

/** A fake Graph API that answers each send with wamid.OUT1, OUT2, … */
function fakeGraph() {
  let n = 0;
  return vi.fn<typeof fetch>(async () => {
    n++;
    return new Response(JSON.stringify({ messages: [{ id: `wamid.OUT${n}` }] }), { status: 200 });
  });
}

describeDb("WhatsApp inbound and sending", () => {
  const db = useTestDb();
  const now = new Date((T0 + 60) * 1000);

  async function setup() {
    const [op] = await db().insert(users).values({ role: "operator", email: "op@example.com" }).returning();
    const make = (name: string, email: string) =>
      createDealer(
        { name, city: "Mumbai", plan: "starter", languages: ["en"], branch: { name: "Main" }, admin: { name: "Owner", email } },
        op!.id,
        db(),
      );
    const a = (await make("Alpha Motors", "alpha@example.com")).dealer;
    const b = (await make("Beta Cars", "beta@example.com")).dealer;
    await forDealer(a.id, db()).dealer.updateWhatsApp({ whatsappPhoneNumberId: PHONE_ID_A, wabaId: null });
    await forDealer(b.id, db()).dealer.updateWhatsApp({ whatsappPhoneNumberId: PHONE_ID_B, wabaId: null });
    return { a, b, graph: fakeGraph() };
  }

  it("stores a buyer's message once, even when Meta sends it twice", async () => {
    const { a, graph } = await setup();
    const payload = inbound({ id: "wamid.IN1", text: "Creta under 10 lakh?" });

    expect(await handleWebhookPayload(payload, { db: db(), fetch: graph, now })).toMatchObject({ stored: 1 });
    expect(await handleWebhookPayload(payload, { db: db(), fetch: graph, now })).toMatchObject({
      stored: 0,
      duplicates: 1,
    });

    const t = forDealer(a.id, db());
    const contact = await t.contacts.findByPhone("+919800000001");
    expect(contact).toMatchObject({ name: "Test Buyer", lastInboundAt: new Date(T0 * 1000), optedOut: false });
    const rows = await t.messages.recent();
    expect(rows.map((r) => [r.message.direction, r.message.sender, r.message.body])).toEqual([
      ["in", "buyer", "Creta under 10 lakh?"],
    ]);
    expect(graph).not.toHaveBeenCalled();
  });

  it("only moves the 24-hour window forward when messages arrive out of order", async () => {
    const { a } = await setup();
    await handleWebhookPayload(inbound({ id: "wamid.NEW", text: "later", ts: T0 + 100 }), { db: db() });
    await handleWebhookPayload(inbound({ id: "wamid.OLD", text: "earlier", ts: T0 }), { db: db() });
    const contact = await forDealer(a.id, db()).contacts.findByPhone("+919800000001");
    expect(contact?.lastInboundAt).toEqual(new Date((T0 + 100) * 1000));
  });

  it("routes by phone number id and ignores unknown numbers", async () => {
    const { a, b } = await setup();
    await handleWebhookPayload(inbound({ id: "wamid.B1", text: "hi B", phoneNumberId: PHONE_ID_B }), { db: db() });
    expect(await handleWebhookPayload(inbound({ id: "wamid.X1", text: "hi", phoneNumberId: "999" }), { db: db() })).toMatchObject({
      unknownNumber: 1,
      stored: 0,
    });

    expect(await forDealer(a.id, db()).contacts.findByPhone("+919800000001")).toBeNull();
    expect((await forDealer(b.id, db()).messages.recent()).map((r) => r.message.body)).toEqual(["hi B"]);
  });

  it("opts out on STOP, confirms once, then blocks every send until START", async () => {
    const { a, graph } = await setup();
    const deps = { db: db(), fetch: graph, now };

    await handleWebhookPayload(inbound({ id: "wamid.S1", text: "STOP" }), deps);
    await handleWebhookPayload(inbound({ id: "wamid.S2", text: "stop", ts: T0 + 5 }), deps);

    const t = forDealer(a.id, db());
    const contact = (await t.contacts.findByPhone("+919800000001"))!;
    expect(contact.optedOut).toBe(true);
    expect(graph).toHaveBeenCalledTimes(1);
    const confirmation = (await t.messages.recent()).find((r) => r.message.direction === "out")!.message;
    expect(confirmation).toMatchObject({ sender: "system", status: "sent", costCategory: "service" });
    expect(confirmation.body).toContain("START");

    const blocked = await sendMessage(
      { dealerId: a.id, contactId: contact.id, sender: "ai", message: { kind: "text", body: "Hi again" } },
      deps,
    );
    expect(blocked).toMatchObject({ ok: false, reason: "opted_out" });
    expect(graph).toHaveBeenCalledTimes(1);

    await handleWebhookPayload(inbound({ id: "wamid.S3", text: "START", ts: T0 + 10 }), deps);
    expect((await t.contacts.get(contact.id))?.optedOut).toBe(false);
    expect(graph).toHaveBeenCalledTimes(2);
    expect((await t.audit.list()).map((e) => e.action)).toEqual(
      expect.arrayContaining(["contact.opted_out", "contact.opted_in"]),
    );
  });

  it("applies delivery statuses forward only, and records failures", async () => {
    const { a, graph } = await setup();
    const deps = { db: db(), fetch: graph, now };
    await handleWebhookPayload(inbound({ id: "wamid.IN1", text: "hi" }), deps);
    const t = forDealer(a.id, db());
    const contact = (await t.contacts.findByPhone("+919800000001"))!;
    for (const body of ["one", "two"]) {
      await sendMessage({ dealerId: a.id, contactId: contact.id, sender: "staff", message: { kind: "text", body } }, deps);
    }

    await handleWebhookPayload(
      statuses([
        { id: "wamid.OUT1", status: "read", ts: T0 + 30 },
        { id: "wamid.OUT1", status: "delivered", ts: T0 + 20 },
        { id: "wamid.OUT2", status: "failed", ts: T0 + 30, error: { code: 131026, title: "Message undeliverable" } },
      ]),
      { db: db() },
    );

    const byWamid = Object.fromEntries(
      (await db().select().from(messages).where(eq(messages.dealerId, a.id)))
        .filter((m) => m.waMessageId?.startsWith("wamid.OUT"))
        .map((m) => [m.waMessageId, [m.status, m.error]]),
    );
    expect(byWamid).toEqual({
      "wamid.OUT1": ["read", null],
      "wamid.OUT2": ["failed", "131026: Message undeliverable"],
    });
  });

  it("allows only templates outside the 24-hour window, tagged with their cost category", async () => {
    const { a, graph } = await setup();
    const t = forDealer(a.id, db());
    const contact = await t.contacts.ensure("+919800000002");
    const deps = { db: db(), fetch: graph, now };

    expect(
      await sendMessage({ dealerId: a.id, contactId: contact.id, sender: "ai", message: { kind: "text", body: "Hi" } }, deps),
    ).toMatchObject({ ok: false, reason: "outside_window" });
    expect(graph).not.toHaveBeenCalled();

    const sent = await sendMessage(
      { dealerId: a.id, contactId: contact.id, sender: "staff", message: { kind: "template", template: "hello_world" } },
      deps,
    );
    expect(sent).toMatchObject({ ok: true, waMessageId: "wamid.OUT1" });
    const [row] = await t.messages.recent();
    expect(row!.message).toMatchObject({ type: "template", templateName: "hello_world", costCategory: "utility" });
    const body = JSON.parse(String(graph.mock.calls[0]![1]!.body));
    expect(body).toMatchObject({ to: "919800000002", template: { name: "hello_world" } });
  });

  it("stores a failed send with Meta's error, and refuses dealers without a number", async () => {
    const { a, b } = await setup();
    const failing = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 131030, message: "not allowed" } }), { status: 400 }),
    );
    const contact = await forDealer(a.id, db()).contacts.ensure("+919800000003");
    const result = await sendMessage(
      { dealerId: a.id, contactId: contact.id, sender: "staff", message: { kind: "template", template: "hello_world" } },
      { db: db(), fetch: failing, now },
    );
    expect(result).toMatchObject({ ok: false, reason: "api_error" });
    const [row] = await forDealer(a.id, db()).messages.recent();
    expect(row!.message).toMatchObject({ status: "failed", error: "131030: not allowed", waMessageId: null });

    await forDealer(b.id, db()).dealer.updateWhatsApp({ whatsappPhoneNumberId: null, wabaId: null });
    const bContact = await forDealer(b.id, db()).contacts.ensure("+919800000003");
    expect(
      await sendMessage(
        { dealerId: b.id, contactId: bContact.id, sender: "staff", message: { kind: "template", template: "hello_world" } },
        { db: db(), fetch: failing, now },
      ),
    ).toMatchObject({ ok: false, reason: "not_connected" });
  });

  it("can't send to another dealer's contact", async () => {
    const { a, b, graph } = await setup();
    await handleWebhookPayload(inbound({ id: "wamid.IN1", text: "hi" }), { db: db() });
    const [aContact] = await db().select().from(contacts).where(eq(contacts.dealerId, a.id));
    expect(
      await sendMessage(
        { dealerId: b.id, contactId: aContact!.id, sender: "staff", message: { kind: "text", body: "hi" } },
        { db: db(), fetch: graph, now },
      ),
    ).toMatchObject({ ok: false, reason: "contact_not_found" });
    expect(graph).not.toHaveBeenCalled();
  });
});
