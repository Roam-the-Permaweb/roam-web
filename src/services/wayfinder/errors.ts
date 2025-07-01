/**
 * Custom error types for Wayfinder integration
 */

export const WayfinderErrorType = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  GATEWAY_ERROR: 'GATEWAY_ERROR',
  VERIFICATION_ERROR: 'VERIFICATION_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  INITIALIZATION_ERROR: 'INITIALIZATION_ERROR',
} as const

export type WayfinderErrorType = typeof WayfinderErrorType[keyof typeof WayfinderErrorType]

export class WayfinderError extends Error {
  type: WayfinderErrorType
  originalError?: unknown

  constructor(
    type: WayfinderErrorType,
    message: string,
    originalError?: unknown
  ) {
    super(message)
    this.type = type
    this.originalError = originalError
    this.name = 'WayfinderError'
  }
}

export class NetworkError extends WayfinderError {
  constructor(message: string, originalError?: unknown) {
    super(WayfinderErrorType.NETWORK_ERROR, message, originalError)
    this.name = 'NetworkError'
  }
}

export class GatewayError extends WayfinderError {
  constructor(message: string, originalError?: unknown) {
    super(WayfinderErrorType.GATEWAY_ERROR, message, originalError)
    this.name = 'GatewayError'
  }
}

export class VerificationError extends WayfinderError {
  constructor(message: string, originalError?: unknown) {
    super(WayfinderErrorType.VERIFICATION_ERROR, message, originalError)
    this.name = 'VerificationError'
  }
}

export class TimeoutError extends WayfinderError {
  constructor(message: string, originalError?: unknown) {
    super(WayfinderErrorType.TIMEOUT_ERROR, message, originalError)
    this.name = 'TimeoutError'
  }
}

export class ConfigurationError extends WayfinderError {
  constructor(message: string, originalError?: unknown) {
    super(WayfinderErrorType.CONFIGURATION_ERROR, message, originalError)
    this.name = 'ConfigurationError'
  }
}

export class InitializationError extends WayfinderError {
  constructor(message: string, originalError?: unknown) {
    super(WayfinderErrorType.INITIALIZATION_ERROR, message, originalError)
    this.name = 'InitializationError'
  }
}

/**
 * Classify error based on error message or type
 */
export function classifyError(error: unknown): WayfinderError {
  if (error instanceof WayfinderError) {
    return error
  }

  const message = error instanceof Error ? error.message : String(error)
  
  // Network/connectivity errors
  if (
    message.includes('Network') ||
    message.includes('Failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('ERR_NETWORK')
  ) {
    return new NetworkError('Network connection failed', error)
  }

  // Gateway-specific errors
  if (
    message.includes('Process qNvAoz') || // AR.IO process error
    message.includes('rate limit') ||
    message.includes('CU') || // Compute Unit errors
    message.includes('gateway') ||
    message.includes('Failed to get') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  ) {
    return new GatewayError('Gateway service unavailable', error)
  }

  // Timeout errors
  if (
    message.includes('timeout') ||
    message.includes('Timeout') ||
    message.includes('timed out')
  ) {
    return new TimeoutError('Request timed out', error)
  }

  // Verification errors
  if (
    message.includes('verification') ||
    message.includes('Verification') ||
    message.includes('hash mismatch') ||
    message.includes('integrity')
  ) {
    return new VerificationError('Content verification failed', error)
  }

  // Default to gateway error for unknown errors
  return new GatewayError('Unknown gateway error', error)
}