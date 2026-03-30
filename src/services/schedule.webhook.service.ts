import { WebhookPayload } from "@/dto/webhook.dto";
import { webhookQueue } from "@/queues/webhook.queue";
import { Service } from "typedi";

@Service()
export class WebhookQueue {
  async addScheduler(profileId: string, payload: WebhookPayload) {
    await webhookQueue.add(
      "process-webhook-event",
      {
        profileId,
        payload,
      },
      {
        attempts: 7,
        backoff: {
          type: "exponential",
          delay: 60_000, // 1 minute
        },
        removeOnComplete: true,
        removeOnFail: true,
      }
    );
  }
}