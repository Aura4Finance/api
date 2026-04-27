import { STATUS } from "@/constants/status.constant";
import { APIError } from "@/utils/error-handler";

export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

export async function withRequestTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  message = "Request timed out"
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new APIError(message, STATUS.requestTimeout));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}