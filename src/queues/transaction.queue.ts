import { redisClient } from "@/config/redis-config";
import { Queue } from "bullmq";

export const TRANSACTION_WORKER = "transaction-worker";
export const transactionQueue = new Queue(TRANSACTION_WORKER, {
    connection: redisClient
});

export const jobs = {
    EXPIRE_PENDING: "expire-pending-transactions",
    VERIFY_INITIAL_SUBSCRIPTION_PAYMENT: "verify-initial-subscription-payment",
    SETTLE_PAYMENT: "settle-payment",
}

export const initializeTransactionJobs = async () => {
    const existingJobs = await transactionQueue.getJobSchedulers();
    for (const job of existingJobs) {
        if (
            job.name === jobs.EXPIRE_PENDING
        ) {
            await transactionQueue.removeJobScheduler(job.key);
        }
    }
    transactionQueue.upsertJobScheduler(
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
}

