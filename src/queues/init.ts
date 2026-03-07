import logger from "@/utils/logger";
import { transactionQueue } from "./transaction.queue";
import Container from "typedi";
import { EmailQueue } from "@/services/schedule.email.service";
import { initializeSeed } from "@/utils/wallet/seed";

export async function initTransactionAndEmailOnboardJobs() {
    await initializeSeed();

    const emailQueue = Container.get(EmailQueue);
    const repeatableJobs = await transactionQueue.getJobSchedulers();

    // Clean up existing schedulers first
    for (const job of repeatableJobs) {
        if (job.name === "expire-pending-transactions" || job.name === "onboarded") {
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

    await emailQueue.addOnboardEmailScheduler();

    logger.info("Transaction expiry scheduler initialized!");
    logger.info("Email onboard scheduler initialized!");
}