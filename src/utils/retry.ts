export interface RetryOptions {
  baseMs?: number;
  multiplier?: number;
  maxMs?: number;
  maxAttempts?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { baseMs = 1000, multiplier = 2, maxMs = 60000, maxAttempts = Infinity } = opts;
  let delay = baseMs;
  let attempts = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempts++;
      if (attempts >= maxAttempts) throw err;
      await sleep(delay);
      delay = Math.min(delay * multiplier, maxMs);
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
