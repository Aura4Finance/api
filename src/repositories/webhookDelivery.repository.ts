import db from "@/config/db-config";
import { EventType, RetrieveWebhookDeliveries, WebhookPayload } from "@/dto/webhook.dto";
import { Service } from "typedi";

@Service()
export class WebhookDeliveryRepository {

    async createDeliveryRecord(
        webhookId: string,
        payload: WebhookPayload,
    ) {
        let data: any = {
            webhook: {
                connect: {
                    id: webhookId
                }
            },
            payload,
            status: "PENDING",
            attemptCount: 0,
            event: payload.event
        }

        if (payload.data.$kind === "subscription") {
            data.subscription.connect.id = payload.data.subscriptionId
        } else {
            data.transaction.connect.id = payload.data.transactionId
        }

        return await db.webhookDelivery.create({ data });
    }

    async markDeliverySuccess(
        deliveryId: string,
        responseStatus: string,
    ) {
        return await db.webhookDelivery.update({
            where: {
                id: deliveryId
            },
            data: {
                status: "COMPLETED",
                lastAttemptAt: new Date(),
                responseStatus,
                attemptCount: { increment: 1 },
                nextRetryAt: null,
            }
        });
    }

    async markDeliveryFailed(
        deliveryId: string,
        responseStatus: string | undefined,
        nextRetryAt?: Date,
    ) {
        return await db.webhookDelivery.update({
            where: {
                id: deliveryId
            },
            data: {
                status: "FAILED",
                lastAttemptAt: new Date(),
                responseStatus: responseStatus ?? null,
                attemptCount: { increment: 1 },
                nextRetryAt: nextRetryAt ?? null,
            }
        });
    }

    async findDeliveryRecordByTransactionIdEventTypeAndWebhookId(
        webhookId: string,
        event: EventType,
        transactionIdOrSubscriptionId: string,
    ) {
        return await db.webhookDelivery.findFirst({
            where: {
                OR: [
                    {
                        transactionId: transactionIdOrSubscriptionId
                    },
                    {
                        subscriptionId: transactionIdOrSubscriptionId
                    }

                ],
                webhookId,
                event
            }
        })
    }

    async getDeliveryRecord(
        query: RetrieveWebhookDeliveries,
        webhookId?: string
    ) {
        const {
            status,
            event,
            transactionId,
            subscriptionId,
            date,
            limit
        } = query;

        const where: any = {};
        if (webhookId) where.webhookId = webhookId;
        if (status) where.status = status;
        if (event) where.event = event
        if (transactionId) where.transactionId = transactionId;
        if (subscriptionId) where.subscriptionId = subscriptionId;

        if (date) {
            where.createdAt = {
                gte: new Date(date.startDate),
                lte: new Date(date.endDate)
            }
        }

        return await db.webhookDelivery.findMany({
            where,
            take: limit || 100,
            orderBy: {
                createdAt: "desc"
            }
        },
        )
    }
}