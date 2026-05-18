import { Worker } from "bullmq";
import db from "@/config/db-config";
import { TransactionStatus } from "../../generated/prisma";
import logger from "@/utils/logger";
import { PaymentService } from "@/services/payment.service";
import Container from "typedi";
import { redisConnection } from "@/config/redis-config";
import { WalletService } from "@/services/wallet.service";
import { EmailQueue } from "@/services/schedule.email.service";
import { triggerWebhook } from "@/services/user/webhook.service";
import { SubscriptionStatus, SubscriptionDuration } from "../../generated/prisma";

export const startTransactionWorker = () => {
  const paymentService = Container.get(PaymentService);

  new Worker(
    "transaction-queue",
    async (job) => {
      if (job.name == "verify-payment") {
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
                await triggerWebhook(subscription.plan.profileId, {
                  event: "subscription.active",
                  data: {
                    transactionId: subscription.id,
                    amount: subscription.plan.amount,
                    currency: subscription.plan.currency,
                    status: "active",
                    occuredAt: new Date().toISOString(),
                  },
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
                await triggerWebhook(subscription.plan.profileId, {
                  event: "subscription.abandoned",
                  data: {
                    transactionId: subscription.id,
                    amount: subscription.plan.amount,
                    currency: subscription.plan.currency,
                    status: "abandoned",
                    occuredAt: new Date().toISOString(),
                  },
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
      if (job.name == "expire-pending-transactions") {

        logger.info("⏱ Transaction expiry job running");
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

        try {
          const pending = await db.transaction.findMany({
            where: {
              status: TransactionStatus.PENDING,
              createdAt: { lte: cutoff },
            },
            select: { id: true },
          });

          for (const tx of pending) {
            try {
              // Try verifyPayment first
              await paymentService.verifyPayment({ paymentId: tx.id });
            } catch (error) {
              await db.transaction.update({
                where: { id: tx.id },
                data: { status: TransactionStatus.FAILED },
              });
              logger.info(`Transaction ${tx.id} expired and marked as failed`);
            }
          }
        } catch (error) {
          logger.error(`Transaction worker error: ${error}`);
          throw error;
        }
      }
      if (job.name == "transfer-usdt") {
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
    { connection: redisConnection }
  );

  logger.info("💸 Transaction Worker started");
};
