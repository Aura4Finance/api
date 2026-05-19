import logger from "@/utils/logger";
import { transactionQueue } from "./transaction.queue";
import Container from "typedi";
import { EmailQueue } from "@/services/schedule.email.service";
import { initializeSeed } from "@/utils/wallet/seed";
import { startSubscriptionWorker } from "@/jobs/subscription.job";
import { startTransactionWorker } from "@/jobs/transaction.job";

export async function initTransactionAndEmailOnboardJobs() {
    await initializeSeed();

    const emailQueue = Container.get(EmailQueue);
    startTransactionWorker();
    startSubscriptionWorker();
    const repeatableJobs = await transactionQueue.getJobSchedulers();

    // Clean up existing schedulers first
    for (const job of repeatableJobs) {
        if (
            job.name === "expire-pending-transactions" ||
            job.name === "process-subscription-renewals" ||
            job.name === "reconcile-stuck-subscriptions" ||
            job.name === "onboarded"
        ) {
            await transactionQueue.removeJobScheduler(job.key);
        }
    }

    // Run once immediately on initialization
    await transactionQueue.add("expire-pending-transactions", {});

    // Schedule recurring job every 30 minutes
    await transactionQueue.upsertJobScheduler(
        "expire-pending-transactions-scheduler",
        { every: 1000 * 60 * 30 },
        {
            name: "expire-pending-transactions",
            data: {},
            opts: {
                removeOnComplete: true,
                removeOnFail: false,
            },
        }
    );

    await transactionQueue.upsertJobScheduler(
        "process-subscription-renewals-scheduler",
        { every: 1000 * 60 * 60 * 24 },
        {
            name: "process-subscription-renewals",
            data: {},
            opts: {
                removeOnComplete: true,
                removeOnFail: false,
            },
        }
    );

    await transactionQueue.add("reconcile-stuck-subscriptions", {});

    await transactionQueue.upsertJobScheduler(
        "reconcile-stuck-subscriptions-scheduler",
        { every: 1000 * 60 * 60 * 24 },
        {
            name: "reconcile-stuck-subscriptions",
            data: {},
            opts: {
                removeOnComplete: true,
                removeOnFail: false,
            },
        }
    );

    await emailQueue.addOnboardEmailScheduler();

    logger.info("Transaction expiry scheduler initialized!");
    logger.info("Subscription renewal scheduler initialized!");
    logger.info("Subscription reconciliation scheduler initialized!");
    logger.info("Email onboard scheduler initialized!");
}