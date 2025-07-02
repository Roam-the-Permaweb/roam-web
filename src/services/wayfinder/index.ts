/**
 * Simplified Wayfinder Service with modular architecture
 */

import {
  Wayfinder,
  SimpleCacheGatewaysProvider,
  NetworkGatewaysProvider,
  StaticGatewaysProvider,
  HashVerificationStrategy,
  RandomRoutingStrategy,
  StaticRoutingStrategy,
  FastestPingRoutingStrategy,
  RoundRobinRoutingStrategy,
  type WayfinderVerificationEventArgs,
} from "@ar.io/wayfinder-core";
import { ARIO, AOProcess } from "@ar.io/sdk";
import { connect } from "@permaweb/aoconnect";
import { logger } from "../../utils/logger";
import { retryWithBackoff } from "../../utils/retry";
import type {
  WayfinderConfig,
  ContentRequest,
  ContentResponse,
  GatewayProviderConfig,
  NetworkProviderConfig,
  StaticProviderConfig,
  CacheProviderConfig,
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
      let verificationStrategy: any = undefined;
      let events: WayfinderVerificationEventArgs = {};

      if (this.config.verification.enabled) {
        logger.info("Verification enabled, creating verification strategy");
        verificationStrategy = await this.createVerificationStrategy();

        // Only set up verification events when verification is enabled
        events = {
          onVerificationSucceeded: (event: any) => {
            logger.info(`Verification succeeded for ${event.txId}`);
            this.verificationManager.handleEvent({
              type: "verification-completed",
              txId: event.txId,
              gateway: "verified",
              timestamp: Date.now(),
            });
          },
          onVerificationFailed: (event: any) => {
            logger.warn("Verification failed:", event);
            this.verificationManager.handleEvent({
              type: "verification-failed",
              txId: "unknown",
              error: event.message || "Verification failed",
              timestamp: Date.now(),
            });
          },
          onVerificationProgress: (event: any) => {
            if (event.totalBytes > 0) {
              const progress = (event.processedBytes / event.totalBytes) * 100;
              const roundedProgress = Math.round(progress / 10) * 10;
              if (roundedProgress > 0) {
                logger.debug(
                  `Verification progress for ${event.txId}: ${roundedProgress}%`
                );
                this.verificationManager.handleEvent({
                  type: "verification-progress",
                  txId: event.txId,
                  progress: roundedProgress,
                  timestamp: Date.now(),
                });
              }
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
            },
            onRoutingSucceeded: (event: any) => {
              logger.info("Routing succeeded to gateway:", event.selectedGateway);
            },
            onRoutingFailed: (event: any) => {
              logger.warn("Routing failed:", event);
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
        this.wayfinder.emitter.on("routing-succeeded", (event) => {
          logger.info("Routing succeeded to gateway:", event.selectedGateway);
          this.verificationManager.handleEvent({
            type: "routing-succeeded",
            txId: "unknown",
            gateway: event.selectedGateway,
            timestamp: Date.now(),
          });
        });

        this.wayfinder.emitter.on("routing-failed", (event) => {
          logger.warn("Routing failed:", event);
          this.verificationManager.handleEvent({
            type: "routing-failed",
            txId: "unknown",
            error: event.message || "Routing failed",
            timestamp: Date.now(),
          });
        });
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
      return this.createUrlOnlyResponse(txId, path, contentType);
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
      return this.createUrlOnlyResponse(txId, path, contentType);
    }

    // Initialize if needed
    await this.initialize();

    // Try Wayfinder if enabled
    if (this.wayfinder && this.config.enableWayfinder) {
      try {
        // When verification is disabled, we can use a more efficient approach
        if (!this.config.verification.enabled) {
          // Use resolveUrl to get the gateway URL without fetching data
          // This should avoid digest fetching
          logger.info(
            `Verification disabled, using Wayfinder for routing only (no verification)`
          );
          return await this.fetchWithoutVerification(request);
        } else {
          // Full Wayfinder flow with verification
          logger.info(
            `Verification ENABLED, using full Wayfinder flow with verification`
          );
          return await this.fetchViaWayfinder(request);
        }
      } catch (error) {
        const classifiedError = classifyError(error);

        if (classifiedError instanceof GatewayError) {
          logger.warn(
            "AR.IO gateway network temporarily unavailable, using direct gateway"
          );
        } else {
          logger.warn("Wayfinder request failed:", classifiedError);
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
   * Fetch content without verification using Wayfinder for routing only
   * This method uses resolveUrl to get the gateway URL, then fetches directly
   */
  private async fetchWithoutVerification(
    request: ContentRequest
  ): Promise<ContentResponse> {
    const { txId, path = "", preferredGateway } = request;
    const arUrl = `ar://${txId}${path}`;

    logger.info(`Getting gateway URL for ${txId} (no verification)`);

    let gatewayUrl: URL;

    // If preferredGateway is specified (e.g., for ArNS content), use it directly
    if (preferredGateway) {
      logger.info(
        `Using preferred gateway for ArNS content: ${preferredGateway}`
      );
      gatewayUrl = new URL(`${preferredGateway}/${txId}${path}`);
    } else {
      // Use resolveUrl to get the gateway URL without triggering verification
      gatewayUrl = await this.wayfinder!.resolveUrl({
        originalUrl: arUrl,
      });
    }

    logger.info(`Resolved to gateway: ${gatewayUrl}`);

    // Now fetch the content directly from the resolved gateway
    const response = await fetch(gatewayUrl.toString());

    if (!response.ok) {
      throw new GatewayError(
        `Gateway returned ${response.status}: ${response.statusText}`
      );
    }

    const gateway = this.extractGatewayFromUrl(gatewayUrl.toString());
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";

    // Process response data
    const data = await this.processResponseData(response, contentType);

    // Cache the response
    this.cache.cacheUrl(txId, path || "", gatewayUrl.toString(), gateway);

    this.cache.cacheContent(txId, path || "", {
      data,
      contentType,
      url: gatewayUrl.toString(),
      gateway,
      verified: false,
      verificationStatus: {
        txId,
        status: "not-verified",
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
      size: data.size,
    });

    // Set status to not-verified since we're not verifying
    this.verificationManager.setStatus(txId, {
      txId,
      status: "not-verified",
      gateway,
      timestamp: Date.now(),
    });

    return {
      url: gatewayUrl.toString(),
      gateway,
      verified: false,
      verificationStatus: this.verificationManager.getStatus(txId),
      contentType,
      data,
      fromCache: false,
    };
  }

  /**
   * Fetch content via Wayfinder with verification
   */
  private async fetchViaWayfinder(
    request: ContentRequest
  ): Promise<ContentResponse> {
    const { txId, path = "" } = request;
    const arUrl = `ar://${txId}${path}`;

    logger.info(`Wayfinder request for ${txId}`);

    // Set initial verification status
    if (this.config.verification.enabled) {
      this.verificationManager.setStatus(txId, {
        txId,
        status: "verifying",
        timestamp: Date.now(),
      });

      this.verificationManager.handleEvent({
        type: "verification-started",
        txId,
        timestamp: Date.now(),
      });

      // Set up verification timeout
      this.setupVerificationTimeout(txId);
    } else {
      this.verificationManager.setStatus(txId, {
        txId,
        status: "not-verified",
        timestamp: Date.now(),
      });
    }

    // Make the request
    logger.info(`Making Wayfinder request with verification ${this.config.verification.enabled ? 'ENABLED' : 'DISABLED'}`);
    logger.info(`Wayfinder instance state:`, {
      exists: !!this.wayfinder,
      hasRequest: !!this.wayfinder?.request,
      configVerificationEnabled: this.config.verification.enabled
    });
    
    const response = await this.wayfinder!.request(arUrl);
    logger.info(`Wayfinder response received from: ${response.url}`);

    // Process response
    const gatewayUrl = response.url;
    const gateway = this.extractGatewayFromUrl(gatewayUrl);
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";

    // Handle content based on type
    const data = await this.processResponseData(response, contentType);

    // Cache the response
    this.cache.cacheUrl(txId, path || "", gatewayUrl, gateway);

    this.cache.cacheContent(txId, path || "", {
      data,
      contentType,
      url: gatewayUrl,
      gateway,
      verified: false, // Will be updated by verification events
      verificationStatus: this.verificationManager.getStatus(txId),
      timestamp: Date.now(),
      size: data.size,
    });

    return {
      url: gatewayUrl,
      gateway,
      verified: false, // Will be updated by verification events
      verificationStatus: this.verificationManager.getStatus(txId),
      contentType,
      data,
      fromCache: false,
    };
  }

  /**
   * Process response data based on content type
   */
  private async processResponseData(
    response: Response,
    contentType: string
  ): Promise<Blob> {
    if (
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
   * Set up verification timeout
   */
  private setupVerificationTimeout(txId: string): void {
    if (this.config.verification.timeoutMs <= 0) return;

    setTimeout(() => {
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
    }, this.config.verification.timeoutMs);
  }

  /**
   * Create URL-only response (no content fetching)
   */
  private createUrlOnlyResponse(
    txId: string,
    path: string = "",
    contentType?: string
  ): ContentResponse {
    const fallbackGateway =
      this.config.fallback.gateways[0] || determineFallbackGateway();
    const url = `${fallbackGateway}/${txId}${path}`;

    return {
      url,
      gateway: fallbackGateway,
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
    logger.info(`Creating gateway provider of type: ${providerConfig.type}`);

    switch (providerConfig.type) {
      case "network": {
        const config = providerConfig.config as NetworkProviderConfig;
        const provider = new NetworkGatewaysProvider({
          ario: this.createArioInstance(),
          sortBy: config.sortBy,
          sortOrder: config.sortOrder,
          limit: config.limit,
        });

        // Wrap getGateways with retry logic
        const originalGetGateways = provider.getGateways.bind(provider);
        provider.getGateways = async () => {
          return retryWithBackoff(() => originalGetGateways(), {
            maxRetries: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            backoffMultiplier: 2,
            onRetry: (error, attempt) => {
              logger.warn(
                `NetworkGatewaysProvider.getGateways attempt ${attempt} failed:`,
                error.message
              );
            },
          });
        };

        return provider;
      }

      case "static": {
        const config = providerConfig.config as StaticProviderConfig;
        return new StaticGatewaysProvider({
          gateways: config.gateways,
        });
      }

      case "simple-cache": {
        const config = providerConfig.config as CacheProviderConfig;
        const wrappedProvider = this.createGatewayProvider({
          type: config.wrappedProvider,
          config: config.wrappedProviderConfig,
        } as GatewayProviderConfig);

        return new SimpleCacheGatewaysProvider({
          ttlSeconds: config.cacheTimeoutMinutes * 60,
          gatewaysProvider: wrappedProvider,
        });
      }

      default:
        // Fallback to static provider
        return new StaticGatewaysProvider({
          gateways: this.config.fallback.gateways,
        });
    }
  }

  /**
   * Create ARIO instance with optional custom CU URL
   */
  private createArioInstance() {
    const cuUrl = this.config.ao?.cuUrl;

    if (cuUrl) {
      logger.info(`Using custom AO CU URL: ${cuUrl}`);

      const customAo = connect({
        MODE: "legacy",
        CU_URL: cuUrl,
        MU_URL: "https://mu.ao-testnet.xyz",
        GRAPHQL_URL: "https://arweave.net/graphql",
        GATEWAY_URL: "https://arweave.net",
      });

      return ARIO.mainnet({
        process: new AOProcess({
          processId: "agYcCFJtrMG6cqMuZfskIkFTGvUPddICmtQSBIoPdiA",
          ao: customAo,
        }),
      }) as any;
    }

    return ARIO.mainnet() as any;
  }

  /**
   * Create routing strategy
   */
  private async createRoutingStrategy(strategy: string, gatewayProvider?: any) {
    logger.info(`Creating routing strategy: ${strategy}`);
    
    // Validate strategy parameter
    if (typeof strategy !== 'string') {
      logger.error('Invalid strategy parameter:', strategy);
      logger.warn('Falling back to random strategy due to invalid parameter');
      return new RandomRoutingStrategy();
    }

    switch (strategy) {
      case "random":
        logger.info("Creating RandomRoutingStrategy instance");
        const randomStrategy = new RandomRoutingStrategy();
        logger.info("RandomRoutingStrategy created:", {
          constructorName: randomStrategy.constructor.name,
          strategyType: typeof randomStrategy
        });
        return randomStrategy;

      case "static":
        const staticGateway =
          this.config.routing.strategy.staticGateway || "https://arweave.net";
        return new StaticRoutingStrategy({ gateway: staticGateway });

      case "fastest-ping":
        const timeoutMs = this.config.routing.strategy.timeoutMs || 500;
        return new FastestPingRoutingStrategy({ timeoutMs });

      case "round-robin":
        let gateways: URL[];
        if (gatewayProvider) {
          try {
            gateways = await gatewayProvider.getGateways();
          } catch (error) {
            logger.warn(
              "Failed to get gateways from provider, using fallback:",
              error
            );
            gateways = this.config.fallback.gateways.map((url) => new URL(url));
          }
        } else {
          gateways = this.config.fallback.gateways.map((url) => new URL(url));
        }
        return new RoundRobinRoutingStrategy({ gateways });

      default:
        logger.warn(
          `Unknown routing strategy: ${strategy}, falling back to random`
        );
        return new RandomRoutingStrategy();
    }
  }

  /**
   * Create verification strategy
   */
  private async createVerificationStrategy() {
    logger.info("Creating verification strategy, config:", {
      enabled: this.config.verification.enabled,
      strategy: this.config.verification.strategy
    });
    
    if (
      !this.config.verification.enabled ||
      this.config.verification.strategy === "none"
    ) {
      logger.info("Verification disabled or strategy is 'none', returning undefined");
      return undefined;
    }

    const verificationGatewayProvider = this.createGatewayProvider(
      this.config.verification.gatewayProvider
    );

    let verificationGateways: URL[];
    try {
      verificationGateways = await verificationGatewayProvider.getGateways();
      logger.info(
        `Verification gateways available: ${verificationGateways.length}`
      );
    } catch (error) {
      logger.error("Failed to get verification gateways:", error);
      verificationGateways = [
        new URL("https://permagate.io"),
        new URL("https://vilenarios.com"),
      ];
    }

    const strategy = new HashVerificationStrategy({
      trustedGateways: verificationGateways,
    });
    
    logger.info("Verification strategy created successfully with gateways:", 
      verificationGateways.map(g => g.toString())
    );
    
    return strategy;
  }

  /**
   * Extract gateway hostname from URL
   */
  private extractGatewayFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}`;
    } catch {
      return "unknown";
    }
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
      this.clearCache();
      this.initialized = false;
      this.wayfinder = null;
      this.initializationPromise = null;

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
  applyRoutingMode(mode: "balanced" | "fast" | "fair-share"): void {
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
  getCurrentRoutingMode(): "balanced" | "fast" | "fair-share" | "custom" {
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
