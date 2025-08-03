/**
 * Simplified Wayfinder Service with modular architecture
 */

import {
  Wayfinder,
  type WayfinderVerificationEventArgs,
} from "@ar.io/wayfinder-core";
import { logger } from "../../utils/logger";
import type { TimerId } from "../../utils/timer";
import { setTimeoutSafe, clearTimeoutSafe } from "../../utils/timer";
import type {
  WayfinderConfig,
  ContentRequest,
  ContentResponse,
  GatewayProviderConfig,
} from "../wayfinderTypes";
import {
  DEFAULT_CONFIG,
  ROUTING_MODE_CONFIGS,
  determineFallbackGateway,
  getCurrentRoutingMode,
  loadPersistedConfig,
  saveConfig,
  validateConfig,
} from "./config";
import { ContentCache } from "./cache";
import { VerificationManager } from "./verification";
import { classifyError, GatewayError, InitializationError } from "./errors";
import { 
  extractGatewayFromUrl as utilExtractGatewayFromUrl
} from "./utils";
import { fetchWithWayfinderRetry as requestFetchWithWayfinderRetry } from "./request";
import { 
  createGatewayProvider,
  createRoutingStrategy,
  createVerificationStrategy
} from "./routing";

// Content size thresholds
const SIZE_THRESHOLDS = {
  IMAGE: 25 * 1024 * 1024, // 25MB
  VIDEO: 200 * 1024 * 1024, // 200MB
  AUDIO: 50 * 1024 * 1024, // 50MB
  TEXT: 10 * 1024 * 1024, // 10MB
};

class WayfinderService {
  private wayfinder: Wayfinder | null = null;
  private config: WayfinderConfig;
  private cache: ContentCache;
  private verificationManager: VerificationManager;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  private eventListeners: Array<{ event: string; handler: (event: unknown) => void }> = [];
  private verificationTimeouts = new Map<string, TimerId>();
  
  // Track current request context for routing events
  private currentRequestContext: { txId: string; startTime: number } | null = null;

  constructor(config: Partial<WayfinderConfig> = {}) {
    logger.debug("Creating WayfinderService instance...");

    // Load persisted config first, then apply defaults and overrides
    const persistedConfig = loadPersistedConfig();
    logger.debug("Persisted config:", persistedConfig);
    logger.debug("Override config:", config);
    
    this.config = validateConfig({
      ...DEFAULT_CONFIG,
      ...persistedConfig,
      ...config,
    });

    // Initialize modules
    this.cache = new ContentCache();
    this.verificationManager = new VerificationManager();

    logger.debug("WayfinderService instance created with config:", {
      enableWayfinder: this.config.enableWayfinder,
      routingStrategy: this.config.routing.strategy.strategy,
      verificationEnabled: this.config.verification.enabled,
    });
  }

  async initialize(): Promise<void> {
    // Return existing initialization if in progress
    if (this.initializationPromise) {
      logger.debug('Wayfinder initialization already in progress, returning existing promise');
      return this.initializationPromise;
    }

    if (this.initialized) {
      logger.debug('Wayfinder already initialized, skipping');
      return;
    }
    
    if (!this.config.enableWayfinder) {
      logger.info('Wayfinder disabled, skipping initialization');
      return;
    }

    // Create and store the promise
    this.initializationPromise = this._doInitialize();

    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async _doInitialize(): Promise<void> {
    try {
      logger.info("Initializing Wayfinder core...");
      logger.info("Current config verification.enabled:", this.config.verification.enabled);

      // Create gateway provider for routing
      const routingGatewayProvider = this.createGatewayProvider(
        this.config.routing.gatewayProvider
      );

      // Create routing strategy
      const strategyName = this.config.routing.strategy.strategy;
      logger.info("Creating routing strategy:", {
        strategy: strategyName,
        fullConfig: this.config.routing.strategy
      });
      
      const routingStrategy = await this.createRoutingStrategy(
        strategyName,
        routingGatewayProvider
      );
      
      logger.info("Routing strategy created:", {
        strategyType: routingStrategy.constructor.name,
        expectedStrategy: this.config.routing.strategy.strategy
      });

      // IMPORTANT: When verification is disabled, we pass undefined for verificationStrategy
      // This should prevent the SDK from fetching digests
      let verificationStrategy: unknown = undefined;
      let events: WayfinderVerificationEventArgs = {};

      if (this.config.verification.enabled) {
        logger.info("Verification enabled, creating verification strategy");
        verificationStrategy = await this.createVerificationStrategy();

        // Only set up verification events when verification is enabled
        events = {
          onVerificationSucceeded: (event: any) => {
            logger.info('Verification succeeded:', {
              txId: event.txId,
              gateway: event.gateway || 'unknown',
              timestamp: Date.now()
            });
            
            // Clear verification timeout since verification completed
            const timeout = this.verificationTimeouts.get(event.txId);
            if (timeout) {
              clearTimeoutSafe(timeout);
              this.verificationTimeouts.delete(event.txId);
            }
            
            this.verificationManager.handleEvent({
              type: "verification-completed",
              txId: event.txId,
              gateway: event.gateway || "verified",
              timestamp: Date.now(),
            });
          },
          onVerificationFailed: (event: any) => {
            logger.warn("Verification failed:", {
              txId: event.txId,
              error: event.error?.message || event.message,
              details: event
            });
            
            // Clear verification timeout since verification failed
            const timeout = this.verificationTimeouts.get(event.txId);
            if (timeout) {
              clearTimeoutSafe(timeout);
              this.verificationTimeouts.delete(event.txId);
            }
            
            this.verificationManager.handleEvent({
              type: "verification-failed",
              txId: event.txId || "unknown",
              error: event.error?.message || event.message || "Verification failed",
              timestamp: Date.now(),
            });
          },
          onVerificationProgress: (event: any) => {
            if (event.totalBytes > 0) {
              const percentage = (event.processedBytes / event.totalBytes) * 100;
              logger.debug(
                `Verification progress for ${event.txId}: ${percentage.toFixed(1)}%`
              );
              this.verificationManager.handleEvent({
                type: "verification-progress",
                txId: event.txId,
                timestamp: Date.now(),
                progress: {
                  processedBytes: event.processedBytes,
                  totalBytes: event.totalBytes,
                  percentage: percentage,
                  stage: 'verifying' // This is actually verification progress, not download
                }
              });
            }
          },
        };
      } else {
        logger.info(
          "Verification disabled, skipping verification strategy creation"
        );
      }

      // Initialize Wayfinder with optional verification and telemetry
      logger.info("Preparing Wayfinder config with routing strategy:", {
        routingStrategyType: routingStrategy?.constructor?.name,
        routingStrategyDefined: !!routingStrategy
      });
      
      const wayfinderConfig: any = {
        gatewaysProvider: routingGatewayProvider,
        // Correct structure based on WAYFINDER-CORE.md examples
        routingSettings: {
          strategy: routingStrategy,
          events: {
            onRoutingStarted: (event: any) => {
              logger.debug("Routing started", event);
              const txId = this.currentRequestContext?.txId || event.txId || "unknown";
              this.verificationManager.handleEvent({
                type: "routing-started",
                txId,
                timestamp: Date.now(),
              });
            },
            onRoutingSucceeded: (event: any) => {
              logger.info("Routing succeeded to gateway:", event.selectedGateway);
              const txId = this.currentRequestContext?.txId || event.txId || "unknown";
              this.verificationManager.handleEvent({
                type: "routing-succeeded",
                txId,
                gateway: event.selectedGateway,
                timestamp: Date.now(),
              });
            },
            onRoutingFailed: (event: any) => {
              logger.warn("Routing failed:", event);
              const txId = this.currentRequestContext?.txId || event.txId || "unknown";
              this.verificationManager.handleEvent({
                type: "routing-failed",
                txId,
                error: event.error?.message || "Routing failed",
                timestamp: Date.now(),
              });
            }
          }
        },
        verificationSettings: {
          enabled: this.config.verification.enabled,
          strategy: verificationStrategy,
          strict: false, // Never strict mode to avoid failures
          events: events // verification events if enabled
        }
      };

      // Add telemetry configuration if enabled
      if (this.config.telemetry.enabled) {
        logger.info("Telemetry enabled, configuring OpenTelemetry spans");
        wayfinderConfig.telemetrySettings = {
          enabled: true,
          sampleRate: this.config.telemetry.sampleRate || 0.1,
        };
      }

      this.wayfinder = new Wayfinder(wayfinderConfig);
      
      // Debug log to verify Wayfinder configuration
      logger.info("Wayfinder instance created with config:", {
        hasGatewayProvider: !!wayfinderConfig.gatewaysProvider,
        hasRoutingSettings: !!wayfinderConfig.routingSettings,
        routingStrategyType: wayfinderConfig.routingSettings?.strategy?.constructor?.name || 'unknown',
        hasVerificationSettings: !!wayfinderConfig.verificationSettings,
        verificationEnabled: wayfinderConfig.verificationSettings?.enabled || false,
        telemetryEnabled: wayfinderConfig.telemetrySettings?.enabled || false
      });
      
      // Log actual Wayfinder internal state (if accessible)
      if (this.wayfinder && typeof this.wayfinder === 'object') {
        const wayfinderState = this.wayfinder as any;
        logger.debug("Wayfinder internal state:", {
          hasRoutingStrategy: !!wayfinderState.routingStrategy,
          routingStrategyType: wayfinderState.routingStrategy?.constructor?.name,
          hasVerificationSettings: !!wayfinderState.verificationSettings,
          verificationEnabled: wayfinderState.verificationSettings?.enabled
        });
      }

      // Set up additional event listeners via emitter
      if (this.wayfinder.emitter) {
        const routingSucceededHandler = (event: any) => {
          logger.info("Routing succeeded to gateway:", event.selectedGateway);
          this.verificationManager.handleEvent({
            type: "routing-succeeded",
            txId: "unknown",
            gateway: event.selectedGateway,
            timestamp: Date.now(),
          });
        };
        
        const routingFailedHandler = (event: any) => {
          logger.warn("Routing failed:", event);
          this.verificationManager.handleEvent({
            type: "routing-failed",
            txId: "unknown",
            error: event.message || "Routing failed",
            timestamp: Date.now(),
          });
        };
        
        this.wayfinder.emitter.on("routing-succeeded", routingSucceededHandler);
        this.wayfinder.emitter.on("routing-failed", routingFailedHandler);
        
        // Track listeners for cleanup
        this.eventListeners.push(
          { event: "routing-succeeded", handler: routingSucceededHandler },
          { event: "routing-failed", handler: routingFailedHandler }
        );
      }

      this.initialized = true;
      logger.info("Wayfinder service initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize Wayfinder:", error);
      throw new InitializationError("Wayfinder initialization failed", error);
    }
  }

  /**
   * Check if content should be automatically fetched based on size and type
   */
  private shouldAutoFetch(contentType: string, size: number): boolean {
    if (contentType.startsWith("image/") && size > SIZE_THRESHOLDS.IMAGE)
      return false;
    if (contentType.startsWith("video/") && size > SIZE_THRESHOLDS.VIDEO)
      return false;
    if (contentType.startsWith("audio/") && size > SIZE_THRESHOLDS.AUDIO)
      return false;
    if (
      (contentType.startsWith("text/") ||
        ["text/plain", "text/markdown"].includes(contentType)) &&
      size > SIZE_THRESHOLDS.TEXT
    )
      return false;

    return true;
  }

  /**
   * Get content URL via Wayfinder or fallback
   */
  async getContentUrl(
    request: ContentRequest,
    forceLoad: boolean = false,
    preload: boolean = false
  ): Promise<ContentResponse> {
    const { txId, path = "", contentType, size } = request;

    // Check if we should auto-fetch based on size thresholds
    if (
      !forceLoad &&
      contentType &&
      size &&
      !this.shouldAutoFetch(contentType, size)
    ) {
      return await this.createUrlOnlyResponse(txId, path, contentType);
    }

    // Check cache first
    const cached = this.cache.getCachedContent(txId, path);
    if (cached) {
      const currentStatus = this.verificationManager.getStatus(txId);
      return {
        url: cached.url,
        gateway: cached.gateway,
        verified: currentStatus.status === "verified",
        verificationStatus: currentStatus,
        data: cached.data,
        contentType: cached.contentType,
        fromCache: true,
      };
    }

    // Check URL cache
    const urlCached = this.cache.getCachedUrl(txId, path);
    if (urlCached) {
      const currentStatus = this.verificationManager.getStatus(txId);
      return {
        url: urlCached.url,
        gateway: urlCached.gateway,
        verified: currentStatus.status === "verified",
        verificationStatus: currentStatus,
        data: null,
        contentType: null,
        fromCache: true,
      };
    }

    // If preloading, return URL without verification
    if (preload) {
      return await this.createUrlOnlyResponse(txId, path, contentType);
    }

    // Initialize if needed
    await this.initialize();

    // Try Wayfinder if enabled
    if (this.wayfinder && this.config.enableWayfinder) {
      try {
        // Use retry logic for better resilience
        return await this.fetchWithWayfinderRetry(request);
      } catch (error) {
        const classifiedError = classifyError(error);

        if (classifiedError instanceof GatewayError) {
          logger.warn(
            "AR.IO gateway network temporarily unavailable, using direct gateway"
          );
        } else {
          logger.warn("All Wayfinder retry attempts failed:", classifiedError);
        }

        // Update verification status based on error type
        if (this.config.verification.enabled) {
          const status =
            classifiedError instanceof GatewayError ? "not-verified" : "failed";
          this.verificationManager.setStatus(txId, {
            txId,
            status,
            error: classifiedError.message,
            timestamp: Date.now(),
          });
        }

        return this.getFallbackContentUrl(request);
      }
    }

    // Fallback to direct gateway
    return this.getFallbackContentUrl(request);
  }


  /**
   * Fetch with Wayfinder-aware retry logic
   * 
   * Automatically retries on ALL errors (not just timeouts):
   * - Gateway errors (502/503/504) - Quick retry with 500ms base delay
   * - Network errors - Standard retry with 1s base delay
   * - Timeout errors - Standard retry with 1s base delay
   * 
   * Uses different gateways on each retry via Wayfinder's resolveUrl
   */
  private async fetchWithWayfinderRetry(
    request: ContentRequest,
    attempts: number = 3,
    timeoutMs: number = 7000 // 7s timeout for faster gateway switching
  ): Promise<ContentResponse> {
    // Set current request context for routing events
    this.currentRequestContext = {
      txId: request.txId,
      startTime: Date.now()
    };
    
    try {
      // Create handler configuration for request module
      const handler = {
        wayfinder: this.wayfinder,
        config: this.config,
        cache: this.cache,
        verificationManager: this.verificationManager,
        setupVerificationTimeout: this.setupVerificationTimeout.bind(this)
      };
      
      // Delegate to request module
      return await requestFetchWithWayfinderRetry(request, handler, {
        attempts,
        timeoutMs
      });
    } finally {
      // Clear request context after request completes
      this.currentRequestContext = null;
    }
  }


  /**
   * Set up verification timeout
   */
  private setupVerificationTimeout(txId: string): void {
    if (this.config.verification.timeoutMs <= 0) return;

    // Clear any existing timeout for this txId
    const existingTimeout = this.verificationTimeouts.get(txId);
    if (existingTimeout) {
      clearTimeoutSafe(existingTimeout);
    }

    const timeoutId = setTimeoutSafe(() => {
      const currentStatus = this.verificationManager.getStatus(txId);
      if (currentStatus.status === "verifying") {
        logger.warn(`Verification timeout for ${txId}`);
        this.verificationManager.setStatus(txId, {
          txId,
          status: "failed",
          error: "Verification timeout",
          timestamp: Date.now(),
        });

        this.verificationManager.handleEvent({
          type: "verification-failed",
          txId,
          error: "Verification timeout",
          timestamp: Date.now(),
        });
      }
      // Remove timeout from map after execution
      this.verificationTimeouts.delete(txId);
    }, this.config.verification.timeoutMs);
    
    this.verificationTimeouts.set(txId, timeoutId);
  }

  /**
   * Create URL-only response (no content fetching)
   */
  private async createUrlOnlyResponse(
    txId: string,
    path: string = "",
    contentType?: string
  ): Promise<ContentResponse> {
    // Initialize if needed
    await this.initialize();
    
    // Try to use Wayfinder to resolve the gateway URL if available
    let url: string;
    let gateway: string;
    
    if (this.wayfinder && this.config.enableWayfinder) {
      try {
        const arUrl = `ar://${txId}${path}`;
        const gatewayUrl = await this.wayfinder.resolveUrl({ originalUrl: arUrl });
        url = gatewayUrl.toString();
        gateway = this.extractGatewayFromUrl(url);
        logger.info(`Resolved URL-only response via Wayfinder: ${url}`);
      } catch (error) {
        logger.warn('Failed to resolve URL via Wayfinder, using fallback:', error);
        gateway = this.config.fallback.gateways[0] || determineFallbackGateway();
        url = `${gateway}/${txId}${path}`;
      }
    } else {
      gateway = this.config.fallback.gateways[0] || determineFallbackGateway();
      url = `${gateway}/${txId}${path}`;
    }

    return {
      url,
      gateway,
      verified: false,
      verificationStatus: {
        txId,
        status: "not-verified",
        timestamp: Date.now(),
      },
      data: null,
      contentType: contentType || null,
      fromCache: false,
    };
  }

  /**
   * Fallback to direct gateway
   */
  private getFallbackContentUrl(request: ContentRequest): ContentResponse {
    const { txId, path = "", preferredGateway } = request;
    // Use preferred gateway if provided (e.g., for ArNS content), otherwise use fallback
    const fallbackGateway =
      preferredGateway ||
      this.config.fallback.gateways[0] ||
      determineFallbackGateway();
    const url = `${fallbackGateway}/${txId}${path}`;

    const currentStatus = this.verificationManager.getStatus(txId);
    if (currentStatus.status === "pending") {
      this.verificationManager.setStatus(txId, {
        txId,
        status: "not-verified",
        gateway: fallbackGateway,
        timestamp: Date.now(),
      });
    }

    return {
      url,
      gateway: fallbackGateway,
      verified: currentStatus.status === "verified",
      verificationStatus: this.verificationManager.getStatus(txId),
      data: null,
      contentType: null,
      fromCache: false,
    };
  }

  /**
   * Create gateway provider based on configuration
   */
  private createGatewayProvider(providerConfig: GatewayProviderConfig): any {
    // Delegate to routing module
    return createGatewayProvider(
      providerConfig,
      this.config.fallback.gateways,
      this.config.ao?.cuUrl
    );
  }


  /**
   * Create routing strategy
   */
  private async createRoutingStrategy(strategy: string, gatewayProvider?: any) {
    // Delegate to routing module
    return createRoutingStrategy(
      {
        strategy,
        staticGateway: this.config.routing.strategy.staticGateway,
        timeoutMs: this.config.routing.strategy.timeoutMs
      },
      gatewayProvider,
      this.config.fallback.gateways
    );
  }

  /**
   * Create verification strategy with independent trusted gateways
   */
  private async createVerificationStrategy() {
    // Delegate to routing module
    return createVerificationStrategy(
      this.config.verification.enabled,
      this.config.verification.strategy,
      this.config.ao?.cuUrl
    );
  }

  /**
   * Extract gateway hostname from URL
   */
  private extractGatewayFromUrl(url: string): string {
    // Delegate to utility function
    return utilExtractGatewayFromUrl(url);
  }

  /**
   * Check if Wayfinder is available
   */
  async isAvailable(): Promise<boolean> {
    await this.initialize();
    return this.wayfinder !== null && this.config.enableWayfinder;
  }

  /**
   * Get verification status
   */
  getVerificationStatus(txId: string) {
    return this.verificationManager.getStatus(txId);
  }

  /**
   * Add verification event listener
   */
  addEventListener(listener: (event: any) => void): void {
    this.verificationManager.addEventListener(listener);
  }

  /**
   * Remove verification event listener
   */
  removeEventListener(listener: (event: any) => void): void {
    this.verificationManager.removeEventListener(listener);
  }

  /**
   * Get cached content
   */
  getCachedContent(txId: string, path: string = "") {
    const cached = this.cache.getCachedContent(txId, path);
    if (!cached) return null;

    const currentStatus = this.verificationManager.getStatus(txId);
    return {
      ...cached,
      verified: currentStatus.status === "verified",
      verificationStatus: currentStatus,
    };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
    this.verificationManager.clear();
  }

  /**
   * Cleanup resources and event listeners
   */
  cleanup(): void {
    logger.info("Cleaning up Wayfinder service...");
    
    // Remove event listeners
    if (this.wayfinder?.emitter && this.eventListeners.length > 0) {
      // Check if off method exists (might be 'off', 'removeListener', etc.)
      const emitter = this.wayfinder.emitter as any;
      const removeMethod = emitter.off || emitter.removeListener || emitter.removeEventListener;
      
      if (removeMethod && typeof removeMethod === 'function') {
        for (const { event, handler } of this.eventListeners) {
          removeMethod.call(emitter, event, handler);
        }
      }
      this.eventListeners = [];
    }
    
    // Clear verification timeouts
    for (const timeout of this.verificationTimeouts.values()) {
      clearTimeoutSafe(timeout);
    }
    this.verificationTimeouts.clear();
    
    // Clear caches
    this.clearCache();
    
    // Reset state
    this.wayfinder = null;
    this.initialized = false;
    this.initializationPromise = null;
    
    logger.info("Wayfinder service cleanup complete");
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<WayfinderConfig>): void {
    logger.info("Updating Wayfinder configuration...");
    logger.info("New config received:", newConfig);

    const oldConfig = { ...this.config };

    // Merge configuration - deep merge for nested objects
    this.config = validateConfig({
      ...this.config,
      ...newConfig,
      ao: {
        ...this.config.ao,
        ...(newConfig.ao || {}),
      },
      routing: {
        ...this.config.routing,
        gatewayProvider:
          newConfig.routing?.gatewayProvider ||
          this.config.routing.gatewayProvider,
        strategy: {
          ...this.config.routing.strategy,
          ...(newConfig.routing?.strategy || {}),
        },
      },
      verification: {
        ...this.config.verification,
        ...(newConfig.verification || {}),
        gatewayProvider:
          newConfig.verification?.gatewayProvider ||
          this.config.verification.gatewayProvider,
      },
      fallback: {
        ...this.config.fallback,
        ...(newConfig.fallback || {}),
      },
      telemetry: {
        ...this.config.telemetry,
        ...(newConfig.telemetry || {}),
      },
    });

    // Save configuration
    saveConfig(this.config);
    logger.info("Final merged config verification.enabled:", this.config.verification.enabled);

    // Check if re-initialization needed
    const needsReinitialization =
      oldConfig.enableWayfinder !== this.config.enableWayfinder ||
      JSON.stringify(oldConfig.routing) !==
        JSON.stringify(this.config.routing) ||
      JSON.stringify(oldConfig.verification) !==
        JSON.stringify(this.config.verification) ||
      JSON.stringify(oldConfig.ao) !== JSON.stringify(this.config.ao) ||
      JSON.stringify(oldConfig.telemetry) !==
        JSON.stringify(this.config.telemetry);

    if (needsReinitialization && this.initialized) {
      logger.info("Reinitializing Wayfinder...");
      // Use cleanup method to properly remove event listeners
      this.cleanup();

      if (this.config.enableWayfinder) {
        this.initialize().catch((error) => {
          logger.error("Failed to re-initialize Wayfinder:", error);
        });
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): WayfinderConfig {
    return { ...this.config };
  }

  /**
   * Apply routing mode preset
   */
  applyRoutingMode(mode: "balanced" | "fast" | "fair-share" | "self"): void {
    const routingConfig = ROUTING_MODE_CONFIGS[mode];
    if (routingConfig) {
      // Make sure we're updating the routing config properly
      this.updateConfig({
        routing: {
          gatewayProvider: routingConfig.gatewayProvider,
          strategy: routingConfig.strategy,
        },
      });
    }
  }

  /**
   * Get current routing mode
   */
  getCurrentRoutingMode(): "balanced" | "fast" | "fair-share" | "self" | "custom" {
    return getCurrentRoutingMode(this.config);
  }

  /**
   * Get fallback gateway
   */
  getFallbackGateway(): string {
    return this.config.fallback.gateways[0] || determineFallbackGateway();
  }

  /**
   * Resolve an ar:// URL to a gateway URL using Wayfinder routing
   */
  async resolveArUrl(arUrl: string): Promise<URL | null> {
    await this.initialize();

    if (!this.wayfinder || !this.config.enableWayfinder) {
      return null;
    }

    try {
      return await this.wayfinder.resolveUrl({ originalUrl: arUrl });
    } catch (error) {
      logger.error("Failed to resolve AR URL:", error);
      return null;
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    const verificationStats = this.verificationManager.getStats();
    const cacheStats = this.cache.getStats();

    return {
      enabled: this.config.enableWayfinder,
      initialized: this.initialized,
      fallbackGateway: this.getFallbackGateway(),
      routingProvider: this.config.routing.gatewayProvider.type,
      verificationEnabled: this.config.verification.enabled,
      verificationProvider: this.config.verification.gatewayProvider.type,
      // From verification stats
      totalRequests: verificationStats.total,
      verified: verificationStats.verified,
      failed: verificationStats.failed,
      verificationRate: verificationStats.verificationRate,
      // From cache stats
      cacheSize: cacheStats.urlCacheSize,
      contentCacheSize: cacheStats.contentCacheSize,
    };
  }
}

// Create singleton instance
export const wayfinderService = new WayfinderService();

// Export types and utilities
export { WayfinderService, determineFallbackGateway };
