import { APIError } from "@/utils/error-handler";
import { NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { RedisReply, RedisStore } from "rate-limit-redis";
import RedisClient, { RedisOptions } from "ioredis";
import logger from "@/utils/logger";
import { redisConnection } from "@/config/redis-config";

// ✅ Connect to Redis Cloud using ioredis credentials
export const redisClient = new RedisClient(redisConnection as RedisOptions);

redisClient.on("error", (err) => {
  logger.error("Redis error: ", err);
})

redisClient.on("connect", () => {
  logger.info("Connected to Redis successfully");
})

export const limiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_: Request, __: Response, ___: NextFunction, options: any) => {
    throw new APIError(
      "Too many requests - try again soon",
      options.statusCode
    );
  },
  store: new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redisClient.call(command, ...args) as Promise<RedisReply>,
  }),
});