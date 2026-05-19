import { Worker } from "bullmq";
import pLimit from "p-limit";
import { redisClient } from "@/middlewares/rate-limit.middleware";
import Container from "typedi";
import { EmailService } from "@/services/email.service";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import logger from "@/utils/logger";
import db from "@/config/db-config";
import { redisConnection } from "@/config/redis-config";
import { resend } from "@/config/resend-config";

const emailService = Container.get(EmailService);

const EMAIL_CONFIG = {
  concurrencyLimit: 10,
} as const;

interface JobStats {
  phase:
    | "welcome-email"
    | "offers"
    | "problems"
    | "payment_failed"
    | "payment_success"
    | "subscription-reminder"
    | "subscription-expired"
    | "subscription-cancelled"
    | "subscription-active"
    | "subscription-abandoned"
    | "onboarded";
  attempted: number;
  skipped: number;
  succeeded: number;
  failed: number;
}

function logStats(stats: JobStats): void {
  logger.info(
    `[email-worker] phase=${stats.phase} ` +
      `attempted=${stats.attempted} skipped=${stats.skipped} ` +
      `succeeded=${stats.succeeded} failed=${stats.failed}`
  );
}

async function runTrackedEmailJob(
  phase: JobStats["phase"],
  task: () => Promise<void>,
): Promise<void> {
  const stats: JobStats = { phase, attempted: 1, skipped: 0, succeeded: 0, failed: 0 };

  try {
    await task();
    stats.succeeded = 1;
  } catch (error) {
    stats.failed = 1;
    throw error;
  } finally {
    logStats(stats);
  }
}

async function processOnboardedEmails(): Promise<JobStats> {
  const stats: JobStats = {
    phase: "onboarded",
    attempted: 0,
    skipped: 0,
    succeeded: 0,
    failed: 0,
  };

  const users = await db.businessProfile.findMany({
    where: { onboarded: false },
    include: { user: true },
  });

  const limit = pLimit(EMAIL_CONFIG.concurrencyLimit);

  await Promise.all(
    users.map((user) =>
      limit(async () => {
        stats.attempted++;

        try {
          const userState = await redisClient.get(user.userId);
          const count = userState ? JSON.parse(userState).count : 0;

          if (count >= 2) {
            stats.skipped++;
            return;
          }

          await emailService.sendOnBoardingEmail(
            user.user.email,
            user.user.firstname
          );

          await redisClient.set(
            user.userId,
            JSON.stringify({ count: count + 1 })
          );

          stats.succeeded++;
        } catch (error) {
          stats.failed++;
          logger.error(`[email-worker] onboarded failed for ${user.userId}: ${error}`);
        }
      })
    )
  );

  return stats;
}

const checkIfUserSuscribedForEmailNotification = async (email: string) => {
  const customer = await resend.contacts.get({ email });
  if (!customer.data) return false;
  return customer.data.unsubscribed !== true;
};


export const startEmailWorker = () => {

  new Worker(
    "email-queue",
    async (job) => {
      const { email, name, customerName, ...rest } = job.data;
      const recipientName = name ?? customerName;
      try {
        switch (job.name) {
          case "welcome-email":
            await runTrackedEmailJob("welcome-email", async () => {
              await emailService.sendWelcomeEmail(email, recipientName);
              logger.info("Welcome email sent!");
            });
            break;

          case "offers":
            await runTrackedEmailJob("offers", async () => {
              await emailService.sendOfferEmail(email);
              logger.info("Offer email sent");
            });
            break;

          case "problems":
            await runTrackedEmailJob("problems", async () => {
              await emailService.sendProblemEmail(email, recipientName);
              logger.info("Problems email sent");
            });
            break;
          case "payment_failed":
            await runTrackedEmailJob("payment_failed", async () => {
              await emailService.sendPaymentFailedEmail(email, recipientName, rest.amount, rest.currency, rest.reference);
            });
            break;
          case "payment_success": {
            await runTrackedEmailJob("payment_success", async () => {
              if (await checkIfUserSuscribedForEmailNotification(rest.merchantEmail)) {
                await emailService.sendMerchantPaymentReceivedEmail(rest.merchantEmail, rest.merchantName, recipientName, rest.amount, rest.currency, rest.reference);
                logger.info("payment succeess email sent for merchant");
              }
              await emailService.sendPaymentSuccessEmail(email, recipientName, rest.amount, rest.currency, rest.reference, rest.merchantName);
              logger.info("payment success email sent for customer");
            });
            break;
          }

          case "subscription-reminder":
            await runTrackedEmailJob("subscription-reminder", async () => {
              await emailService.sendSubscriptionReminderEmail(email, {
                customerName: recipientName,
                merchantName: rest.merchantName,
                planName: rest.planName,
                duration: rest.duration,
                amountDue: rest.amount,
                currency: rest.currency,
                daysLeft: rest.daysLeft,
                expiresAt: rest.expiresAt,
                checkoutUrl: rest.checkoutUrl,
              });
              logger.info("Subscription reminder email sent");
            });
            break;

          case "subscription-expired":
            await runTrackedEmailJob("subscription-expired", async () => {
              await emailService.sendSubscriptionExpiredEmail(email, {
                customerName: recipientName,
                merchantName: rest.merchantName,
                planName: rest.planName,
                duration: rest.duration,
                expiresAt: rest.expiresAt,
                checkoutUrl: rest.checkoutUrl,
              });
              logger.info("Subscription expired email sent");
            });
            break;

          case "subscription-cancelled":
            await runTrackedEmailJob("subscription-cancelled", async () => {
              await emailService.sendSubscriptionCancelledEmail(email, {
                customerName: recipientName,
                merchantName: rest.merchantName,
                planName: rest.planName,
                duration: rest.duration,
                cancelledAt: rest.cancelledAt,
                expiresAt: rest.expiresAt,
              });
              logger.info("Subscription cancelled email sent");
            });
            break;

          case "subscription-active":
            await runTrackedEmailJob("subscription-active", async () => {
              await emailService.sendSubscriptionActiveEmail(email, {
                customerName: recipientName,
                merchantName: rest.merchantName,
                planName: rest.planName,
                duration: rest.duration,
                amount: rest.amount,
                currency: rest.currency,
                startsAt: rest.startsAt,
                expiresAt: rest.expiresAt,
              });
              logger.info("Subscription active email sent");
            });
            break;

          case "subscription-abandoned":
            await runTrackedEmailJob("subscription-abandoned", async () => {
              await emailService.sendSubscriptionAbandonedEmail(email, {
                customerName: recipientName,
                merchantName: rest.merchantName,
                planName: rest.planName,
                checkoutUrl: rest.checkoutUrl,
              });
              logger.info("Subscription abandoned email sent");
            });
            break;


          case "onboarded":
            const onboardingStats = await processOnboardedEmails();
            logStats(onboardingStats);
            break;

          default:
            throw new APIError("Unknown job type", STATUS.bad);
        }
      } catch (error) {
        logger.error(`Email worker error: ${error}`);
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: 1,
      limiter: {
        max: 2,
        duration: 1000,
      },
    }
  );

  logger.info("📧 Email Worker started");
};