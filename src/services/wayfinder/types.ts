/**
 * Shared types for Wayfinder service modules
 */

import type { Wayfinder } from "@ar.io/wayfinder-core";
import type { WayfinderConfig, ContentRequest } from "../wayfinderTypes";
import { ContentCache } from "./cache";
import { VerificationManager } from "./verification";

/**
 * Core service state interface
 */
export interface WayfinderServiceState {
  wayfinder: Wayfinder | null;
  config: WayfinderConfig;
  cache: ContentCache;
  verificationManager: VerificationManager;
  initialized: boolean;
  initializationPromise: Promise<void> | null;
  eventListeners: Array<{ event: string; handler: (event: unknown) => void }>;
  verificationTimeouts: Map<string, number>;
}

/**
 * Gateway provider factory result
 */
export interface GatewayProviderResult {
  provider: unknown;
  isNetworkProvider: boolean;
}

/**
 * Retry options for requests
 */
export interface RetryOptions {
  attempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
}

/**
 * Response processing options
 */
export interface ProcessingOptions {
  contentType: string;
  preferBlob?: boolean;
}

/**
 * Service initialization options
 */
export interface InitializationOptions {
  skipVerification?: boolean;
  skipTelemetry?: boolean;
}

/**
 * Request context for internal processing
 */
export interface RequestContext extends ContentRequest {
  actualTxId: string;
  isArNS: boolean;
  resolvedUrl?: URL;
}

/**
 * Verification event handler type
 */
export type VerificationEventHandler = (event: any) => void;

/**
 * Size thresholds for content types
 */
export const SIZE_THRESHOLDS = {
  IMAGE: 25 * 1024 * 1024, // 25MB
  VIDEO: 200 * 1024 * 1024, // 200MB
  AUDIO: 50 * 1024 * 1024, // 50MB
  TEXT: 10 * 1024 * 1024, // 10MB
} as const;

/**
 * Default timeout values
 */
export const TIMEOUTS = {
  DEFAULT: 7000, // 7 seconds
  VERIFICATION: 30000, // 30 seconds
  FALLBACK: 5000, // 5 seconds
} as const;

/**
 * Retry configuration
 */
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 5, // Increased from 3 to utilize more gateways
  MAX_VERIFICATION_ATTEMPTS: 2, // Security: limit verification retries to prevent attacks
  BASE_DELAY_MS: 300, // Reduced from 1000ms for faster gateway switching
  GATEWAY_ERROR_DELAY_MS: 100, // Reduced from 500ms for immediate gateway switching
  NETWORK_ERROR_DELAY_MS: 200, // New: fast switching for network errors
  TIMEOUT_DELAY_MS: 150, // New: fast switching for timeouts
  MAX_DELAY_MS: 2000, // Reduced from 5000ms
} as const;