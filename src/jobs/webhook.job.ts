import { Worker } from "bullmq";
import { triggerWebhook } from "@/services/user/webhook.service";
import logger from "@/utils/logger";
import { redisConnection } from "@/config/redis-config";

export const startWebhookWorker = () => {
  new Worker(
    "webhook-queue",
    async (job) => {
      if (job.name !== "process-webhook-event") return;

      const { profileId, payload } = job.data;

      try {
        await triggerWebhook(profileId, payload);
        logger.info(
          `Webhook (${payload.event}) delivered to merchant (${profileId})`
        );
      } catch (error: any) {
        const statusCode = error?.response?.status;

        logger.error(
          `Webhook (${payload.event}) failed for merchant (${profileId})`
        );

        if (statusCode && statusCode >= 400 && statusCode < 500) {
          return; // no retry
        }

        throw error; // BullMQ retry
      }
    },
    {
      connection: redisConnection,
      concurrency: 5
    }
  );

  logger.info("🔔 Webhook Worker started");
};
