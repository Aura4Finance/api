import { redisConnection } from "@/config/redis-config";
import { Queue } from "bullmq";

export const webhookQueue = new Queue("webhook-queue", {
    connection: redisConnection
})