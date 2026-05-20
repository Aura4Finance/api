import { APIError } from "@/utils/error-handler";
import { NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { RedisReply, RedisStore } from "rate-limit-redis";
import { redisClient } from "@/config/redis-config";

export const limiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_: Request, __: Response, ___: NextFunction, options: any) => {
    throw new APIError(
      "Too many requests. Please wait a moment and try again.",
      options.statusCode
    );
  },
  store: new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redisClient.call(command, ...args) as Promise<RedisReply>,
  }),
});