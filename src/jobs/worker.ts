import { pathToFileURL } from "node:url";
import { logger } from "@/lib/logger";
import { handleWebhookPayload } from "@/whatsapp/inbound";
import { createBoss, ensureQueues, QUEUES } from "./queue";

/**
 * Background worker: `pnpm worker`. Keep it running next to `pnpm dev`, or
 * incoming WhatsApp messages wait in the queue. Follow-ups, reminders and
 * reports are added in later MVP steps.
 */
export async function startWorker() {
  const boss = createBoss({ worker: true });
  await boss.start();
  await ensureQueues(boss);

  await boss.work<{ payload: unknown }>(QUEUES.whatsappWebhook, async (jobs) => {
    for (const job of jobs) {
      const summary = await handleWebhookPayload(job.data.payload);
      logger.info({ jobId: job.id, ...summary }, "whatsapp webhook processed");
    }
  });

  logger.info("worker started");

  const shutdown = async () => {
    logger.info("worker stopping");
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWorker().catch((err: unknown) => {
    logger.error({ err }, "worker failed to start");
    process.exit(1);
  });
}
