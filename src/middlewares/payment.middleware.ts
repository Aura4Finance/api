import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { APIError } from "@/utils/error-handler";
import logger from "@/utils/logger";
import { redisClient } from "@/middlewares/rate-limit.middleware";
import { NextFunction, Request, Response } from "express";
import crypto from "crypto";

type PaymentIdempotencyStatus = "pending" | "complete" | "failed";

interface StoredPaymentResponse {
  statusCode: number;
  body: unknown;
}

interface PaymentIdempotencyRecord {
  txRef: string;
  requestHash: string;
  response?: StoredPaymentResponse;
  status: PaymentIdempotencyStatus;
  timestamp: string;
}

interface RedisReplyTuple extends Array<number> {
  0: number;
  1: number;
}

const PAYMENT_RATE_LIMIT_WINDOW_MS = Number(
  process.env.PAYMENT_RATE_LIMIT_WINDOW_MS ?? 10_000
);
const PAYMENT_RATE_LIMIT_MAX_REQUESTS = Number(
  process.env.PAYMENT_RATE_LIMIT_MAX_REQUESTS ?? 50
);
const PAYMENT_IDEMPOTENCY_TTL_SECONDS = Number(
  process.env.PAYMENT_IDEMPOTENCY_TTL_SECONDS ?? 60 * 60 * 24
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPaymentIdempotencyRecord(value: unknown): value is PaymentIdempotencyRecord {
  if (!isRecord(value)) {
    return false;
  }

  const { txRef, requestHash, response, status, timestamp } = value;

  const validResponse =
    response === undefined ||
    (isRecord(response) &&
      typeof response.statusCode === "number" &&
      Object.prototype.hasOwnProperty.call(response, "body"));

  return (
    typeof txRef === "string" &&
    typeof requestHash === "string" &&
    (status === "pending" || status === "complete" || status === "failed") &&
    typeof timestamp === "string" &&
    validResponse
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (isRecord(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }

  return value;
}

function hashRequestBody(body: unknown): string {
  const normalizedBody = canonicalize(body);
  return crypto.createHash("sha256").update(JSON.stringify(normalizedBody)).digest("hex");
}

function extractTxRef(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  const value = body.txRef;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getHeaderValue(value: Request["headers"][string]): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildIdempotencyKey(merchantId: string, txRef: string): string {
  return `payment:idempotency:${merchantId}:${txRef}`;
}

function buildRateLimitKey(prefix: string, dimension: string): string {
  return `payment:rate-limit:${prefix}:${dimension}`;
}

async function readIdempotencyRecord(redisKey: string): Promise<PaymentIdempotencyRecord | null> {
  const rawRecord = await redisClient.get(redisKey);

  if (!rawRecord) {
    return null;
  }

  try {
    const parsedRecord: unknown = JSON.parse(rawRecord);
    if (isPaymentIdempotencyRecord(parsedRecord)) {
      return parsedRecord;
    }
  } catch {
    // fall through to cleanup below
  }

  await redisClient.del(redisKey);
  return null;
}

async function persistIdempotencyRecord(
  redisKey: string,
  record: PaymentIdempotencyRecord,
  ttlSeconds: number
): Promise<void> {
  await redisClient.set(redisKey, JSON.stringify(record), "EX", ttlSeconds);
}

function replayCachedResponse(res: Response, record: PaymentIdempotencyRecord): void {
  if (!record.response) {
    throw new APIError("Cached idempotency response is unavailable.", STATUS.serverError);
  }

  res.status(record.response.statusCode).json(record.response.body);
}

function handleExistingRecord(
  res: Response,
  record: PaymentIdempotencyRecord,
  requestHash: string
): void {
  if (record.requestHash !== requestHash) {
    throw new APIError(
      "Request body does not match the original request for this txRef.",
      STATUS.unprocessableEntity
    );
  }

  if (record.status === "pending") {
    throw new APIError("Request is still being processed", STATUS.conflict);
  }

  replayCachedResponse(res, record);
}

const SLIDING_WINDOW_SCRIPT = `
local windowMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local nowMs = tonumber(ARGV[3])
local member = ARGV[4]
local retryAfterMs = 0

for i = 1, #KEYS do
  local key = KEYS[i]
  redis.call("ZREMRANGEBYSCORE", key, 0, nowMs - windowMs)
  local currentCount = redis.call("ZCARD", key)

  if currentCount >= limit then
    local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
    local oldestScore = tonumber(oldest[2]) or nowMs
    local remainingMs = oldestScore + windowMs - nowMs

    if remainingMs > retryAfterMs then
      retryAfterMs = remainingMs
    end
  end
end

if retryAfterMs > 0 then
  return {0, math.ceil(retryAfterMs / 1000)}
end

for i = 1, #KEYS do
  local key = KEYS[i]
  redis.call("ZADD", key, nowMs, member)
  redis.call("PEXPIRE", key, windowMs)
end

return {1, 0}
`;

async function checkSlidingWindowLimit(
  keys: string[],
  windowMs: number,
  limit: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const nowMs = Date.now();
  const member = `${nowMs}:${crypto.randomUUID()}`;

  const result = (await redisClient.eval(
    SLIDING_WINDOW_SCRIPT,
    keys.length,
    ...keys,
    String(windowMs),
    String(limit),
    String(nowMs),
    member
  )) as RedisReplyTuple;

  return {
    allowed: Number(result[0]) === 1,
    retryAfterSeconds: Number(result[1]) || 0,
  };
}

export async function paymentCreationRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = getHeaderValue(req.headers["x-api-key"]);
  const merchantDimension = apiKey ?? "missing-api-key";
  const ipDimension = req.ip || "unknown-ip";

  try {
    const { allowed, retryAfterSeconds } = await checkSlidingWindowLimit(
      [
        buildRateLimitKey("merchant", merchantDimension),
        buildRateLimitKey("ip", ipDimension),
      ],
      PAYMENT_RATE_LIMIT_WINDOW_MS,
      PAYMENT_RATE_LIMIT_MAX_REQUESTS
    );

    if (!allowed) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(STATUS.tooManyRequests).json({
        success: false,
        message: "Too many payment requests. Please retry later.",
      });
      return;
    }

    next();
  } catch (error: unknown) {
    logger.error("Failed to evaluate payment rate limit", {
      error: String(error),
    });
    throw new APIError("Unable to evaluate payment rate limit.", STATUS.serverUnavailable);
  }
}

export async function paymentIdempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const request = req as RequestAuth;
  const merchantId = request.user?.businessProfile?.id;

  if (!merchantId) {
    throw new APIError("Merchant profile not found.", STATUS.notFound);
  }

  const requestBody: unknown = req.body;
  if (!isRecord(requestBody)) {
    throw new APIError("Request body must be a valid JSON object.", STATUS.bad);
  }

  const txRef = extractTxRef(requestBody);
  if (!txRef) {
    throw new APIError("txRef is required for payment creation.", STATUS.bad);
  }

  const requestHash = hashRequestBody(requestBody);
  const redisKey = buildIdempotencyKey(merchantId, txRef);
  const existingRecord = await readIdempotencyRecord(redisKey);

  if (existingRecord) {
    handleExistingRecord(res, existingRecord, requestHash);
    return;
  }

  const pendingRecord: PaymentIdempotencyRecord = {
    txRef,
    requestHash,
    status: "pending",
    timestamp: new Date().toISOString(),
  };

  const claimSucceeded = await redisClient.set(
    redisKey,
    JSON.stringify(pendingRecord),
    "EX",
    PAYMENT_IDEMPOTENCY_TTL_SECONDS,
    "NX"
  );

  if (claimSucceeded !== "OK") {
    const competingRecord = await readIdempotencyRecord(redisKey);
    if (competingRecord) {
      handleExistingRecord(res, competingRecord, requestHash);
      return;
    }

    throw new APIError("Request is still being processed", STATUS.conflict);
  }

  const response = res as Response & { json: (body?: unknown) => Response };
  const originalJson = response.json.bind(response) as (body?: unknown) => Response;

  response.json = ((body?: unknown) => {
    const finalStatus: PaymentIdempotencyStatus =
      response.statusCode >= 200 && response.statusCode < 400 ? "complete" : "failed";

    const finalRecord: PaymentIdempotencyRecord = {
      txRef,
      requestHash,
      response: {
        statusCode: response.statusCode,
        body,
      },
      status: finalStatus,
      timestamp: new Date().toISOString(),
    };

    void persistIdempotencyRecord(redisKey, finalRecord, PAYMENT_IDEMPOTENCY_TTL_SECONDS).catch(
      (error: unknown) => {
        logger.error("Failed to persist payment idempotency record", {
          redisKey,
          error: String(error),
        });
      }
    );

    return originalJson(body);
  }) as typeof response.json;

  next();
}