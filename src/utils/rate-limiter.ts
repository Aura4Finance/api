import Bottleneck from "bottleneck";
import { redisClient } from "@/config/redis-config";
import logger from "@/utils/logger";

const limiterCache = new Map<string, Bottleneck>();
let shutdownHookRegistered = false;
let sharedLimiterConnection: Bottleneck.IORedisConnection | undefined;

const DEFAULT_MAX_CONCURRENT = parseNumber(process.env.RATE_LIMIT_MAX_CONCURRENT, 3);
const DEFAULT_MIN_TIME_MS = parseNumber(process.env.RATE_LIMIT_MIN_TIME_MS, 200);
const DEFAULT_LIMITER_TIMEOUT_MS = parseNumber(
  process.env.RATE_LIMIT_TIMEOUT_MS,
  5 * 60 * 1000
);

function parseNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}

function getSharedLimiterConnection() {
  if (!sharedLimiterConnection) {
    sharedLimiterConnection = new Bottleneck.IORedisConnection({
      client: redisClient,
    });
  }

  return sharedLimiterConnection;
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

async function disconnectLimiterInstance(
  limiter: Bottleneck,
  key: string,
  reason: string
) {
  try {
    await limiter.disconnect(false);
  } catch (error) {
    logger.warn("Limiter disconnect failed", {
      limiter: key,
      reason,
      error: String(error),
    });
  } finally {
    limiter.removeAllListeners();
  }

  logger.info("Limiter cleaned up", {
    limiter: key,
    reason,
  });
}

async function cleanupLimiter(key: string, reason = "manual") {
  const limiter = limiterCache.get(key);
  if (!limiter) return false;

  limiterCache.delete(key);
  await disconnectLimiterInstance(limiter, key, reason);

  return true;
}

export async function cleanupLimiterForUrl(url: string, reason = "manual") {
  try {
    const hostname = new URL(url).hostname;
    return cleanupLimiter(`domain:${hostname}`, reason);
  } catch (error) {
    logger.warn("Limiter cleanup skipped due to invalid URL", {
      url,
      reason,
      error: String(error),
    });

    return false;
  }
}

function registerShutdownHook() {
  if (shutdownHookRegistered) return;
  shutdownHookRegistered = true;

  const shutdown = async () => {
    const keys = Array.from(limiterCache.keys());
    if (keys.length === 0) return;

    await Promise.allSettled(keys.map((key) => cleanupLimiter(key, "shutdown")));
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
    connection: getSharedLimiterConnection(),
    maxConcurrent: defaults.maxConcurrent,
    minTime: defaults.minTime,
    ...options,
  });

  let cleaningUp = false;

  limiter.on("error", (error) => {
    const errorText = String(error);

    logger.error("Limiter error", { limiter: key, error: errorText });

    if (errorText.includes("SETTINGS_KEY_NOT_FOUND") && !cleaningUp) {
      cleaningUp = true;

      logger.warn("Limiter settings key missing in Redis; disconnecting orphaned limiter", {
        limiter: key,
      });

      // Only remove from cache if this instance is still the cached one -
      // a newer instance may have already replaced it under this key.
      if (limiterCache.get(key) === limiter) {
        limiterCache.delete(key);
      }

      void disconnectLimiterInstance(limiter, key, "redis-settings-key-not-found");
    }
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
  return getLimiter(`domain:${hostname}`, {
    timeout: DEFAULT_LIMITER_TIMEOUT_MS,
  });
    }
