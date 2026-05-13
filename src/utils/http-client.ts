import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from "axios";
import Bottleneck from "bottleneck";

export type HttpRequestOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  limiter?: Bottleneck;
  retries?: number;
  retryDelayMs?: number;
};

export type HttpResponse<T> = {
  response: AxiosResponse<T>;
  latencyMs: number;
};

export class HttpRequestError extends Error {
  status: number | undefined;
  code: string | undefined;
  retryable: boolean;
  retryAfterMs: number | undefined;
  responseHeaders: Record<string, string> | undefined;
  responseData: unknown | undefined;
  context: Record<string, unknown> | undefined;

  constructor(params: {
    message: string;
    status: number | undefined;
    code: string | undefined;
    retryable: boolean;
    retryAfterMs: number | undefined;
    responseHeaders: Record<string, string> | undefined;
    responseData: unknown | undefined;
    context: Record<string, unknown> | undefined;
  }) {
    super(params.message);
    this.name = "HttpRequestError";
    this.status = params.status;
    this.code = params.code;
    this.retryable = params.retryable;
    this.retryAfterMs = params.retryAfterMs;
    this.responseHeaders = params.responseHeaders;
    this.responseData = params.responseData;
    this.context = params.context;
  }
}

const DEFAULT_TIMEOUT_MS = 8000;
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
]);

function parseRetryAfterMs(headers?: Record<string, unknown>): number | undefined {
  if (!headers) return undefined;

  const rawHeader = headers["retry-after"] ?? headers["Retry-After"];
  if (rawHeader == null) return undefined;

  const rawValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const value = typeof rawValue === "string" ? rawValue : String(rawValue);
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return undefined;
}

function isRetryableAxiosError(error: AxiosError): boolean {
  if (!error.response) {
    return Boolean(error.code && RETRYABLE_NETWORK_CODES.has(error.code));
  }

  const status = error.response.status;
  if (status === 429) return true;
  return status >= 500 && status < 600;
}

export function normalizeAxiosError(error: AxiosError): HttpRequestError {
  const status = error.response?.status;
  const retryAfterMs = parseRetryAfterMs(error.response?.headers as Record<string, unknown> | undefined);
  const responseHeaders = error.response?.headers
    ? Object.entries(error.response.headers).reduce<Record<string, string>>(
        (acc, [key, value]) => {
          acc[key] = Array.isArray(value) ? String(value[0]) : String(value);
          return acc;
        },
        {}
      )
    : undefined;

  return new HttpRequestError({
    message: error.message,
    retryable: isRetryableAxiosError(error),
    status,
    code: error.code,
    retryAfterMs,
    responseHeaders,
    responseData: error.response?.data,
    context: undefined,
  });
}

export function isHttpRequestError(error: unknown): error is HttpRequestError {
  return error instanceof HttpRequestError;
}

export function toHttpRequestError(error: unknown): HttpRequestError {
  if (isHttpRequestError(error)) return error;
  if (axios.isAxiosError(error)) return normalizeAxiosError(error);

  return new HttpRequestError({
    message: error instanceof Error ? error.message : "Unexpected error",
    retryable: false,
    status: undefined,
    code: undefined,
    retryAfterMs: undefined,
    responseHeaders: undefined,
    responseData: undefined,
    context: undefined,
  });
}

export async function sendHttpRequest<T>(
  client: AxiosInstance,
  config: AxiosRequestConfig,
  options: HttpRequestOptions = {}
): Promise<HttpResponse<T>> {
  const timeoutMs = config.timeout ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = Number.isFinite(options.retries ?? NaN) ? (options.retries as number) : 2;
  const baseDelay = options.retryDelayMs ?? 200;

  const start = Date.now();

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  for (let attempt = 0; attempt <= retries; attempt++) {
    // If an external signal was already aborted, stop retrying.
    if (options.signal?.aborted) {
      throw new HttpRequestError({
        message: "Request aborted",
        retryable: false,
        status: undefined,
        code: "ERR_CANCELED",
        retryAfterMs: undefined,
        responseHeaders: undefined,
        responseData: undefined,
        context: undefined,
      });
    }

    // Only create an AbortController when there's no external signal and no limiter.
    const shouldUseAbortController = !options.signal && !options.limiter;
    const controller = shouldUseAbortController ? new AbortController() : null;
    const signal = options.signal ?? controller?.signal;

    let timeoutId: NodeJS.Timeout | undefined;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    const requestConfig: AxiosRequestConfig = {
      ...config,
      timeout: timeoutMs,
      ...(signal ? { signal } : {}),
    };

    try {
      const execute = () => client.request<T>(requestConfig);
      const response = options.limiter ? await options.limiter.schedule(execute) : await execute();
      return {
        response,
        latencyMs: Date.now() - start,
      };
    } catch (rawError) {
      const error = toHttpRequestError(rawError);

      // If not retryable or we've exhausted attempts, throw the error.
      const isLastAttempt = attempt === retries;
      if (!error.retryable || isLastAttempt) {
        throw error;
      }

      // Otherwise wait with exponential backoff + jitter and retry.
      const backoff = baseDelay * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 100);
      const wait = backoff + jitter;

      if (timeoutId) clearTimeout(timeoutId);
      await sleep(wait);
      // continue to next attempt
    } finally {
      // ensure we clear timeout for this attempt
      // (if it's already cleared above, clearTimeout is a no-op)
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      undefined;
    }
  }

  // Should never reach here, but satisfy TS return expectation.
  throw new HttpRequestError({
    message: "Unexpected error",
    retryable: false,
    status: undefined,
    code: undefined,
    retryAfterMs: undefined,
    responseHeaders: undefined,
    responseData: undefined,
    context: undefined,
  });
}

export function createHttpClient(
  client: AxiosInstance,
  defaults: Omit<HttpRequestOptions, "signal"> = {}
) {
  return {
    request: async <T>(
      config: AxiosRequestConfig,
      options: HttpRequestOptions = {}
    ): Promise<AxiosResponse<T>> => {
      const { response } = await sendHttpRequest<T>(client, config, {
        ...defaults,
        ...options,
      });
      return response;
    },
    requestWithLatency: async <T>(
      config: AxiosRequestConfig,
      options: HttpRequestOptions = {}
    ): Promise<HttpResponse<T>> =>
      sendHttpRequest<T>(client, config, { ...defaults, ...options }),
    get: async <T>(
      url: string,
      config: AxiosRequestConfig = {},
      options: HttpRequestOptions = {}
    ): Promise<AxiosResponse<T>> =>
      (
        await sendHttpRequest<T>(client, { ...config, method: "GET", url }, {
          ...defaults,
          ...options,
        })
      ).response,
    post: async <T>(
      url: string,
      data?: unknown,
      config: AxiosRequestConfig = {},
      options: HttpRequestOptions = {}
    ): Promise<AxiosResponse<T>> =>
      (
        await sendHttpRequest<T>(client, { ...config, method: "POST", url, data }, {
          ...defaults,
          ...options,
        })
      ).response,
  };
}
