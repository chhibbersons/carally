import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Background job queue (pg-boss, stored in Postgres). The web app only adds
 * jobs; `pnpm worker` (src/jobs/worker.ts) runs them.
 */

export const QUEUES = {
  /** One raw WhatsApp webhook body, processed by src/whatsapp/inbound.ts. */
  whatsappWebhook: "whatsapp-webhook",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const QUEUE_OPTIONS = {
  // Retry a failed job 5 times, waiting 10 s, 20 s, 40 s… between tries.
  retryLimit: 5,
  retryDelay: 10,
  retryBackoff: true,
  // Keep finished jobs for 7 days, for debugging.
  deleteAfterSeconds: 7 * 24 * 60 * 60,
};

/** Creates pg-boss with the app's database. `worker` turns on maintenance. */
export function createBoss(options: { worker: boolean }): PgBoss {
  const boss = new PgBoss({
    connectionString: env().DATABASE_URL,
    max: options.worker ? 10 : 3,
    supervise: options.worker,
    schedule: options.worker,
  });
  boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
  return boss;
}

export async function ensureQueues(boss: PgBoss) {
  for (const name of Object.values(QUEUES)) {
    if (!(await boss.getQueue(name))) await boss.createQueue(name, QUEUE_OPTIONS);
  }
}

const globalForBoss = globalThis as unknown as { __dealerreplyBoss?: Promise<PgBoss> };

/** The web process's shared pg-boss instance, started on first use. */
function getProducer(): Promise<PgBoss> {
  globalForBoss.__dealerreplyBoss ??= (async () => {
    const boss = createBoss({ worker: false });
    await boss.start();
    await ensureQueues(boss);
    return boss;
  })().catch((err: unknown) => {
    globalForBoss.__dealerreplyBoss = undefined;
    throw err;
  });
  return globalForBoss.__dealerreplyBoss;
}

/** Adds a job. Throws if the queue is unreachable, so callers can fail loudly. */
export async function enqueue(name: QueueName, data: object): Promise<string | null> {
  const boss = await getProducer();
  return boss.send(name, data);
}
