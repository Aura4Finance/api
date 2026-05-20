import logger from "@/utils/logger";
import { ConnectionOptions } from "bullmq";
import RedisClient from "ioredis";

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

const redisConnectionOptions: ConnectionOptions =
process.env.REDIS_TLS === "true"
? { ...baseRedisOptions, tls: {} }
: baseRedisOptions;

export const redisClient = new RedisClient(redisConnectionOptions);
redisClient.on("error", (err) => {
  logger.error("Redis error: ", err);
})

redisClient.on("connect", () => {
  logger.info("Connected to Redis successfully");
})
