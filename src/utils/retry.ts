import { logger } from "./logger";

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param options Retry options
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        logger.error(`All ${maxRetries + 1} attempts failed:`, lastError);
        throw lastError;
      }
      
      const delay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt),
        maxDelayMs
      );
      
      // More user-friendly message for gateway errors
      if (lastError.message.includes("Process qNvAoz") || 
          lastError.message.includes("rate limit")) {
        logger.info(
          `AR.IO network is busy (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`
        );
      } else {
        logger.info(
          `Attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
          { error: lastError.message }
        );
      }
      
      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }
      
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}