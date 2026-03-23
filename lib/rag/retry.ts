export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; baseDelayMs?: number; label?: string }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelayMs ?? 500;
  const label = options?.label ?? "API call";

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxRetries) break;
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 200;
      console.warn(
        `${label} attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
