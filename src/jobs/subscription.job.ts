import { Worker } from "bullmq";
import Container from "typedi";
import logger from "@/utils/logger";
import { redisConnection } from "@/config/redis-config";
import db from "@/config/db-config";
import { EmailQueue } from "@/services/schedule.email.service";
import { WalletService } from "@/services/wallet.service";
import { PaymentMethod, SubscriptionStatus } from "../../generated/prisma";
import { redisClient as redis, redisClient } from "@/middlewares/rate-limit.middleware";
import { triggerWebhook } from "@/services/user/webhook.service";
import { PaymentRepository } from "@/repositories/payment.repository";

const DAY_MS = 1000 * 60 * 60 * 24;

function startOfUtcDay(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date) {
    const end = startOfUtcDay(date);
    end.setUTCDate(end.getUTCDate() + 1);
    end.setUTCMilliseconds(-1);
    return end;
}

function addUtcDays(date: Date, days: number) {
    return new Date(date.getTime() + days * DAY_MS);
}

function dayKey(date: Date) {
    return date.toISOString().slice(0, 10);
}

async function acquireLock(key: string, ttlSeconds: number) {
    const result = await redis.set(
        key,
        "1",
        "EX",
        ttlSeconds
    );

    return result === "OK";
}

export const startSubscriptionWorker = () => {
    const paymentRepository = Container.get(PaymentRepository)
    const emailQueue = Container.get(EmailQueue);
    const walletService = Container.get(WalletService);

    new Worker(
        "transaction-queue",
        async (job) => {
            if (job.name !== "process-subscription-renewals") {
                return;
            }

            const now = new Date();
            const reminderTarget = addUtcDays(now, 3);
            const expiryTarget = now;
            const cancellationTarget = addUtcDays(now, -2);

            const reminderWindow = {
                gte: startOfUtcDay(reminderTarget),
                lte: endOfUtcDay(reminderTarget),
            };

            const expiryWindow = {
                gte: startOfUtcDay(expiryTarget),
                lte: endOfUtcDay(expiryTarget),
            };

            const cancellationWindow = {
                gte: startOfUtcDay(cancellationTarget),
                lte: endOfUtcDay(cancellationTarget),
            };

            try {
                const reminderSubscriptions = await db.subscription.findMany({
                    where: {
                        status: SubscriptionStatus.ACTIVE,
                        endsAt: reminderWindow,
                    },
                });

                for (const subscription of reminderSubscriptions) {
                    const dedupeKey = `subscription:reminder:${subscription.id}:${dayKey(subscription.endsAt ?? now)}`;
                    const lock = await acquireLock(dedupeKey, Math.floor((DAY_MS * 10) / 1000));
                    if (!lock) continue;

                    const context = await db.subscription.findFirst({
                        where: {
                            status: SubscriptionStatus.ACTIVE,
                            endsAt: reminderWindow,
                        },
                        include: {
                            customer: true,
                            plan: {
                                include: {
                                    profile: true,
                                },
                            },
                        },
                    });
                    if (!context) continue;

                    let renewalTransaction = await paymentRepository.findSubscriptionPaymentBySubscriptionId(subscription.id);
                    if (!renewalTransaction) {
                        const amountToPay = await walletService.convertBetweenCurrencyAndUSDT(
                            context.plan.amount,
                            context.plan.currency,
                            "to_USDT"
                        );

                        renewalTransaction = await paymentRepository.createPayment(
                            context.plan.amount,
                            amountToPay,
                            context.plan.currency,
                            context.network,
                            context.customer,
                            "",
                            context.plan.profile.id,
                            context.mode,
                            {
                                paymentMethod: PaymentMethod.SUBSCRIPTION,
                                subscriptionId: context.id
                            }
                        );
                        await redisClient.set(
                            renewalTransaction.id,
                            JSON.stringify({
                                amount: context.plan.amount,
                                amountInUSDC: amountToPay,
                                businessName: context.plan.profile.businessName,
                                redirectUrl: "",
                                mode: context.mode,
                                currency: context.plan.currency,
                                network: context.network,
                            }),
                            "EX",
                            5 * 24 * 60 * 60
                        );

                        try {
                            await triggerWebhook(context.plan.profile.id, {
                                event: "payment.create",
                                data: {
                                    transactionId: renewalTransaction.id,
                                    amount: context.plan.amount,
                                    currency: context.plan.currency,
                                    status: "created",
                                    occuredAt: new Date().toISOString(),
                                },
                            });
                        } catch {
                            // Webhook delivery should not block the renewal workflow.
                        }
                    }

                    const reminderPayload: any = {
                        email: context.customer.email,
                        customerName: `${context.customer.firstname} ${context.customer.lastname}`,
                        merchantName: context.plan.profile.businessName,
                        planName: context.plan.name,
                        duration: String(context.plan.duration),
                        amount: context.plan.amount,
                        currency: context.plan.currency,
                        daysLeft: 3,
                        checkoutUrl: `https://checkout.orafi.app/${renewalTransaction.id}`,
                        expiresAt: context.endsAt?.toISOString() ?? "",
                    };

                    await emailQueue.addSubscriptionReminderScheduler(reminderPayload);
                }

                const expirySubscriptions = await db.subscription.findMany({
                    where: {
                        status: SubscriptionStatus.ACTIVE,
                        endsAt: expiryWindow,
                    },
                });

                for (const subscription of expirySubscriptions) {
                    const dedupeKey = `subscription:expiry:${subscription.id}:${dayKey(subscription.endsAt ?? now)}`;
                    const lock = await acquireLock(dedupeKey, Math.floor((DAY_MS * 10) / 1000));
                    if (!lock) continue;

                    const context = await db.subscription.findFirst({
                        where: {
                            status: SubscriptionStatus.ACTIVE,
                            endsAt: reminderWindow,
                        },
                        include: {
                            customer: true,
                            plan: {
                                include: {
                                    profile: true,
                                },
                            },
                        },
                    });
                    if (!context) continue;

                    let renewalTransaction = (await paymentRepository.findSubscriptionPaymentBySubscriptionId(subscription.id)) as { id: string } | null;
                    if (!renewalTransaction) {
                        const amountToPay = await walletService.convertBetweenCurrencyAndUSDT(
                            context.plan.amount,
                            context.plan.currency,
                            "to_USDT"
                        );

                        renewalTransaction = (await paymentRepository.createPayment(
                            context.plan.amount,
                            amountToPay,
                            context.plan.currency,
                            context.network,
                            context.customer,
                            "",
                            context.plan.profile.id,
                            context.mode,
                            {
                                paymentMethod: PaymentMethod.SUBSCRIPTION,
                                subscriptionId: context.id
                            }
                        )) as { id: string };

                        await redisClient.set(
                            renewalTransaction.id,
                            JSON.stringify({
                                amount: context.plan.amount,
                                amountInUSDC: amountToPay,
                                businessName: context.plan.profile.businessName,
                                redirectUrl: "",
                                mode: context.mode,
                                currency: context.plan.currency,
                                network: context.network,
                            }),
                            "EX",
                            2 * 24 * 60 * 60
                        );
                    }

                    const expiredPayload: any = {
                        email: context.customer.email,
                        customerName: `${context.customer.firstname} ${context.customer.lastname}`,
                        merchantName: context.plan.profile.businessName,
                        planName: context.plan.name,
                        duration: String(context.plan.duration),
                        checkoutUrl: `https://checkout.orafi.app/${renewalTransaction.id}`,
                        expiresAt: context.endsAt?.toISOString() ?? "",
                    };

                    await emailQueue.addSubscriptionExpiredScheduler(expiredPayload);
                }

                const cancellationSubscriptions = await db.subscription.findMany({
                    where: {
                        status: SubscriptionStatus.ACTIVE,
                        endsAt: cancellationWindow,
                    },
                });

                for (const subscription of cancellationSubscriptions) {
                    const dedupeKey = `subscription:cancel:${subscription.id}:${dayKey(subscription.endsAt ?? now)}`;
                    const lock = await acquireLock(dedupeKey, Math.floor((DAY_MS * 10) / 1000));
                    if (!lock) continue;

                    const context = await db.subscription.findFirst({
                        where: {
                            status: SubscriptionStatus.ACTIVE,
                            endsAt: reminderWindow,
                        },
                        include: {
                            customer: true,
                            plan: {
                                include: {
                                    profile: true,
                                },
                            },
                        },
                    });
                    if (!context) continue;

                    await db.subscription.update({
                        where: { id: context.id },
                        data: {
                            status: "CANCELLED" as any,
                            canceledAt: new Date(),
                        },
                    });

                    try {
                        await triggerWebhook(context.plan.profile.id, {
                            event: "subscription.disable",
                            data: {
                                transactionId: context.id,
                                amount: context.plan.amount,
                                currency: context.plan.currency,
                                status: "disabled",
                                occuredAt: new Date().toISOString(),
                            },
                        });
                    } catch {
                        // Webhook delivery should not block cancellation.
                    }

                    const cancelledPayload: any = {
                        email: context.customer.email,
                        customerName: `${context.customer.firstname} ${context.customer.lastname}`,
                        merchantName: context.plan.profile.businessName,
                        planName: context.plan.name,
                        duration: String(context.plan.duration),
                        cancelledAt: new Date().toISOString(),
                    };

                    if (context.endsAt) {
                        cancelledPayload.expiresAt = context.endsAt.toISOString();
                    }

                    await emailQueue.addSubscriptionCancelledScheduler(cancelledPayload);
                }
            } catch (error) {
                logger.error(`Subscription worker error: ${error}`);
                throw error;
            }
        },
        { connection: redisConnection }
    );

    logger.info("🔁 Subscription renewal worker started");
};
