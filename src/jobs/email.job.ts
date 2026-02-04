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

const checkIfUserSuscribedForEmailNotification = async (email: string) => {
  const customer = await resend.contacts.get({ email });

  if (!customer.data) return false; // customer not found

  return customer.data.unsubscribed !== true;
};


export const startEmailWorker = () => {
  const emailService = Container.get(EmailService);

  new Worker(
    "email-queue",
    async (job) => {
      const { email, name, ...rest } = job.data;
      try {
        switch (job.name) {
          case "welcome-email":
            try {
              await emailService.sendWelcomeEmail(email, name);
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
              await emailService.sendProblemEmail(email, name);
              logger.info("Problems email sent")
            } catch (error: any) {
              logger.error(`Error sending email: ${error.message}`)
            }
            break;
          case "payment_failed":
            try {
              await emailService.sendPaymentFailedEmail(email, name, rest.amount, rest.currency, rest.reference);
            } catch (err: any) {
              logger.error(`Error sending payment failed email: ${err.message}`)
            }
            break;
          case "payment_success":
            try {
              if (await checkIfUserSuscribedForEmailNotification(email)) {
                await emailService.sendPaymentSuccessEmail(email, name, rest.amount, rest.currency, rest.reference, rest.merchantName);
              }
              if (await checkIfUserSuscribedForEmailNotification(rest.merchantEmail)) {
                await emailService.sendMerchantPaymentReceivedEmail(rest.merchantEmail, rest.merchantName, name, rest.amount, rest.currency, rest.reference);
              }
              await emailService.sendPaymentSuccessEmail(email, name, rest.amount, rest.currency, rest.reference, rest.merchantName);
            } catch (err: any) {
              logger.error(`Error sending payment success email: ${err.message}`)
            }
            break

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
