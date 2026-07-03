import { TransactionStatus } from "@/generated/prisma/client";

export interface RegisterWebhookDto {
  url: string;
}

export interface subscribeToEventDto {
  event: string;
}

export interface RetrieveWebhookDeliveries {
  status: TransactionStatus,
  subscriptionId: string;
  transactionId: string,
  event: EventType,
  date: {
    startDate: string,
    endDate: string
  }
  limit: number
}

export type EventType =
  | "payment.success"
  | "payment.failed"
  | "payment.create"
  | "subscription.create"
  | "subscription.active"
  | "subscription.abandoned"
  | "subscription.not_renew"
  | "subscription.disable";

export type WebhookPayload = {
  event: EventType;
  data:
    | {
        $kind: "payment";
        transactionId: string;
        amount: number;
        currency: string;
        status: string;
        occurredAt: string;
      }
    | {
        $kind: "subscription";
        subscriptionId: string;
        transactionId?: string;
        status: string;
        occurredAt: string;
      };
};
