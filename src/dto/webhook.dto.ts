import { TransactionStatus } from "../../generated/prisma";
export interface RegisterWebhookDto {
  url: string;
}

export interface subscribeToEventDto {
  event: string;
}

export interface RetrieveWebhookDeliveries {
  status: TransactionStatus,
  transactionId: string,
  event: EventType,
  date: {
    startDate: string,
    endDate: string
  }
  limit: number
}

export type EventType = "payment.success" | "payment.failed"

export type WebhookPayload = {
  event: EventType,
  data: {
    transactionId: string,
    amount: number,
    currency: string,
    status: string,
    occuredAt: string
  }
}
