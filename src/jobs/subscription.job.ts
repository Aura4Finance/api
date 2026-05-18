import { Worker } from "bullmq";
import Container from "typedi";
import logger from "@/utils/logger";
import { redisConnection } from "@/config/redis-config";
import db from "@/config/db-config";
import { EmailQueue } from "@/services/schedule.email.service";
import { WalletService } from "@/services/wallet.service";
import { PaymentMethod, SubscriptionStatus, SubscriptionDuration } from "../../generated/prisma";
import { redisClient as redis, redisClient } from "@/middlewares/rate-limit.middleware";
import { triggerWebhook } from "@/services/user/webhook.service";
import { PaymentRepository } from "@/repositories/payment.repository";

const DAY_MS = 1000 * 60 * 60 * 24;
const SUBSCRIPTION_EXPIRY_SECONDS: Record<SubscriptionDuration, number> = {
    [SubscriptionDuration.WEEKLY]: 7 * 24 * 60 * 60,   // 7 days
    [SubscriptionDuration.MONTHLY]: 5 * 24 * 60 * 60,   // 5 days
    [SubscriptionDuration.SIX_MONTHS]: 14 * 24 * 60 * 60,  // 14 days
    [SubscriptionDuration.YEARLY]: 30 * 24 * 60 * 60,  // 30 days
};

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

function getCheckoutUrl(transactionId: string) {
    return process.env.ORAFI_SUBSCRIPTION_CHECKOUT_URL
        ? `${process.env.ORAFI_SUBSCRIPTION_CHECKOUT_URL}/${transactionId}`
        : undefined;
}

async function acquireLock(key: string, ttlSeconds: number) {
    const acquired = await (redis as any).setnx(key, "1");
    if (!acquired) {
        return false;
    }

    await (redis as any).expire(key, ttlSeconds);
    return true;
}

async function resolveSubscriptionContext(subscriptionId: string) {
    const subscription = await db.subscription.findUnique({
        where: { id: subscriptionId },
    });

    if (!subscription) {
        return null;
    }

    const plan = await db.subscriptionPlan.findUnique({
        where: { id: subscription.planId },
    });

    if (!plan) {
        return null;
    }

    const customer = await db.customer.findUnique({
        where: { id: subscription.customerId },
    });

    if (!customer) {
        return null;
    }

    const profile = await db.businessProfile.findUnique({
        where: { id: plan.profileId },
    });

    if (!profile) {
        return null;
    }

    return { subscription, plan, customer, profile };
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

                    const context = await resolveSubscriptionContext(subscription.id);
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
                            context.subscription.network,
                            context.customer,
                            "",
                            context.profile.id,
                            context.subscription.mode,
                            {
                                paymentMethod: PaymentMethod.SUBSCRIPTION,
                                subscriptionId: context.subscription.id
                            }
                        );
                        const expirySeconds: number = SUBSCRIPTION_EXPIRY_SECONDS[context.plan.duration] ?? 6000;

                        await redisClient.set(
                            renewalTransaction.id,
                            JSON.stringify({
                                amount: context.plan.amount,
                                amountInUSDC: amountToPay,
                                businessName: context.profile.businessName,
                                redirectUrl: "",
                                mode: context.subscription.mode,
                                currency: context.plan.currency,
                                network: context.subscription.network,
                            }),
                            "EX",
                            expirySeconds
                        );

                        try {
                            await triggerWebhook(context.profile.id, {
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

                    const checkoutUrl = getCheckoutUrl(renewalTransaction.id);

                    const reminderPayload: any = {
                        email: context.customer.email,
                        customerName: `${context.customer.firstname} ${context.customer.lastname}`,
                        merchantName: context.profile.businessName,
                        planName: context.plan.name,
                        duration: String(context.plan.duration),
                        amount: context.plan.amount,
                        currency: context.plan.currency,
                        daysLeft: 3,
                        expiresAt: context.subscription.endsAt?.toISOString() ?? "",
                    };

                    if (checkoutUrl) {
                        reminderPayload.checkoutUrl = checkoutUrl;
                    }

                    await emailQueue.addSubscriptionReminderScheduler(reminderPayload);

                    try {
                        await triggerWebhook(context.profile.id, {
                            event: "subscription.not_renew",
                            data: {
                                transactionId: context.subscription.id,
                                amount: context.plan.amount,
                                currency: context.plan.currency,
                                status: "pending_renewal",
                                occuredAt: new Date().toISOString(),
                            },
                        });
                    } catch {
                        // Webhook delivery should not block the renewal workflow.
                    }
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

                    const context = await resolveSubscriptionContext(subscription.id);
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
                            context.subscription.network,
                            context.customer,
                            "",
                            context.profile.id,
                            context.subscription.mode,
                            {
                                paymentMethod: PaymentMethod.SUBSCRIPTION,
                                subscriptionId: context.subscription.id
                            }
                        )) as { id: string };

                        const expirySeconds: number = SUBSCRIPTION_EXPIRY_SECONDS[context.plan.duration] ?? 6000;

                        await redisClient.set(
                            renewalTransaction.id,
                            JSON.stringify({
                                amount: context.plan.amount,
                                amountInUSDC: amountToPay,
                                businessName: context.profile.businessName,
                                redirectUrl: "",
                                mode: context.subscription.mode,
                                currency: context.plan.currency,
                                network: context.subscription.network,
                            }),
                            "EX",
                            expirySeconds
                        );
                    }

                    const checkoutUrl = getCheckoutUrl(renewalTransaction.id);

                    const expiredPayload: any = {
                        email: context.customer.email,
                        customerName: `${context.customer.firstname} ${context.customer.lastname}`,
                        merchantName: context.profile.businessName,
                        planName: context.plan.name,
                        duration: String(context.plan.duration),
                        expiresAt: context.subscription.endsAt?.toISOString() ?? "",
                    };

                    if (checkoutUrl) {
                        expiredPayload.checkoutUrl = checkoutUrl;
                    }

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

                    const context = await resolveSubscriptionContext(subscription.id);
                    if (!context) continue;

                    await db.subscription.update({
                        where: { id: context.subscription.id },
                        data: {
                            status: "CANCELLED" as any,
                            canceledAt: new Date(),
                        },
                    });

                    try {
                        await triggerWebhook(context.profile.id, {
                            event: "subscription.disable",
                            data: {
                                transactionId: context.subscription.id,
                                amount: context.plan.amount,
                                currency: context.plan.currency,
                                status: "cancelled",
                                occuredAt: new Date().toISOString(),
                            },
                        });
                    } catch {
                        // Webhook delivery should not block cancellation.
                    }

                    const cancelledPayload: any = {
                        email: context.customer.email,
                        customerName: `${context.customer.firstname} ${context.customer.lastname}`,
                        merchantName: context.profile.businessName,
                        planName: context.plan.name,
                        duration: String(context.plan.duration),
                        cancelledAt: new Date().toISOString(),
                    };

                    if (context.subscription.endsAt) {
                        cancelledPayload.expiresAt = context.subscription.endsAt.toISOString();
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
