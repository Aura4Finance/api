import { Worker } from "bullmq";
import pLimit from "p-limit";
import db from "@/config/db-config";
import { TransactionStatus } from "@/generated/prisma/client";
import logger from "@/utils/logger";
import { PaymentService } from "@/services/payment.service";
import { Container } from "typedi";
import { redisConnection } from "@/config/redis-config";
import { WalletService } from "@/services/wallet.service";
import { EmailQueue } from "@/services/schedule.email.service";
import { SubscriptionStatus, SubscriptionDuration } from "@/generated/prisma/client";
import { jobs, TRANSACTION_WORKER } from "@/queues/transaction.queue";
import { WebhookQueue } from "@/services/schedule.webhook.service";
import { logTransactionError } from "@/utils/log-transaction-error";

const EXPIRY_CONFIG = {
  concurrencyLimit: 10,
} as const;

interface BatchStats {
  phase: "expiry" | "subscription-verification";
  attempted: number;
  skipped: number;
  succeeded: number;
  failed: number;
}

function computeEndsAt(now: Date, duration: SubscriptionDuration): Date {
  const out = new Date(now);
  switch (duration) {
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
}

function logStats(stats: BatchStats): void {
  logger.info(
    `[transaction-worker] phase=${stats.phase} ` +
    `attempted=${stats.attempted} skipped=${stats.skipped} ` +
    `succeeded=${stats.succeeded} failed=${stats.failed}`
  );
}

function computeEndsAt(now: Date, duration: SubscriptionDuration): Date {
  const out = new Date(now);
  switch (duration) {
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
    pending.map((tx: { id: string; }) =>
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

  const worker = new Worker(
    TRANSACTION_WORKER,
    async (job) => {
      if (job.name === jobs.VERIFY_INITIAL_SUBSCRIPTION_PAYMENT) {
        const { subscriptionId } = job.data;
        const emailQueue = Container.get(EmailQueue);
        const stats: BatchStats = { phase: "subscription-verification", attempted: 1, skipped: 0, succeeded: 0, failed: 0 };

        try {
          const subscription = await db.subscription.findUnique({
            where: { id: subscriptionId },
            include: { plan: { include: { profile: true } }, customer: true },
          });

          if (!subscription) {
            stats.skipped++;
            logStats(stats);
            return;
          }

          if (subscription.status === SubscriptionStatus.ACTIVE) {
            stats.skipped++;
            logStats(stats);
            return;
          }

          const now = new Date();
          const endsAt = computeEndsAt(now, subscription.plan.duration as SubscriptionDuration);
          const updated = await db.subscription.update({
            where: { id: subscription.id },
            data: {
              status: SubscriptionStatus.ACTIVE,
              startsAt: now,
              endsAt,
            },
            include: { customer: true, plan: { include: { profile: true } } },
          });

          await webhookQueueSvc.addScheduler(updated.plan.profileId, {
            event: "subscription.active",
            data: {
              subscriptionId: updated.id,
              status: "active",
              occuredAt: new Date().toISOString(),
            },
          });

          await emailQueue.addSubscriptionActiveScheduler({
            email: updated.customer.email,
            customerName: `${updated.customer.firstname} ${updated.customer.lastname}`,
            merchantName: updated.plan.profile?.businessName ?? "",
            planName: updated.plan.name,
            duration: String(updated.plan.duration),
            amount: updated.plan.amount,
            currency: updated.plan.currency,
            startsAt: now.toISOString(),
            expiresAt: endsAt.toISOString(),
          });
          stats.succeeded++;
          logStats(stats);
        } catch (error) {
          stats.failed++;
          logStats(stats);
          throw error; // let BullMQ retry — do not reinterpret as abandonment here

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
          coinType,
          mode
        } = job.data;

        logger.info(`[transaction-worker] settling payment to ${toAddress} with amount ${amount} and token ${coinType}`);
        const walletService = Container.get(WalletService);

        try {
          const result = await walletService.splitSendToMerchantsAndAdmin(
            walletPrivateKey,
            coinObjectId,
            amount,
            toAddress,
            coinType,
            mode
          )
          if (result.$kind !== "Transaction") {
            logTransactionError(result)
          }
        } catch (error: unknown) {
          logger.error(`[transaction-worker] settle payment job error: ${(error as Error).stack ?? error}`);
          throw error; // rethrow so BullMQ retries
        }
      }
    },
    {
      connection: redisConnection,
      concurrency: 3
    }
  );

  logger.info("💸 Transaction Worker started");
  // Prevents unhandled worker errors from crashing the process
  worker.on("error", (err) => {
    logger.error(`[transaction-worker] worker error: ${err}`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`[transaction-worker] job ${job?.name} failed: ${err}`);
  });
};
