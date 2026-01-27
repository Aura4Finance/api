import { ConnectionOptions } from "bullmq";
import { RedisOptions } from "ioredis";

const baseRedisOptions = {
  host: <string>process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  username: <string>process.env.REDIS_USERNAME,
  password: <string>process.env.REDIS_PASSWORD,
};

export const redisConnection: ConnectionOptions | RedisOptions =
  process.env.REDIS_TLS === "true"
    ? { ...baseRedisOptions, tls: {} }
    : baseRedisOptions;
