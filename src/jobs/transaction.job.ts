import { Worker } from "bullmq";
import pLimit from "p-limit";
import db from "@/config/db-config";
import { TransactionStatus } from "../../generated/prisma";
import logger from "@/utils/logger";
import { PaymentService } from "@/services/payment.service";
import Container from "typedi";
import { redisClient } from "@/config/redis-config";
import { WalletService } from "@/services/wallet.service";
import { EmailQueue } from "@/services/schedule.email.service";
import { SubscriptionStatus, SubscriptionDuration } from "../../generated/prisma";
import { jobs, TRANSACTION_WORKER } from "@/queues/transaction.queue";
import { WebhookQueue } from "@/services/schedule.webhook.service";

const EXPIRY_CONFIG = {
  concurrencyLimit: 10,
} as const;

interface BatchStats {
  phase: "expiry";
  attempted: number;
  skipped: number;
  succeeded: number;
  failed: number;
}

function logStats(stats: BatchStats): void {
  logger.info(
    `[transaction-worker] phase=${stats.phase} ` +
      `attempted=${stats.attempted} skipped=${stats.skipped} ` +
      `succeeded=${stats.succeeded} failed=${stats.failed}`
  );
}

async function processExpiredPendingTransactions(paymentService: PaymentService): Promise<BatchStats> {
  const stats: BatchStats = { phase: "expiry", attempted: 0, skipped: 0, succeeded: 0, failed: 0 };
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const pending = await db.transaction.findMany({
    where: {
      status: TransactionStatus.PENDING,
      createdAt: { lte: cutoff },
    },
    select: { id: true },
  });

  const limit = pLimit(EXPIRY_CONFIG.concurrencyLimit);

  await Promise.all(
    pending.map((tx) =>
      limit(async () => {
        stats.attempted++;

        try {
          // Try verifyPayment first; the service is responsible for the successful-path update.
          await paymentService.verifyPayment({ paymentId: tx.id });
          stats.succeeded++;
        } catch (error) {
          try {
            await db.transaction.update({
              where: { id: tx.id },
              data: { status: TransactionStatus.FAILED },
            });
            stats.succeeded++;
            logger.info(`Transaction ${tx.id} expired and marked as failed`);
          } catch (updateError) {
            stats.failed++;
            logger.error(`[transaction-worker] failed to expire ${tx.id}: ${updateError}`);
          }
        }
      })
    )
  );

  return stats;
}

export const startTransactionWorker = () => {
  const paymentService = Container.get(PaymentService);
  const webhookQueueSvc = Container.get(WebhookQueue);

  new Worker(
    TRANSACTION_WORKER,
    async (job) => {
      if (job.name === jobs.VERIFY_INITIAL_SUBSCRIPTION_PAYMENT) {
        const { paymentId, subscriptionId } = job.data;
        const emailQueue = Container.get(EmailQueue);
        try {
          const result = await paymentService.verifyPayment({ paymentId });

          // on success -> activate subscription
          if (result.payload.status === "completed") {
            const subscription = await db.subscription.findUnique({
              where: { id: subscriptionId },
              include: { plan: { include: { profile: true } }, customer: true },
            });
            if (subscription) {
              const now = new Date();
              // compute endsAt based on plan duration
              const endsAt = (() => {
                const d = subscription.plan.duration as SubscriptionDuration;
                const out = new Date(now);
                switch (d) {
                  case SubscriptionDuration.WEEKLY:
                    out.setDate(out.getDate() + 7);
                    break;
                  case SubscriptionDuration.MONTHLY:
                    out.setMonth(out.getMonth() + 1);
                    break;
                  case SubscriptionDuration.SIX_MONTHS:
                    out.setMonth(out.getMonth() + 6);
                    break;
                  case SubscriptionDuration.YEARLY:
                    out.setFullYear(out.getFullYear() + 1);
                    break;
                }
                return out;
              })();

              await db.subscription.update({
                where: { id: subscription.id },
                data: {
                  status: SubscriptionStatus.ACTIVE,
                  startsAt: now,
                  endsAt,
                },
                include: { customer: true, plan: true },
              });
              
              try {
                await webhookQueueSvc.addScheduler(subscription.plan.profileId, {
                  event: "subscription.active",
                  data: {
                    transactionId: subscription.id,
                    amount: subscription.plan.amount,
                    currency: subscription.plan.currency,
                    status: "active",
                    occuredAt: new Date().toISOString()
                  }
                });
              } catch {}

              // schedule active email
              await emailQueue.addSubscriptionActiveScheduler({
                email: subscription.customer.email,
                customerName: `${subscription.customer.firstname} ${subscription.customer.lastname}`,
                merchantName: subscription.plan.profile?.businessName ?? "",
                planName: subscription.plan.name,
                duration: String(subscription.plan.duration),
                amount: subscription.plan.amount,
                currency: subscription.plan.currency,
                startsAt: now.toISOString(),
                expiresAt: endsAt.toISOString(),
              });
            }
          }
        } catch (error) {
          // verification failed -> mark subscription abandoned and notify customer
          try {
            const subscription = await db.subscription.findUnique({ where: { id: subscriptionId }, include: { plan: { include: { profile: true } }, customer: true } });
            if (subscription) {
              await db.subscription.update({ where: { id: subscription.id }, data: { status: "ABANDONED" as any } });

              try {
                await webhookQueueSvc.addScheduler(subscription.plan.profileId, {
                  event: "subscription.abandoned",
                  data: {
                    transactionId: subscription.id,
                    amount: subscription.plan.amount,
                    currency: subscription.plan.currency,
                    status: "abandoned",
                    occuredAt: new Date().toISOString()
                  }
                });
              } catch {}

              const emailQueueSvc = Container.get(EmailQueue);
              await emailQueueSvc.addSubscriptionAbandonedScheduler({
                email: subscription.customer.email,
                customerName: `${subscription.customer.firstname} ${subscription.customer.lastname}`,
                merchantName: subscription.plan.profile?.businessName ?? "",
                planName: subscription.plan.name,
              });
            }
          } catch (e) {
            // swallow
          }
        }

        return;
      }
      if (job.name === jobs.EXPIRE_PENDING) {
        try {
          logger.info("⏱ Transaction expiry job running");

          const expiryStats = await processExpiredPendingTransactions(paymentService);

          logStats(expiryStats);
        } catch (error) {
          logger.error(`[transaction-worker] expiry job error: ${error}`);
          throw error;
        }
        return;
      }
      if (job.name === jobs.SETTLE_PAYMENT) {
        const {
          walletPrivateKey,
          coinObjectId,
          amount,
          toAddress,
          tokenType,
          mode
        } = job.data;
        const walletService = Container.get(WalletService);
        await walletService.splitSendToMerchantsAndAdmin(
          walletPrivateKey,
          coinObjectId,
          amount,
          toAddress,
          tokenType,
          mode
        )
      }
    },
    {
      connection: redisClient,
      settings: {
        backoffStrategy: (attempt) => Math.min(attempt * 5_000, 30_000),
      },
    }
  );

  logger.info("💸 Transaction Worker started");
};
