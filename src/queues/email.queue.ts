import { redisConnection } from "@/config/redis-config";
import { Queue } from "bullmq";

export const EMAIL_WORKER = "email-worker";
export const emailQueue = new Queue(EMAIL_WORKER, {
    connection: redisConnection
});

export const jobs = {
    WELCOME: "welcome-email",
    OFFERS: "offers",
    PROBLEMS: "problems",
    PAYMENT_FAILED: "payment_failed",
    PAYMENT_SUCCESS: "payment_success",
    SUBSCRIPTION_REMINDER: "subscription-reminder",
    SUBSCRIPTION_EXPIRED: "subscription-expired",
    SUBSCRIPTION_CANCELLED: "subscription-cancelled",
    SUBSCRIPTION_ACTIVE: "subscription-active",
    SUBSCRIPTION_ABANDONED: "subscription-abandoned",
    ONBOARDED: "onboarded"
}