import { ConnectionOptions } from "bullmq";

const baseRedisOptions: ConnectionOptions = {
  host: process.env.REDIS_HOST as string,
  port: Number(process.env.REDIS_PORT),
  ...(process.env.REDIS_USERNAME && {
    username: process.env.REDIS_USERNAME,
  }),
  ...(process.env.REDIS_PASSWORD && {
    password: process.env.REDIS_PASSWORD,
  }),
};

export const redisConnection: ConnectionOptions =
  process.env.REDIS_TLS === "true"
    ? { ...baseRedisOptions, tls: {} }
    : baseRedisOptions;
