/**
 * ArNS-specific error types for better error handling
 */

export class ArNSError extends Error {
  readonly code: string;
  
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = 'ArNSError';
  }
}

export class ArNSResolutionError extends ArNSError {
  readonly arnsName: string;
  readonly reason: string;
  readonly httpStatus?: number;
  
  constructor(
    arnsName: string, 
    reason: string,
    httpStatus?: number
  ) {
    super(
      `Failed to resolve ArNS name "${arnsName}": ${reason}`,
      'ARNS_RESOLUTION_FAILED'
    );
    this.arnsName = arnsName;
    this.reason = reason;
    this.httpStatus = httpStatus;
    this.name = 'ArNSResolutionError';
  }
}

export class ArNSTimeoutError extends ArNSError {
  readonly arnsName: string;
  readonly timeoutMs: number;
  
  constructor(arnsName: string, timeoutMs: number) {
    super(
      `ArNS resolution timed out after ${timeoutMs}ms for "${arnsName}"`,
      'ARNS_TIMEOUT'
    );
    this.arnsName = arnsName;
    this.timeoutMs = timeoutMs;
    this.name = 'ArNSTimeoutError';
  }
}

export class ArNSNetworkError extends ArNSError {
  readonly arnsName: string;
  readonly originalError: Error;
  
  constructor(
    arnsName: string,
    originalError: Error
  ) {
    super(
      `Network error while resolving ArNS name "${arnsName}": ${originalError.message}`,
      'ARNS_NETWORK_ERROR'
    );
    this.arnsName = arnsName;
    this.originalError = originalError;
    this.name = 'ArNSNetworkError';
  }
}

export class ArNSInvalidResponseError extends ArNSError {
  readonly arnsName: string;
  readonly reason: string;
  
  constructor(
    arnsName: string,
    reason: string
  ) {
    super(
      `Invalid response while resolving ArNS name "${arnsName}": ${reason}`,
      'ARNS_INVALID_RESPONSE'
    );
    this.arnsName = arnsName;
    this.reason = reason;
    this.name = 'ArNSInvalidResponseError';
  }
}

/**
 * Get user-friendly error message for ArNS errors
 */
export function getArNSErrorMessage(error: unknown): string {
  if (error instanceof ArNSTimeoutError) {
    return 'Request timed out. The ArNS resolver may be slow or unavailable.';
  }
  
  if (error instanceof ArNSResolutionError) {
    if (error.httpStatus === 404) {
      return 'ArNS name not found. It may have been removed or never existed.';
    }
    if (error.httpStatus && error.httpStatus >= 500) {
      return 'ArNS resolver is experiencing issues. Please try again later.';
    }
    return error.reason;
  }
  
  if (error instanceof ArNSNetworkError) {
    return 'Network connection issue. Please check your internet connection.';
  }
  
  if (error instanceof ArNSInvalidResponseError) {
    return 'Received invalid data from ArNS resolver.';
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unknown error occurred while resolving the ArNS name.';
}

/**
 * Check if an error is retryable
 */
export function isRetryableArNSError(error: unknown): boolean {
  if (error instanceof ArNSTimeoutError) {
    return true; // Timeouts are retryable
  }
  
  if (error instanceof ArNSResolutionError) {
    // 5xx errors are retryable, 4xx are not
    return error.httpStatus ? error.httpStatus >= 500 : false;
  }
  
  if (error instanceof ArNSNetworkError) {
    return true; // Network errors are often transient
  }
  
  return false;
}