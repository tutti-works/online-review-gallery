type RetryOptions = {
  retries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  onRetry?: (error: unknown, attempt: number, nextDelayMs: number) => void;
  shouldRetry?: (error: unknown) => boolean;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetries<T>(
  task: (attempt: number) => Promise<T>,
  {
    retries = 2,
    initialDelayMs = 400,
    backoffFactor = 1.8,
    onRetry,
    shouldRetry,
  }: RetryOptions = {},
): Promise<T> {
  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await task(attempt);
    } catch (error) {
      const canRetry = attempt < retries && (shouldRetry ? shouldRetry(error) : true);
      if (!canRetry) {
        throw error;
      }
      attempt += 1;
      onRetry?.(error, attempt, delay);
      if (delay > 0) {
        await sleep(delay);
        delay *= backoffFactor;
      }
    }
  }
}
