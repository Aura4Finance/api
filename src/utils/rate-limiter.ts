import Bottleneck from "bottleneck";
import { redisConnection } from "@/config/redis-config";
import logger from "@/utils/logger";

const limiterCache = new Map<string, Bottleneck>();
let shutdownHookRegistered = false;

const DEFAULT_MAX_CONCURRENT = parseNumber(process.env.RATE_LIMIT_MAX_CONCURRENT, 3);
const DEFAULT_MIN_TIME_MS = parseNumber(process.env.RATE_LIMIT_MIN_TIME_MS, 200);

function parseNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}

function buildRedisOptions(): Record<string, unknown> {
  const redisOptions = { ...redisConnection } as Record<string, unknown>;

  const maxRetriesPerRequest = parseNumber(
    process.env.REDIS_MAX_RETRIES_PER_REQUEST,
    -1
  );
  if (maxRetriesPerRequest >= 0) {
    redisOptions.maxRetriesPerRequest = maxRetriesPerRequest;
  }

  if (process.env.REDIS_ENABLE_OFFLINE_QUEUE) {
    redisOptions.enableOfflineQueue =
      process.env.REDIS_ENABLE_OFFLINE_QUEUE === "true";
  }

  const retryDelayMs = parseNumber(process.env.REDIS_RETRY_DELAY_MS, 200);
  if (retryDelayMs > 0) {
    redisOptions.retryStrategy = (times: number) =>
      Math.min(times * retryDelayMs, 2000);
  }

  return redisOptions;
}

function getLimiterDefaults(key: string) {
  const sanitizedKey = sanitizeKey(key);
  const maxConcurrent = parseNumber(
    process.env[`RATE_LIMIT_${sanitizedKey}_MAX_CONCURRENT`],
    DEFAULT_MAX_CONCURRENT
  );
  const minTime = parseNumber(
    process.env[`RATE_LIMIT_${sanitizedKey}_MIN_TIME_MS`],
    DEFAULT_MIN_TIME_MS
  );

  return { maxConcurrent, minTime };
}

function registerShutdownHook() {
  if (shutdownHookRegistered) return;
  shutdownHookRegistered = true;

  const shutdown = async () => {
    const limiters = Array.from(limiterCache.values());
    if (limiters.length === 0) return;

    await Promise.allSettled(
      limiters.map((limiter) => limiter.stop({ dropWaitingJobs: false }))
    );
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

export function getLimiter(
  key: string,
  options: Partial<Bottleneck.ConstructorOptions> = {}
) {
  if (limiterCache.has(key)) return limiterCache.get(key)!;

  registerShutdownHook();
  const defaults = getLimiterDefaults(key);

  const limiter = new Bottleneck({
    id: `limiter:${key}`,
    datastore: "ioredis",
    clientOptions: buildRedisOptions(),
    maxConcurrent: defaults.maxConcurrent,
    minTime: defaults.minTime,
    ...options,
  });

  limiter.on("error", (error) => {
    logger.error("Limiter error", { limiter: key, error: String(error) });
  });

  limiter.on("failed", (error, jobInfo) => {
    logger.warn("Limiter job failed", {
      limiter: key,
      jobId: jobInfo.options.id,
      error: String(error),
    });
  });

  limiter.on("retry", (error, jobInfo) => {
    logger.info("Limiter retry", {
      limiter: key,
      jobId: jobInfo.options.id,
      error: String(error),
    });
  });

  limiter.on("dropped", (jobInfo) => {
    logger.warn("Limiter dropped job", {
      limiter: key,
      jobId: jobInfo.options.id,
    });
  });

  limiterCache.set(key, limiter);
  return limiter;
}

export function getLimiterForUrl(url: string) {
  const hostname = new URL(url).hostname;
  return getLimiter(`domain:${hostname}`);
}
