import { Worker } from "bullmq";
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
            try {
              await emailService.sendWelcomeEmail(email, recipientName);
              logger.info("Welcome email sent!")
            } catch (error: any) {
              logger.error(`Error sending email: ${error.message}`)
            }
            break;

          case "offers":
            try {
              await emailService.sendOfferEmail(email);
              logger.info("Offer email sent")
            } catch (error: any) {
              logger.error(`Error sending email: ${error.message}`)
            }
            break;

          case "problems":
            try {
              await emailService.sendProblemEmail(email, recipientName);
              logger.info("Problems email sent")
            } catch (error: any) {
              logger.error(`Error sending email: ${error.message}`);
            }
            break;
          case "payment_failed":
            try {
              await emailService.sendPaymentFailedEmail(email, recipientName, rest.amount, rest.currency, rest.reference);
            } catch (err: any) {
              logger.error(`Error sending payment failed email: ${err.message}`);
            }
            break;
          case "payment_success": {
            try {
              if (await checkIfUserSuscribedForEmailNotification(rest.merchantEmail)) {
                await emailService.sendMerchantPaymentReceivedEmail(rest.merchantEmail, rest.merchantName, recipientName, rest.amount, rest.currency, rest.reference);
                logger.info("payment succeess email sent for merchant")
              }
              await emailService.sendPaymentSuccessEmail(email, recipientName, rest.amount, rest.currency, rest.reference, rest.merchantName);
              logger.info("payment success email sent for customer")
            } catch (error: any) {
              logger.info(`Error sending email: ${error.message}`)
            }
            break;
          }

          case "subscription-reminder":
            try {
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
              logger.info("Subscription reminder email sent")
            } catch (error: any) {
              logger.error(`Error sending subscription reminder email: ${error.message}`)
            }
            break;

          case "subscription-expired":
            try {
              await emailService.sendSubscriptionExpiredEmail(email, {
                customerName: recipientName,
                merchantName: rest.merchantName,
                planName: rest.planName,
                duration: rest.duration,
                expiresAt: rest.expiresAt,
                checkoutUrl: rest.checkoutUrl,
              });
              logger.info("Subscription expired email sent")
            } catch (error: any) {
              logger.error(`Error sending subscription expired email: ${error.message}`)
            }
            break;

          case "subscription-cancelled":
            try {
              await emailService.sendSubscriptionCancelledEmail(email, {
                customerName: recipientName,
                merchantName: rest.merchantName,
                planName: rest.planName,
                duration: rest.duration,
                cancelledAt: rest.cancelledAt,
                expiresAt: rest.expiresAt,
              });
              logger.info("Subscription cancelled email sent")
            } catch (error: any) {
              logger.error(`Error sending subscription cancelled email: ${error.message}`)
            }
            break;

          case "subscription-active":
            try {
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
              logger.info("Subscription active email sent")
            } catch (error: any) {
              logger.error(`Error sending subscription active email: ${error.message}`)
            }
            break;

          case "subscription-abandoned":
            try {
              await emailService.sendSubscriptionAbandonedEmail(email, {
                customerName: recipientName,
                merchantName: rest.merchantName,
                planName: rest.planName,
                checkoutUrl: rest.checkoutUrl,
              });
              logger.info("Subscription abandoned email sent")
            } catch (error: any) {
              logger.error(`Error sending subscription abandoned email: ${error.message}`)
            }
            break;


          case "onboarded":
            const users = await db.businessProfile.findMany({
              where: { onboarded: false },
              include: { user: true },
            });

            for (const user of users) {
              const userState = await redisClient.get(user.userId);
              const count = userState ? JSON.parse(userState).count : 0;

              if (count >= 2) continue;

              await emailService.sendOnBoardingEmail(
                user.user.email,
                user.user.firstname
              );

              await redisClient.set(
                user.userId,
                JSON.stringify({ count: count + 1 })
              );
            }
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