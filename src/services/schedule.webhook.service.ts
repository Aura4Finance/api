import { WebhookPayload } from "@/dto/webhook.dto";
import { webhookQueue, jobs } from "@/queues/webhook.queue";
import { Service } from "typedi";

@Service()
export class WebhookQueue {
  async addScheduler(profileId: string, payload: WebhookPayload) {
    await webhookQueue.add(
      jobs.TRIGGER,
      {
        profileId,
        payload,
      },
      {
        attempts: 7,
        backoff: {
          type: "webhook",
          delay: 2000,
        },
        jobId: `webhook-${profileId}-${payload.event}-${payload.data.transactionId}`,
        removeOnComplete: true,
        removeOnFail: true,
      }
    );
  }
}