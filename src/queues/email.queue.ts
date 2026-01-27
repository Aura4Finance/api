import { redisConnection } from "@/config/redis-config";
import { Queue } from "bullmq";

export const emailQueue = new Queue("email-queue", {
    connection: redisConnection
})