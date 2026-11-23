import { enqueue, QUEUES } from "@/jobs/queue";
import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifySignature, verifySubscription } from "@/whatsapp/webhook";

/**
 * Meta WhatsApp webhook (§8).
 *  GET  – one-time handshake when you save the webhook URL in Meta.
 *  POST – messages and delivery statuses. We check Meta's signature, queue the
 *         body for the worker and answer 200 at once. If queueing fails we
 *         answer 500, and Meta retries later.
 */

export async function GET(request: Request) {
  const challenge = verifySubscription(new URL(request.url).searchParams, requireEnv("WA_VERIFY_TOKEN"));
  if (challenge === null) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), requireEnv("WA_APP_SECRET"))) {
    logger.warn("whatsapp webhook with a bad signature rejected");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  try {
    await enqueue(QUEUES.whatsappWebhook, { payload });
  } catch (err) {
    logger.error({ err }, "could not queue whatsapp webhook");
    return new Response("Try again", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
