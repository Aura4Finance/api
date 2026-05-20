import { Queue } from "bullmq";
import { redisClient } from "@/config/redis-config";

export const SUBSCRIPTION_WORKER = "subscription-worker";

export const subscriptionQueue = new Queue(
    SUBSCRIPTION_WORKER,
    {connection: redisClient}
);

export const jobs = {
    PROCESS_RENEWALS: "process-subscription-renewals",
    RECONCILE_STUCK_SUBSCRIPTIONS: "reconcile-stuck-subscriptions",
}

export const initializeSubscriptionJobs = async () => {
    const existingJobs = await subscriptionQueue.getJobSchedulers();
    for (const job of existingJobs) {
        if (
            job.name === jobs.PROCESS_RENEWALS ||
            job.name === jobs.RECONCILE_STUCK_SUBSCRIPTIONS
        ) {
            await subscriptionQueue.removeJobScheduler(job.key);
        }
    }
    subscriptionQueue.upsertJobScheduler(
        "process-subscription-renewals-scheduler",
        { every: 1000 * 60 * 60 * 24 },
        {
            name: jobs.PROCESS_RENEWALS,
            data: {},
            opts: {
                removeOnComplete: true,
                removeOnFail: false,
            },
        }
    );
    subscriptionQueue.upsertJobScheduler(
        "reconcile-stuck-subscriptions-scheduler",
        { every: 1000 * 60 * 60 * 24 },
        {
            name: jobs.RECONCILE_STUCK_SUBSCRIPTIONS,
            data: {},
            opts: {
                removeOnComplete: true,
                removeOnFail: false,
            },
        }
    );
}