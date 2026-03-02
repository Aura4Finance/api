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
const BATCH_SIZE = 10;
const BATCH_FLUSH_MS = 1000;

let batch: any[] = [];
let flushTimer: NodeJS.Timeout | null = null;

const flushBatch = async () => {
  if (batch.length === 0) return;

  const payload = [...batch];
  batch = [];

  try {
    await emailService.sendBatchEmail(payload);
    logger.info(`📨 Sent batch of ${payload.length} emails`);
  } catch (err) {
    logger.error("Batch send failed", err);
  }
};



const checkIfUserSuscribedForEmailNotification = async (email: string) => {
  const customer = await resend.contacts.get({ email });

  if (!customer.data) return false; // customer not found

  return customer.data.unsubscribed !== true;
};


export const startEmailWorker = () => {

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
              batch.push(
                await emailService.buildEmailPayload(
                  email,
                  "Payment Failed – Please Try Again",
                  "payment_failed",
                  {
                    name,
                    amount: rest.amount,
                    currency: rest.currency,
                    reference: rest.reference,
                    date: new Date().toLocaleString(),
                  },
                  true,
                  true
                )
              );

              if (batch.length >= BATCH_SIZE) {
                await flushBatch();
              } else if (!flushTimer) {
                flushTimer = setTimeout(async () => {
                  await flushBatch();
                  flushTimer = null;
                }, BATCH_FLUSH_MS);
              }
            } catch (err: any) {
              logger.error(`Error sending payment failed email: ${err.message}`)
            }
            break;
          case "payment_success": {
            if (await checkIfUserSuscribedForEmailNotification(rest.merchantEmail)) {
              batch.push(
                await emailService.buildEmailPayload(
                  rest.merchantEmail,
                  "You’ve Received a Payment 💰",
                  "merchant_payment_received",
                  {
                    merchantName: rest.merchantName,
                    customerName: name,
                    amount: rest.amount,
                    currency: rest.currency,
                    reference: rest.reference,
                    date: new Date().toLocaleString(),
                  }
                )
              );
            }

            batch.push(
              await emailService.buildEmailPayload(
                email,
                "Payment Successful 🎉",
                "payment_success",
                {
                  name,
                  amount: rest.amount,
                  currency: rest.currency,
                  reference: rest.reference,
                  merchantName: rest.merchantName,
                  date: new Date().toLocaleString(),
                },
                true,
                true
              )
            );

            if (batch.length >= BATCH_SIZE) {
              await flushBatch();
            } else if (!flushTimer) {
              flushTimer = setTimeout(async () => {
                await flushBatch();
                flushTimer = null;
              }, BATCH_FLUSH_MS);
            }

            break;
          }


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