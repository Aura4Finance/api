import { redisConnection } from "@/config/redis-config";
import { Queue } from "bullmq";

export const transactionQueue = new Queue("transaction-queue", {
    connection: redisConnection
});

