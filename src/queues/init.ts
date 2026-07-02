import logger from "@/utils/logger";
import { initializeTransactionJobs } from "@/queues/transaction.queue";
import { initializeWebhookDeadLetterJob } from "@/queues/webhook.queue";
import { initializeSubscriptionJobs } from "@/queues/subscription.queue";
import { Container } from "typedi";
import { EmailQueue } from "@/services/schedule.email.service";
import { initializeSeed } from "@/utils/wallet/seed";

export async function executeInits() {
    await initializeSeed();
    await initializeTransactionJobs();
    await initializeWebhookDeadLetterJob();
    await initializeSubscriptionJobs();
    const emailQueue = Container.get(EmailQueue);
    await emailQueue.addOnboardEmailScheduler();

    logger.info("Transaction expiry scheduler initialized!");
    logger.info("Subscription renewal scheduler initialized!");
    logger.info("Subscription trial scheduler initialized!");
    logger.info("Subscription reconciliation scheduler initialized!");
    logger.info("Email onboard scheduler initialized!");
    logger.info("Webhook dead letter scheduler initialized!");
}
