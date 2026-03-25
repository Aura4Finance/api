import { STATUS } from "@/constants/status.constant";
import { WebhookRepository } from "@/repositories/user/webhook.repository";
import { APIError } from "@/utils/error-handler";
import { Service } from "typedi";
import crypto from "crypto";
import { RetrieveWebhookDeliveries, WebhookPayload } from "@/dto/webhook.dto";
import axios from "axios";
import Container from "typedi";
import { WebhookDeliveryRepository } from "@/repositories/webhookDelivery.repository";

@Service()
export class WebhookService {
  constructor(
    private readonly webhookRepository: WebhookRepository,
    private readonly webhookDeliveryRepository: WebhookDeliveryRepository
  ) { }

  async registerWebhook(url: string, profileId: string) {
    const existingWebhook = await this.webhookRepository.findWebhookByProfileId(
      profileId
    );

    if (!existingWebhook) {
      const secret = `whsec_${crypto.randomBytes(32).toString("hex")}`
      const result = await this.webhookRepository.createWebhook(profileId, secret, url);

      return {
        message: "Webhook registered successfully",
        payload: result,
      };
    }

    const result = await this.webhookRepository.updateWebhook(profileId, url);

    return {
      message: "Webhook updated successfully",
      payload: result,
    };
  }

  async getWebhookDetails(profileId: string) {
    const webhook = await this.webhookRepository.findWebhookByProfileId(
      profileId
    );

    return {
      message: "Webhook retrieved successfully",
      payload: webhook ? { ...webhook, secret: "***" } : webhook,
    };
  }

  async addEventToWebhook(profileId: string, event: string) {
    const webhook = await this.webhookRepository.findWebhookByProfileId(profileId);

    if (!webhook) {
      throw new APIError("No webhook to subscribe to", STATUS.notFound);
    }

    await this.webhookRepository.addEventToWebhook(event, webhook.id);

    return {
      message: "Subscribed to event successfully",
      payload: null,
    };
  }

  async getWebhookDeliveries(query: RetrieveWebhookDeliveries, profileId?: string) {
    let deliveries;
    if(profileId){
      const webhook = await this.webhookRepository.findWebhookByProfileId(profileId);
      deliveries = await this.webhookDeliveryRepository.getDeliveryRecord(query, webhook?.id);
    }else {
      deliveries = await this.webhookDeliveryRepository.getDeliveryRecord(query);
    }
  
    return {
      message: "Wehook deliveries retrieved successfully!",
      payload: deliveries
    }
  }

}

//triggered by a job
export async function triggerWebhook(profileId: string, payload: WebhookPayload) {
  const webhookRepository = Container.get(WebhookRepository);
  const webhookDeliveryRepository = Container.get(WebhookDeliveryRepository)
  const webhook = await webhookRepository.findWebhookByProfileId(profileId);
  if (!webhook || !webhook?.events.includes(payload.event)) return;

  let webhookDelivery = await webhookDeliveryRepository.findDeliveryRecordByTransactionIdEventTypeAndWebhookId(webhook.id, payload.data.transactionId, payload.event);
  if (!webhookDelivery) {
    webhookDelivery = await webhookDeliveryRepository.createDeliveryRecord(webhook.id, payload);
  }
  if(webhookDelivery?.status == "COMPLETED") return;
  const signature = crypto
    .createHmac("sha256", webhook.secret)
    .update(JSON.stringify(payload.data))
    .digest("hex");

  try {
    await axios.post(webhook.url, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Orafi-Signature": `sha256=${signature}`
      },
      timeout: 5000
    })
    await webhookDeliveryRepository.markDeliverySuccess(webhookDelivery.id);
  } catch (error: any) {
    await webhookDeliveryRepository.markDeliveryFailed(webhookDelivery.id, error.code);
    throw new APIError(`Error sending webhook: ${error.message}`, STATUS.bad);
  }
}
