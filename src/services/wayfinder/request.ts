/**
 * Request handling and retry logic for Wayfinder service
 */

import type { Wayfinder } from "@ar.io/wayfinder-core";
import { logger } from "../../utils/logger";
import type { 
  ContentRequest, 
  ContentResponse,
  WayfinderConfig
} from "../wayfinderTypes";
import type { RequestContext, RetryOptions } from "./types";
import { RETRY_CONFIG, TIMEOUTS } from "./types";
import { 
  fetchWithTimeout, 
  extractGatewayFromUrl, 
  processResponseData,
  isArNSUrl,
  calculateBackoffDelay
} from "./utils";
import { ContentCache } from "./cache";
import { VerificationManager } from "./verification";
import { 
  classifyError as classifyWayfinderError,
  GatewayError,
  VerificationError,
  InitializationError,
  WayfinderError,
  WayfinderErrorTypes
} from "./errors";
import type { WayfinderErrorType } from "./errors";

/**
 * Simple circuit breaker for failed gateways
 */
class GatewayCircuitBreaker {
  private failedGateways = new Map<string, number>();
  private attemptedGateways = new Set<string>();
  private readonly FAILURE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
  
  /**
   * Record a gateway attempt
   */
  recordAttempt(gatewayUrl: string): void {
    const gateway = this.extractGatewayHost(gatewayUrl);
    this.attemptedGateways.add(gateway);
  }
  
  /**
   * Get list of attempted gateways
   */
  getAttemptedGateways(): string[] {
    return Array.from(this.attemptedGateways);
  }
  
  /**
   * Clear attempted gateways
   */
  clearAttemptedGateways(): void {
    this.attemptedGateways.clear();
  }
  
  /**
   * Record a gateway failure
   */
  recordFailure(gatewayUrl: string): void {
    const gateway = this.extractGatewayHost(gatewayUrl);
    this.failedGateways.set(gateway, Date.now());
    this.attemptedGateways.add(gateway);
    logger.debug(`[Circuit Breaker] Recorded failure for gateway: ${gateway}`);
  }
  
  /**
   * Check if a gateway is currently failed
   */
  isGatewayFailed(gatewayUrl: string): boolean {
    const gateway = this.extractGatewayHost(gatewayUrl);
    const failTime = this.failedGateways.get(gateway);
    
    if (!failTime) return false;
    
    // Check if failure is still within the window
    const isStillFailed = (Date.now() - failTime) < this.FAILURE_WINDOW_MS;
    
    if (!isStillFailed) {
      this.failedGateways.delete(gateway);
      logger.debug(`[Circuit Breaker] Gateway recovered: ${gateway}`);
    }
    
    return isStillFailed;
  }
  
  private extractGatewayHost(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
  
  /**
   * Clear all failed gateways (for testing or manual recovery)
   */
  reset(): void {
    this.failedGateways.clear();
    logger.info("[Circuit Breaker] Reset all gateway failures");
  }
}

// Global circuit breaker instance
const gatewayCircuitBreaker = new GatewayCircuitBreaker();

// Export for manual control if needed
export { gatewayCircuitBreaker };

/**
 * Request handler configuration
 */
interface RequestHandlerConfig {
  wayfinder: Wayfinder | null;
  config: WayfinderConfig;
  cache: ContentCache;
  verificationManager: VerificationManager;
  setupVerificationTimeout: (txId: string) => void;
}

/**
 * Get error type for retry strategy
 */
function getErrorTypeForRetry(error: WayfinderError): WayfinderErrorType {
  // Protocol errors should be treated as gateway errors for retry purposes
  const errorMessage = error.message.toLowerCase();
  if (errorMessage.includes('protocol_error') || errorMessage.includes('http2') || 
      errorMessage.includes('ssl') || errorMessage.includes('tls')) {
    return WayfinderErrorTypes.GATEWAY_ERROR;
  }
  
  return error.type;
}

/**
 * Get appropriate delay for error type
 */
function getDelayForErrorType(errorType: WayfinderErrorType): number {
  switch (errorType) {
    case WayfinderErrorTypes.GATEWAY_ERROR:
      return RETRY_CONFIG.GATEWAY_ERROR_DELAY_MS; // 100ms - immediate switch
    case WayfinderErrorTypes.NETWORK_ERROR:
      return RETRY_CONFIG.NETWORK_ERROR_DELAY_MS; // 200ms - quick switch
    case WayfinderErrorTypes.TIMEOUT_ERROR:
      return RETRY_CONFIG.TIMEOUT_DELAY_MS; // 150ms - fast switch
    case WayfinderErrorTypes.VERIFICATION_ERROR:
      // Verification errors should not retry with different gateways
      return RETRY_CONFIG.BASE_DELAY_MS * 2; // 600ms - slower retry
    default:
      return RETRY_CONFIG.BASE_DELAY_MS; // 300ms - standard delay
  }
}

/**
 * Creates request context from content request
 */
export function createRequestContext(request: ContentRequest): RequestContext {
  const isArNS = isArNSUrl(request.txId);
  const actualTxId = isArNS ? request.txId : request.txId;
  
  return {
    ...request,
    actualTxId,
    isArNS
  };
}

/**
 * Fetch with Wayfinder-aware retry logic
 * 
 * Automatically retries on ALL errors with different strategies:
 * - Gateway errors (502/503/504) - Quick retry with 500ms base delay
 * - Network errors - Standard retry with 1s base delay
 * - Timeout errors - Standard retry with 1s base delay
 * 
 * Uses different gateways on each retry via Wayfinder's resolveUrl
 */
export async function fetchWithWayfinderRetry(
  request: ContentRequest,
  handler: RequestHandlerConfig,
  options: RetryOptions = {}
): Promise<ContentResponse> {
  const {
    attempts = RETRY_CONFIG.MAX_ATTEMPTS,
    timeoutMs = TIMEOUTS.DEFAULT
  } = options;

  let lastError: Error | null = null;
  let verificationAttempts = 0;

  // Clear previous attempts for this request
  gatewayCircuitBreaker.clearAttemptedGateways();

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      if (!handler.config.verification.enabled) {
        return await fetchWithoutVerification(request, handler, timeoutMs);
      } else {
        verificationAttempts++;
        return await fetchWithVerification(request, handler);
      }
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Gateway attempt ${attempt + 1} failed:`, error);
      
      // Classify error using proper error classification
      const classifiedError = classifyWayfinderError(error);
      const errorType = getErrorTypeForRetry(classifiedError);
      
      // Record gateway failure in circuit breaker for future avoidance
      if (request.txId) {
        // We don't have the actual gateway URL here, but the circuit breaker
        // will be used in future resolveUrl calls to avoid problematic gateways
        logger.debug(`[Circuit Breaker] Recording failure type: ${errorType}`);
      }
      
      // Update verification status based on error type
      if (classifiedError instanceof VerificationError) {
        // Verification errors are final - don't retry
        handler.verificationManager.setStatus(request.txId, {
          txId: request.txId,
          status: 'failed',
          error: classifiedError.message,
          timestamp: Date.now()
        });
        throw classifiedError;
      }
      
      // Enforce verification attempt limits
      if (handler.config.verification.enabled && verificationAttempts >= RETRY_CONFIG.MAX_VERIFICATION_ATTEMPTS) {
        logger.warn(`[Security] Maximum verification attempts (${RETRY_CONFIG.MAX_VERIFICATION_ATTEMPTS}) reached for ${request.txId}`);
        handler.verificationManager.setStatus(request.txId, {
          txId: request.txId,
          status: 'failed',
          error: 'Maximum verification attempts exceeded',
          timestamp: Date.now()
        });
        throw new VerificationError('Content verification failed after maximum attempts');
      }
      
      // Don't retry on the last attempt
      if (attempt < attempts - 1) {
        // Use different delays based on error type for optimal gateway switching
        const baseDelay = getDelayForErrorType(errorType);
        const delay = calculateBackoffDelay(attempt, baseDelay, RETRY_CONFIG.MAX_DELAY_MS);
        
        logger.info(`[Gateway Retry] ${errorType} detected, switching to different gateway (attempt ${attempt + 2}/${attempts}) after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // On final attempt, properly classify and throw the error
        throw classifiedError;
      }
    }
  }

  // Provide user-friendly error message based on error type
  const maxAttempts = options.attempts || RETRY_CONFIG.MAX_ATTEMPTS;
  const attemptedGateways = gatewayCircuitBreaker.getAttemptedGateways();
  
  if (lastError instanceof WayfinderError) {
    // Already classified, just re-throw with context and attempted gateways
    lastError.message = `Failed after ${maxAttempts} attempts: ${lastError.message}`;
    lastError.attemptedGateways = attemptedGateways;
    throw lastError;
  }
  
  // Shouldn't reach here, but handle it gracefully
  const errorMsg = lastError ? 
    `Failed to load content after trying ${maxAttempts} different gateways. ${lastError.message}` :
    `Failed to load content after trying ${maxAttempts} different gateways`;
  
  const classifiedError = classifyWayfinderError(new Error(errorMsg));
  if (classifiedError instanceof WayfinderError) {
    classifiedError.attemptedGateways = attemptedGateways;
  }
  throw classifiedError;
}

/**
 * Fetch without verification (routing only)
 */
async function fetchWithoutVerification(
  request: ContentRequest,
  handler: RequestHandlerConfig,
  timeoutMs: number
): Promise<ContentResponse> {
  const context = createRequestContext(request);
  
  // Handle ArNS URLs differently from transaction IDs
  let resolvedUrl: URL;
  if (context.isArNS) {
    // For ArNS URLs, use them directly instead of AR protocol
    resolvedUrl = new URL(request.txId + (request.path || ''));
  } else {
    // Use Wayfinder's resolveUrl for transaction IDs
    const arUrl = `ar://${request.txId}${request.path || ''}`;
    if (!handler.wayfinder) {
      throw new InitializationError('Wayfinder not initialized');
    }
    resolvedUrl = await handler.wayfinder.resolveUrl({ originalUrl: arUrl });
  }
  const gatewayUrl = resolvedUrl;
  
  logger.info(`[Content Loading] Fetching from gateway: ${gatewayUrl}`);
  
  // Record the attempt
  gatewayCircuitBreaker.recordAttempt(gatewayUrl.toString());
  
  // Fetch with timeout
  let response: Response;
  try {
    response = await fetchWithTimeout(gatewayUrl.toString(), timeoutMs);
    logger.info(`Gateway response: status=${response.status}, ok=${response.ok}, gateway=${gatewayUrl}`);
  } catch (fetchError) {
    // Record fetch failure in circuit breaker
    gatewayCircuitBreaker.recordFailure(gatewayUrl.toString());
    // Classify and throw the error
    throw classifyWayfinderError(fetchError);
  }
  
  if (response.ok) {
    const gateway = extractGatewayFromUrl(gatewayUrl.toString());
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const data = await processResponseData(response, { contentType });
    
    // Cache the successful response
    handler.cache.cacheUrl(request.txId, request.path || "", gatewayUrl.toString(), gateway);
    handler.cache.cacheContent(request.txId, request.path || "", {
      url: gatewayUrl.toString(),
      gateway,
      data,
      contentType,
      verified: false,
      verificationStatus: handler.verificationManager.getStatus(request.txId),
      timestamp: Date.now(),
      size: data.size
    });
    
    return {
      url: gatewayUrl.toString(),
      gateway,
      data,
      verified: false,
      verificationStatus: handler.verificationManager.getStatus(request.txId),
      contentType,
      fromCache: false,
    };
  } else {
    // Response not OK - record failure and throw to trigger retry
    gatewayCircuitBreaker.recordFailure(gatewayUrl.toString());
    logger.warn(`Gateway returned non-OK response: status=${response.status}, statusText=${response.statusText}, gateway=${gatewayUrl}`);
    throw new GatewayError(`Gateway returned ${response.status}: ${response.statusText}`);
  }
}

/**
 * Fetch content via Wayfinder with verification
 */
async function fetchWithVerification(
  request: ContentRequest,
  handler: RequestHandlerConfig
): Promise<ContentResponse> {
  const { txId, path = "" } = request;
  const context = createRequestContext(request);
  
  // Handle ArNS URLs vs transaction IDs
  let requestUrl: string;
  let actualTxId: string;
  
  if (context.isArNS) {
    // For ArNS URLs, we can't use AR protocol, so use direct URL
    requestUrl = txId; // The txId is actually the full URL for ArNS
    actualTxId = txId;
    logger.info(`[ArNS Content] Using direct URL for verification: ${requestUrl}`);
  } else {
    // Regular transaction ID - use AR protocol
    requestUrl = `ar://${txId}${path}`;
    actualTxId = txId;
  }

  logger.info(
    `[Content Loading] Fetching verified content via Wayfinder: ${
      context.isArNS ? 'ArNS URL' : `txId: ${actualTxId}`
    }`
  );

  // Mark as verifying
  handler.verificationManager.setStatus(actualTxId, {
    txId: actualTxId,
    status: "verifying",
    timestamp: Date.now(),
    progress: {
      processedBytes: 0,
      totalBytes: 0,
      percentage: 0,
      stage: 'routing'
    }
  });

  handler.verificationManager.handleEvent({
    type: "verification-started",
    txId: actualTxId,
    timestamp: Date.now(),
  });

  // Set up verification timeout
  handler.setupVerificationTimeout(actualTxId);

  if (!handler.wayfinder) {
    throw new InitializationError('Wayfinder not initialized');
  }

  // Make the request via Wayfinder
  const response = await handler.wayfinder.request(requestUrl);

  const wayfinderResponse = response;
  logger.info(
    `Wayfinder response status: ${wayfinderResponse.status} for ${actualTxId}`
  );

  if (!wayfinderResponse.ok) {
    throw new GatewayError(
      `Wayfinder request failed: ${wayfinderResponse.status} ${wayfinderResponse.statusText}`
    );
  }

  // In verification mode, we already have the data - we just need to know which gateway was used
  // The gateway info comes from the routing-succeeded event stored in verification status
  const verificationStatus = handler.verificationManager.getStatus(actualTxId);
  const selectedGateway = verificationStatus.gateway;
  
  // For display purposes, we need a gateway URL
  // In verification mode, this is just for showing the user which gateway was used
  let gatewayUrl: string;
  let displayGateway: string;
  
  if (selectedGateway) {
    // Use the gateway that was actually selected by the routing strategy
    displayGateway = selectedGateway;
    const gatewayBase = selectedGateway.endsWith('/') ? selectedGateway.slice(0, -1) : selectedGateway;
    gatewayUrl = `${gatewayBase}/${actualTxId}${path || ''}`;
  } else {
    // This shouldn't happen, but provide a fallback
    logger.warn(`No gateway information available from routing for ${txId}`);
    displayGateway = 'Unknown gateway';
    gatewayUrl = `https://arweave.net/${actualTxId}${path || ''}`;
  }
  
  // Use the display gateway if available, otherwise extract from URL
  const gateway = displayGateway || extractGatewayFromUrl(gatewayUrl);
  const contentType =
    response.headers.get("content-type") || "application/octet-stream";

  // Handle content based on type
  const data = await processResponseData(response, { contentType });

  // Get verification status once to ensure consistency
  const currentVerificationStatus = handler.verificationManager.getStatus(actualTxId);
  const isVerified = currentVerificationStatus.status === "verified";
  const isFinalState = currentVerificationStatus.status === "verified" || 
                       currentVerificationStatus.status === "failed" ||
                       currentVerificationStatus.status === "not-verified";

  // Always cache the URL for quick access
  handler.cache.cacheUrl(txId, path || "", gatewayUrl, gateway);
  
  // Only cache content if verification is in a final state
  // This prevents caching content with "verifying" status
  if (isFinalState) {
    handler.cache.cacheContent(txId, path || "", {
      url: gatewayUrl,
      gateway,
      data,
      contentType,
      verified: isVerified,
      verificationStatus: currentVerificationStatus,
      timestamp: Date.now(),
      size: data.size
    });
  } else {
    logger.debug(`Skipping content cache for ${txId} - verification still in progress`);
  }

  const result = {
    url: gatewayUrl,
    gateway,
    verified: isVerified,
    verificationStatus: currentVerificationStatus,
    contentType,
    data,
    fromCache: false,
  };
  
  logger.debug(`fetchWithVerification returning:`, {
    url: result.url,
    gateway: result.gateway,
    hasData: !!result.data,
    dataSize: result.data?.size,
    contentType: result.contentType
  });
  
  return result;
}