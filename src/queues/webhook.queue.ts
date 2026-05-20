import { Queue } from "bullmq";
import { redisConnection } from "@/config/redis-config";

export const WEBHOOK_WORKER = "webhook-worker";

export const webhookQueue = new Queue(WEBHOOK_WORKER, {
    connection: redisConnection
})

export const WEBHOOK_DEAD_LETTER_WORKER = "webhook-dead-letter-worker";
export const webhookDlqQueue = new Queue(WEBHOOK_DEAD_LETTER_WORKER, {
    connection: redisConnection
})

export const jobs = {
    TRIGGER: "trigger-webhook",
    TRIGGER_DEADLETTER: "trigger-webhook-deadletter"
}

export const initializeWebhookDeadLetterJob = async () => {
    const existingJobs = await webhookDlqQueue.getJobSchedulers();
    for (const job of existingJobs) {
        if (
            job.name === jobs.TRIGGER_DEADLETTER
        ) {
            await webhookDlqQueue.removeJobScheduler(job.key);
        }
    }
    webhookDlqQueue.upsertJobScheduler(
        "trigger-webhook-deadletter-scheduler",
        { every: 1000 * 60 * 60 }, // Run every hour
        {
            name: jobs.TRIGGER_DEADLETTER,
            data: {},
            opts: {
                removeOnComplete: true,
                removeOnFail: false,
            }
        }
    );
}