/**
 * Utility functions for Wayfinder service
 */

import { logger } from "../../utils/logger";
import { TimeoutError } from "./errors";
import type { ProcessingOptions } from "./types";
import { TIMEOUTS, SIZE_THRESHOLDS } from "./types";

/**
 * Performs a fetch with timeout protection
 */
export async function fetchWithTimeout(url: string, timeoutMs: number = TIMEOUTS.DEFAULT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Extracts gateway hostname from a URL
 */
export function extractGatewayFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.origin;
  } catch (_error) {
    // Fallback for invalid URLs
    const match = url.match(/https?:\/\/[^/]+/);
    return match ? match[0] : url;
  }
}

/**
 * Processes response data based on content type
 */
export async function processResponseData(
  response: Response, 
  options: ProcessingOptions
): Promise<Blob> {
  const { contentType, preferBlob = false } = options;

  // Always return blob for binary content types
  if (
    preferBlob ||
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/") ||
    contentType === "application/pdf" ||
    contentType.includes("octet-stream")
  ) {
    return await response.blob();
  } else if (contentType.startsWith("application/json")) {
    const jsonData = await response.json();
    return new Blob([JSON.stringify(jsonData)], { type: contentType });
  } else {
    const textData = await response.text();
    return new Blob([textData], { type: contentType });
  }
}

/**
 * Checks if content should be automatically fetched based on size and type
 */
export function shouldAutoFetch(contentType: string, size: number, thresholds = SIZE_THRESHOLDS): boolean {
  if (contentType.startsWith("image/") && size > thresholds.IMAGE) return false;
  if (contentType.startsWith("video/") && size > thresholds.VIDEO) return false;
  if (contentType.startsWith("audio/") && size > thresholds.AUDIO) return false;
  if (contentType.startsWith("text/") && size > thresholds.TEXT) return false;
  return true;
}

/**
 * Creates a gateway URL for a transaction
 */
export function createGatewayUrl(gateway: string, txId: string, path?: string): string {
  const baseUrl = gateway.endsWith('/') ? gateway.slice(0, -1) : gateway;
  const pathSegment = path ? `/${path}` : '';
  return `${baseUrl}/${txId}${pathSegment}`;
}

/**
 * Determines if a URL is an ArNS URL
 */
export function isArNSUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Validates a gateway URL
 */
export function isValidGatewayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      !parsed.hostname.includes('undefined') &&
      !parsed.hostname.includes('localhost')
    );
  } catch (_error) {
    return false;
  }
}

/**
 * Calculates exponential backoff delay
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const delay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.1 * delay; // 10% jitter
  return Math.min(delay + jitter, maxDelayMs);
}

/**
 * Safe JSON parsing with error handling
 */
export function safeJsonParse<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text);
  } catch (error) {
    logger.warn('Failed to parse JSON:', error);
    return null;
  }
}

// Re-export SIZE_THRESHOLDS for backward compatibility
export { SIZE_THRESHOLDS } from "./types";