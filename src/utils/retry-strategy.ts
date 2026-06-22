import { HttpRequestError, isHttpRequestError } from "@/http-client";

const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 60_000;

export function isRetryableError(error: unknown): boolean {
  if (isHttpRequestError(error)) return error.retryable;
  return false;
}

export function getRetryDelayMs(
  attemptsMade: number,
  error?: HttpRequestError
): number {
  if (error?.retryAfterMs && error.retryAfterMs > 0) {
    return Math.min(error.retryAfterMs, MAX_DELAY_MS);
  }

  const exponent = Math.max(0, attemptsMade - 1);
  const baseDelay = Math.min(BASE_DELAY_MS * 2 ** exponent, MAX_DELAY_MS);
  const jitter = Math.floor(Math.random() * baseDelay);
  return Math.max(500, jitter);
}

export function getNextRetryAt(attemptsMade: number, error?: HttpRequestError): Date {
  return new Date(Date.now() + getRetryDelayMs(attemptsMade, error));
}
