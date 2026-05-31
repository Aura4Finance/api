import logger from "@/utils/logger";
import { ConnectionOptions } from "bullmq";
import RedisClient, { RedisOptions } from "ioredis";

function parseNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const baseOptions: RedisOptions = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  ...(process.env.REDIS_USERNAME && { username: process.env.REDIS_USERNAME }),
  ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
  maxRetriesPerRequest: parseNumber(process.env.REDIS_MAX_RETRIES_PER_REQUEST, -1),
  enableOfflineQueue: process.env.REDIS_ENABLE_OFFLINE_QUEUE
    ? process.env.REDIS_ENABLE_OFFLINE_QUEUE === "true"
    : true,
  connectTimeout: parseNumber(process.env.REDIS_CONNECT_TIMEOUT_MS, 10000),
  keepAlive: parseNumber(process.env.REDIS_KEEP_ALIVE_MS, 30000),
  retryStrategy: (times: number) => {
    const retryDelayMs = parseNumber(process.env.REDIS_RETRY_DELAY_MS, 200);
    return Math.min(times * retryDelayMs, 2000);
  },
  ...(process.env.REDIS_TLS === "true" && { tls: {} }),
};

// For ioredis client — typed against ioredis directly, no conflict
export const redisClient = new RedisClient(baseOptions);

// For bullmq queues/workers — cast to ConnectionOptions, safe because the
// fields are a strict subset and bullmq only reads them at runtime
export const redisConnection: ConnectionOptions = baseOptions as ConnectionOptions;

redisClient.on("error", (err) => {
  logger.error("Redis error: ", err);
});

redisClient.on("connect", () => {
  logger.info("Connected to Redis successfully");
});