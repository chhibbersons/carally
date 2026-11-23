import { logger } from "@/lib/logger";

/**
 * Background worker (pg-boss). Follow-ups, reminders and reports are added in
 * MVP steps 7 and 8; pg-boss is installed then.
 */
logger.info("worker: no jobs registered yet, exiting");
