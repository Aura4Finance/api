import db from "@/config/db-config";
import { EventType, RetrieveWebhookDeliveries, WebhookPayload } from "@/dto/webhook.dto";
import { Service } from "typedi";

@Service()
export class WebhookDeliveryRepository {
    async createDeliveryRecord(
        webhookId: string,
        payload: WebhookPayload,
    ) {
        return await db.webhookDelivery.create({
            data: {
                webhook: {
                    connect: {
                        id: webhookId
                    }
                },
                transaction: {
                    connect: {
                        id: payload.data.transactionId
                    }
                },
                payload,
                status: "PENDING",
                attemptCount: 0,
                event: payload.event
            }
        });
    }

    async markDeliverySuccess(
        deliveryId: string,
    ) {
        return await db.webhookDelivery.update({
            where: {
                id: deliveryId
            },
            data: {
                status: "COMPLETED",
                lastAttemptAt: new Date(),
                responseStatus: "200",
                attemptCount: { increment: 1 }
            }
        });
    }

    async markDeliveryFailed(
        deliveryId: string,
        responseStatus: string,
    ) {
        return await db.webhookDelivery.update({
            where: {
                id: deliveryId
            },
            data: {
                status: "FAILED",
                lastAttemptAt: new Date(),
                responseStatus,
                attemptCount: { increment: 1 },
            }
        });
    }

    async findDeliveryRecordByTransactionIdEventTypeAndWebhookId(
        webhookId: string,
        transactionId: string,
        event: EventType,
    ){
        return await db.webhookDelivery.findFirst({
            where: {
                transactionId,
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
            date
        } = query;

        const where: any = {};
        if(webhookId) where.webhookId = webhookId;
        if(status) where.status = status;
        if(event) where.event = event
        if(transactionId)  where.transactionId = transactionId;

        if(date) {
            where.createdAt = {
                gte: new Date(date.startDate),
                lte:  new Date(date.endDate)
            }
        }

        return await db.webhookDelivery.findMany({
            where,
            orderBy: {
                createdAt: "desc"
            }
        },
    )
    }
}