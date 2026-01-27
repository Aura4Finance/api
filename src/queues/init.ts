import logger from "@/utils/logger";
import { transactionQueue } from "./transaction.queue";
import Container from "typedi";
import { EmailQueue } from "@/services/schedule.email.service";

export async function initTransactionAndEmailOnboardJobs() {
    const emailQueue = Container.get(EmailQueue)
    const repeatableJobs = await transactionQueue.getJobSchedulers();

    for (const job of repeatableJobs) {
        if (job.name == "expire-pending-transactions"  || job.name == "onboarded") {
            await transactionQueue.removeJobScheduler(job.key);
        }
        await transactionQueue.add( "expire-pending-transactions", {}) //runs once on initialization
        await transactionQueue.add(
            "expire-pending-transactions",
            {},
            {
                repeat: {
                    every: 1000 * 60 * 30 // every 30 minutes
                },
                removeOnComplete: true,
                removeOnFail: false
            }
        )
        await emailQueue.addOnboardEmailScheduler();
    }
    logger.info("Transaction expiry scheduler initialized!");
    logger.info("Email onboard scheduler initialized!");
}