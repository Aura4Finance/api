import Bottleneck from "bottleneck";
import { redisConnection } from "@/config/redis-config";

const limiterCache = new Map<string, Bottleneck>();

function buildRedisOptions(): Record<string, unknown> {
  return { ...redisConnection } as Record<string, unknown>;
}

export function getLimiter(
  key: string,
  options: Partial<Bottleneck.ConstructorOptions> = {}
) {
  if (limiterCache.has(key)) return limiterCache.get(key)!;

  const limiter = new Bottleneck({
    id: `limiter:${key}`,
    datastore: "ioredis",
    clientOptions: buildRedisOptions(),
    maxConcurrent: 3,
    minTime: 200,
    ...options,
  });

  limiterCache.set(key, limiter);
  return limiter;
}

export function getLimiterForUrl(url: string) {
  const hostname = new URL(url).hostname;
  return getLimiter(`domain:${hostname}`);
}
