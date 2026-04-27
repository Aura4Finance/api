import { Queue } from "bullmq";
import { redisConnection } from "@/config/redis-config";

export const webhookDlqQueue = new Queue("webhook-dlq", {
  connection: redisConnection,
});
