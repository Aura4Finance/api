import logger from "@/utils/logger";
import { transactionQueue, jobs } from "./transaction.queue";
import Container from "typedi";
import { EmailQueue } from "@/services/schedule.email.service";
import { initializeSeed } from "@/utils/wallet/seed";

export async function initTransactionAndEmailOnboardJobs() {
    await initializeSeed();

    const emailQueue = Container.get(EmailQueue);
    const transactionJobs = await transactionQueue.getJobSchedulers();

    // Clean up existing schedulers first
    for (const job of transactionJobs) {
        if (
            job.name === jobs.EXPIRE_PENDING 
        ) {
            await transactionQueue.removeJobScheduler(job.key);
        }
    }

    // Run once immediately on initialization
    await transactionQueue.add(jobs.EXPIRE_PENDING, {});

    // Schedule recurring job every 30 minutes
    await transactionQueue.upsertJobScheduler(
        "expire-pending-transactions-scheduler",
        { every: 1000 * 60 * 30 },
        {
            name: jobs.EXPIRE_PENDING,
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