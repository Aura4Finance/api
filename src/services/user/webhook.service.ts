import { STATUS } from "@/constants/status.constant";
import { WebhookRepository } from "@/repositories/user/webhook.repository";
import { APIError } from "@/utils/error-handler";
import { Service } from "typedi";
import crypto from "crypto";
import { RetrieveWebhookDeliveries, WebhookPayload } from "@/dto/webhook.dto";
import axios from "axios";
import { Container } from "typedi";
import { WebhookDeliveryRepository } from "@/repositories/webhookDelivery.repository";
import {
  HttpRequestError,
  sendHttpRequest,
  toHttpRequestError,
} from "@/utils/http-client";
import { getLimiterForUrl } from "@/utils/rate-limiter";
import { getNextRetryAt, isRetryableError } from "@/utils/retry-strategy";

@Service()
export class WebhookService {
  constructor(
    private readonly webhookRepository: WebhookRepository,
    private readonly webhookDeliveryRepository: WebhookDeliveryRepository
  ) { }

  async registerWebhook(url: string, profileId: string) {
    const existingWebhook = await this.webhookRepository.findWebhookByProfileId(profileId);

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
      throw new APIError("Webhook not found for this profile.", STATUS.notFound);
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
type TriggerWebhookOptions = {
  attempt?: number;
  maxAttempts?: number;
};

type TriggerWebhookResult = {
  webhookId: string;
  deliveryId: string;
  url: string;
  status: number;
  latencyMs: number;
};

export async function triggerWebhook(
  profileId: string,
  payload: WebhookPayload,
  options: TriggerWebhookOptions = {}
): Promise<TriggerWebhookResult | null> {
  const webhookRepository = Container.get(WebhookRepository);
  const webhookDeliveryRepository = Container.get(WebhookDeliveryRepository)
  const webhook = await webhookRepository.findWebhookByProfileId(profileId);
  if (!webhook || !webhook?.events.includes(payload.event)) return null;

  let webhookDelivery = await webhookDeliveryRepository.findDeliveryRecordByTransactionIdEventTypeAndWebhookId(webhook.id, payload.data.transactionId, payload.event);
  if (!webhookDelivery) {
    webhookDelivery = await webhookDeliveryRepository.createDeliveryRecord(webhook.id, payload);
  }
  if(webhookDelivery?.status == "COMPLETED") return null;
  const signature = crypto
    .createHmac("sha256", webhook.secret)
    .update(JSON.stringify(payload.data))
    .digest("hex");

  const requestHeaders = {
    "Content-Type": "application/json",
    "X-Orafi-Signature": `sha256=${signature}`,
    "Idempotency-Key": webhookDelivery.id,
    "X-Orafi-Event-Id": webhookDelivery.id,
  };

  try {
    const { response, latencyMs } = await sendHttpRequest(axios, {
      method: "POST",
      url: webhook.url,
      data: payload,
      headers: requestHeaders,
      timeout: 8000,
    }, {
      limiter: getLimiterForUrl(webhook.url),
    });

    await webhookDeliveryRepository.markDeliverySuccess(
      webhookDelivery.id,
      String(response.status)
    );

    return {
      webhookId: webhook.id,
      deliveryId: webhookDelivery.id,
      url: webhook.url,
      status: response.status,
      latencyMs,
    };
  } catch (error: unknown) {
    const normalizedError: HttpRequestError = toHttpRequestError(error);
    const attemptsMade = options.attempt ?? 1;
    const maxAttempts = options.maxAttempts ?? 1;
    const shouldRetry = isRetryableError(normalizedError) && attemptsMade < maxAttempts;
    const nextRetryAt = shouldRetry
      ? getNextRetryAt(attemptsMade, normalizedError)
      : undefined;

    normalizedError.context = {
      webhookId: webhook.id,
      deliveryId: webhookDelivery.id,
      url: webhook.url,
      event: payload.event,
      transactionId: payload.data.transactionId,
      requestHeaders,
    };

    await webhookDeliveryRepository.markDeliveryFailed(
      webhookDelivery.id,
      normalizedError.status ? String(normalizedError.status) : normalizedError.code,
      nextRetryAt
    );

    throw normalizedError;
  }
}
