import { Worker } from "bullmq";
import { triggerWebhook } from "@/services/user/webhook.service";
import logger from "@/utils/logger";
import { redisConnection } from "@/config/redis-config";
import { webhookDlqQueue } from "@/queues/webhook-dlq.queue";
import {
  HttpRequestError,
  isHttpRequestError,
  toHttpRequestError,
} from "@/utils/http-client";
import { getRetryDelayMs, isRetryableError } from "@/utils/retry-strategy";

export const startWebhookWorker = () => {
  new Worker(
    "webhook-queue",
    async (job) => {
      if (job.name !== "process-webhook-event") return;

      const { profileId, payload } = job.data;
      const attemptsMade = job.attemptsMade + 1;
      const maxAttempts = job.opts.attempts ?? 1;

      try {
        const result = await triggerWebhook(profileId, payload, {
          attempt: attemptsMade,
          maxAttempts,
        });

        if (!result) return;

        logger.info("Webhook delivered", {
          webhookId: result.webhookId,
          deliveryId: result.deliveryId,
          targetUrl: result.url,
          attempt: attemptsMade,
          status: result.status,
          latencyMs: result.latencyMs,
        });
      } catch (error: unknown) {
        const normalizedError = toHttpRequestError(error);
        const retryable = isRetryableError(normalizedError);
        const delayMs = retryable
          ? getRetryDelayMs(attemptsMade, normalizedError)
          : undefined;

        const context = (normalizedError.context ?? {}) as {
          webhookId?: string;
          deliveryId?: string;
          event?: string;
          transactionId?: string;
          url?: string;
          requestHeaders?: Record<string, string>;
        };

        logger.error("Webhook delivery failed", {
          webhookId: context.webhookId,
          deliveryId: context.deliveryId,
          event: context.event,
          transactionId: context.transactionId,
          targetUrl: context.url,
          attempt: attemptsMade,
          status: normalizedError.status,
          code: normalizedError.code,
          message: normalizedError.message,
          retryable,
        });

        if (!retryable) {
          return;
        }

        if (attemptsMade >= maxAttempts) {
          await webhookDlqQueue.add(
            "webhook-dead-letter",
            {
              profileId,
              payload,
              attemptsMade,
              maxAttempts,
              webhook: {
                id: context.webhookId,
                url: context.url,
              },
              deliveryId: context.deliveryId,
              requestHeaders: context.requestHeaders,
              error: {
                message: normalizedError.message,
                status: normalizedError.status,
                code: normalizedError.code,
                retryAfterMs: normalizedError.retryAfterMs,
                responseHeaders: normalizedError.responseHeaders,
                responseData: normalizedError.responseData,
              },
            },
            {
              removeOnComplete: true,
              removeOnFail: false,
            }
          );

          throw normalizedError;
        }

        logger.warn("Webhook retry scheduled", {
          attempt: attemptsMade,
          maxAttempts,
          delayMs,
        });

        throw normalizedError;
      }
    },
    {
      connection: redisConnection,
      concurrency: 5,
      settings: {
        backoffStrategy: (
          attemptsMade: number,
          _type: string | undefined,
          err: Error | null | undefined
        ) => {
          if (!err) return 0;
          const normalized = isHttpRequestError(err)
            ? err
            : toHttpRequestError(err);
          return getRetryDelayMs(attemptsMade, normalized as HttpRequestError);
        },
      },
    }
  );

  logger.info("🔔 Webhook Worker started");
};
