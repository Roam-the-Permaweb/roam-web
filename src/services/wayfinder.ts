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
} from "@ar.io/wayfinder-core";
import { ARIO } from "@ar.io/sdk";
import { logger } from "../utils/logger";
import { GATEWAY_DATA_SOURCE } from "../engine/fetchQueue";
import { retryWithBackoff } from "../utils/retry";
import type {
  WayfinderConfig,
  VerificationStatus,
  ContentRequest,
  ContentResponse,
  VerificationEvent,
  CachedContent,
  GatewayProviderConfig,
  NetworkProviderConfig,
  StaticProviderConfig,
  CacheProviderConfig,
} from "./wayfinderTypes";

/**
 * Determine the fallback gateway based on the current hostname
 * If viewing on roam.ar.io -> use arweave.net
 * If viewing on roam.somegateway.com -> use https://somegateway.com
 * Otherwise use first available gateway from GATEWAY_DATA_SOURCE
 */
function determineFallbackGateway(): string {
  try {
    const hostname = window.location.hostname.toLowerCase();

    // Special case: roam.ar.io should use arweave.net
    if (hostname === "roam.ar.io") {
      logger.info(
        "Detected roam.ar.io hostname, using arweave.net as fallback"
      );
      return "https://arweave.net";
    }

    // Extract gateway from roam.gateway.com pattern
    if (hostname.startsWith("roam.")) {
      const gatewayDomain = hostname.substring(5); // Remove 'roam.' prefix
      const fallbackUrl = `https://${gatewayDomain}`;
      logger.info(
        `Detected roam subdomain on ${gatewayDomain}, using ${fallbackUrl} as fallback`
      );
      return fallbackUrl;
    }

    // Handle localhost and development scenarios
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.")
    ) {
      const fallback = GATEWAY_DATA_SOURCE[0] || "https://arweave.net";
      logger.info(
        `Development environment detected, using configured fallback: ${fallback}`
      );
      return fallback;
    }

    // For direct gateway hosting (e.g., permagate.io/roam, ardrive.net/roam)
    // Use the current hostname as the gateway
    if (hostname.includes(".")) {
      const fallbackUrl = `https://${hostname}`;
      logger.info(
        `Direct gateway hosting detected, using ${fallbackUrl} as fallback`
      );
      return fallbackUrl;
    }

    // Final fallback: use configured data source or arweave.net
    const fallback = GATEWAY_DATA_SOURCE[0] || "https://arweave.net";
    logger.info(`Using default configured fallback gateway: ${fallback}`);
    return fallback;
  } catch (error) {
    logger.warn("Failed to determine fallback gateway from hostname:", error);
    return GATEWAY_DATA_SOURCE[0] || "https://arweave.net";
  }
}

// Default configuration - Wayfinder enabled with Balanced mode
const DEFAULT_CONFIG: WayfinderConfig = {
  // Master switch - enabled by default
  enableWayfinder: true,

  // Routing configuration - Balanced mode (random from top 20)
  routing: {
    gatewayProvider: {
      type: "simple-cache",
      config: {
        cacheTimeoutMinutes: 60, // Cache for 1 hour
        wrappedProvider: "network",
        wrappedProviderConfig: {
          sortBy: "totalDelegatedStake",
          sortOrder: "desc",
          limit: 20, // Top 20 gateways for quality + distribution
        },
      },
    },
    strategy: {
      strategy: "random", // Random selection for load balancing
      // Strategy-specific defaults
      staticGateway: "https://arweave.net",
      preferredGateway: "https://arweave.net",
      timeoutMs: 500,
      probePath: "/ar-io/info",
    },
  },

  // Verification configuration - disabled by default for performance
  verification: {
    enabled: false, // Off by default
    strategy: "hash",
    gatewayProvider: {
      type: "network",
      config: {
        sortBy: "totalDelegatedStake",
        sortOrder: "desc",
        limit: 5, // Top 5 staked gateways for verification
      },
    },
    timeoutMs: 30000,
  },

  // Fallback configuration (when Wayfinder disabled)
  fallback: {
    gateways: [determineFallbackGateway()],
  },
};

class WayfinderService {
  private wayfinder: Wayfinder | null = null;
  private config: WayfinderConfig;
  private verificationStatuses = new Map<string, VerificationStatus>();
  private eventListeners = new Set<(event: VerificationEvent) => void>();
  private urlCache = new Map<
    string,
    { url: string; timestamp: number; gateway: string }
  >();
  private contentCache = new Map<string, CachedContent>();
  // Note: AR.IO SDK does not currently expose x-ar-io-digest hashes in its public API
  private initialized = false;
  private lastCleanup = 0;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: Partial<WayfinderConfig> = {}) {
    logger.info("Initializing WayfinderService...");

    // Load persisted config first, then apply defaults and overrides
    const persistedConfig = this.loadPersistedConfig();
    logger.info("Persisted config:", JSON.stringify(persistedConfig, null, 2));

    this.config = { ...DEFAULT_CONFIG, ...persistedConfig, ...config };
    logger.info(
      "Initial config (with defaults and persisted):",
      JSON.stringify(this.config, null, 2)
    );

    // Parse granular environment variables
    this.parseEnvironmentConfig();

    // Validate configuration
    this.validateConfiguration();

    logger.info(
      "Final config after parsing and validation:",
      JSON.stringify(this.config, null, 2)
    );
  }

  async initialize(): Promise<void> {
    // Return existing initialization if in progress
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    if (this.initialized || !this.config.enableWayfinder) {
      logger.info(
        `Skipping Wayfinder initialization. Initialized: ${this.initialized}, Enabled: ${this.config.enableWayfinder}`
      );
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
      logger.info(
        "Initializing Wayfinder service with config:",
        JSON.stringify(this.config, null, 2)
      );

      // Create gateway provider for routing
      logger.info("Creating routing gateway provider...");
      const routingGatewayProvider = this.createGatewayProvider(
        this.config.routing.gatewayProvider
      );

      // Skip gateway fetching during initialization to avoid unnecessary network calls
      logger.info(
        "Gateway provider created. Gateways will be fetched on first content request."
      );

      // Create routing strategy
      logger.info(
        `Creating routing strategy: ${this.config.routing.strategy.strategy}`
      );
      const routingStrategy = await this.createRoutingStrategy(
        routingGatewayProvider
      );

      // Create verification strategy (optional)
      let verificationStrategy;
      if (this.config.verification.enabled) {
        logger.info("Creating verification strategy...");
        verificationStrategy = await this.createVerificationStrategy();
      } else {
        logger.info("Verification disabled, skipping verification strategy");
      }

      // Initialize Wayfinder - simplified like the example
      logger.info("Creating Wayfinder instance...");
      
      // Only register verification events if verification is enabled
      const events: any = {};
      if (this.config.verification.enabled) {
        logger.info("Registering verification event handlers...");
        events.onVerificationSucceeded = (event: any) => {
          // Gateway info not available in this event
          const gateway = "verified";
          logger.info(`Verification succeeded for ${event.txId}`);

          this.handleVerificationEvent({
            type: "verification-completed",
            txId: event.txId,
            gateway,
            timestamp: Date.now(),
          });
        };
        
        events.onVerificationFailed = (event: any) => {
          // event is an Error object, not a structured event
          logger.warn("Verification failed:", event);
          this.handleVerificationEvent({
            type: "verification-failed",
            txId: "unknown", // txId not available in error
            error: event.message || "Verification failed",
            timestamp: Date.now(),
          });
        };
        
        events.onVerificationProgress = (event: any) => {
          if (event.totalBytes > 0) {
            const progress = (event.processedBytes / event.totalBytes) * 100;
            const roundedProgress = Math.round(progress / 10) * 10;
            if (roundedProgress > 0) {
              logger.debug(
                `Verification progress for ${event.txId}: ${roundedProgress}%`
              );
              this.handleVerificationEvent({
                type: "verification-progress",
                txId: event.txId,
                progress: roundedProgress,
                timestamp: Date.now(),
              });
            }
          }
        };
      }
      
      this.wayfinder = new Wayfinder({
        gatewaysProvider: routingGatewayProvider,
        verificationStrategy,
        routingStrategy,
        events,
      });

      // Set up additional event listeners via emitter
      if (this.wayfinder.emitter) {
        logger.info("Setting up Wayfinder event emitter listeners...");
        this.wayfinder.emitter.on("routing-succeeded", (event) => {
          logger.info("Routing succeeded to gateway:", event.selectedGateway);
          this.handleVerificationEvent({
            type: "routing-succeeded",
            txId: "unknown", // txId not available in routing events
            gateway: event.selectedGateway,
            timestamp: Date.now(),
          });
        });

        this.wayfinder.emitter.on("routing-failed", (event) => {
          logger.warn("Routing failed:", event);
          this.handleVerificationEvent({
            type: "routing-failed",
            txId: "unknown", // txId not available in routing events
            error: event.message || "Routing failed",
            timestamp: Date.now(),
          });
        });
      } else {
        logger.warn(
          "Wayfinder emitter not available, routing events will not be captured"
        );
      }

      this.initialized = true;
      logger.info("Wayfinder service initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize Wayfinder:", error);
      this.config.enableWayfinder = false;
    }
  }

  /**
   * Parse granular environment variables for Wayfinder configuration
   */
  private parseEnvironmentConfig(): void {
    const env = import.meta.env;

    // Master control
    if (env.VITE_ENABLE_WAYFINDER === "true") {
      this.config.enableWayfinder = true;
    } else if (env.VITE_ENABLE_WAYFINDER === "false") {
      this.config.enableWayfinder = false;
      return; // Skip other parsing if master switch is off
    }

    // Legacy support - if either routing or verification was enabled, enable master
    if (
      env.VITE_WAYFINDER_ENABLE_ROUTING === "true" ||
      env.VITE_WAYFINDER_ENABLE_VERIFICATION === "true"
    ) {
      this.config.enableWayfinder = true;
    }

    // Routing provider configuration
    if (env.VITE_WAYFINDER_ROUTING_PROVIDER) {
      const provider = env.VITE_WAYFINDER_ROUTING_PROVIDER as
        | "network"
        | "static"
        | "simple-cache";
      if (["network", "static", "simple-cache"].includes(provider)) {
        this.config.routing.gatewayProvider.type = provider;
      }
    }

    if (env.VITE_WAYFINDER_ROUTING_GATEWAY_LIMIT) {
      const limit = parseInt(env.VITE_WAYFINDER_ROUTING_GATEWAY_LIMIT);
      if (
        !isNaN(limit) &&
        limit > 0 &&
        this.config.routing.gatewayProvider.type === "network"
      ) {
        (
          this.config.routing.gatewayProvider.config as NetworkProviderConfig
        ).limit = limit;
      }
    }

    if (env.VITE_WAYFINDER_ROUTING_STATIC_GATEWAYS) {
      const gateways = env.VITE_WAYFINDER_ROUTING_STATIC_GATEWAYS.split(
        ","
      ).map((g: string) => g.trim());
      if (this.config.routing.gatewayProvider.type === "static") {
        (
          this.config.routing.gatewayProvider.config as StaticProviderConfig
        ).gateways = gateways;
      }
    }

    // Routing strategy configuration
    if (env.VITE_WAYFINDER_ROUTING_STRATEGY) {
      const strategy = env.VITE_WAYFINDER_ROUTING_STRATEGY as
        | "random"
        | "fastest-ping"
        | "round-robin"
        | "static"
        | "preferred-fallback";
      if (
        [
          "random",
          "fastest-ping",
          "round-robin",
          "static",
          "preferred-fallback",
        ].includes(strategy)
      ) {
        this.config.routing.strategy.strategy = strategy;
      }
    }

    if (env.VITE_WAYFINDER_STATIC_ROUTING_GATEWAY) {
      this.config.routing.strategy.staticGateway =
        env.VITE_WAYFINDER_STATIC_ROUTING_GATEWAY;
    }

    if (env.VITE_WAYFINDER_PREFERRED_GATEWAY) {
      this.config.routing.strategy.preferredGateway =
        env.VITE_WAYFINDER_PREFERRED_GATEWAY;
    }

    if (env.VITE_WAYFINDER_ROUTING_TIMEOUT) {
      const timeout = parseInt(env.VITE_WAYFINDER_ROUTING_TIMEOUT);
      if (!isNaN(timeout) && timeout > 0) {
        this.config.routing.strategy.timeoutMs = timeout;
      }
    }

    // Verification configuration
    if (env.VITE_WAYFINDER_ENABLE_VERIFICATION === "false") {
      this.config.verification.enabled = false;
    } else if (env.VITE_WAYFINDER_ENABLE_VERIFICATION === "true") {
      this.config.verification.enabled = true;
    }

    if (env.VITE_WAYFINDER_VERIFICATION_STRATEGY) {
      const strategy = env.VITE_WAYFINDER_VERIFICATION_STRATEGY as
        | "hash"
        | "none";
      if (["hash", "none"].includes(strategy)) {
        this.config.verification.strategy = strategy;
      }
    }

    // Verification provider configuration
    if (env.VITE_WAYFINDER_VERIFICATION_PROVIDER) {
      const provider = env.VITE_WAYFINDER_VERIFICATION_PROVIDER as
        | "network"
        | "static"
        | "simple-cache";
      if (["network", "static", "simple-cache"].includes(provider)) {
        this.config.verification.gatewayProvider.type = provider;
      }
    }

    if (env.VITE_WAYFINDER_VERIFICATION_GATEWAY_LIMIT) {
      const limit = parseInt(env.VITE_WAYFINDER_VERIFICATION_GATEWAY_LIMIT);
      if (
        !isNaN(limit) &&
        limit > 0 &&
        this.config.verification.gatewayProvider.type === "network"
      ) {
        (
          this.config.verification.gatewayProvider
            .config as NetworkProviderConfig
        ).limit = limit;
      }
    }

    if (
      env.VITE_WAYFINDER_VERIFICATION_STATIC_GATEWAYS ||
      env.VITE_WAYFINDER_TRUSTED_GATEWAYS
    ) {
      const gateways = (
        env.VITE_WAYFINDER_VERIFICATION_STATIC_GATEWAYS ||
        env.VITE_WAYFINDER_TRUSTED_GATEWAYS
      )
        .split(",")
        .map((g: string) => g.trim());
      if (this.config.verification.gatewayProvider.type === "static") {
        (
          this.config.verification.gatewayProvider
            .config as StaticProviderConfig
        ).gateways = gateways;
      }
    }

    if (env.VITE_WAYFINDER_VERIFICATION_TIMEOUT) {
      const timeout = parseInt(env.VITE_WAYFINDER_VERIFICATION_TIMEOUT);
      if (!isNaN(timeout) && timeout > 0) {
        this.config.verification.timeoutMs = timeout;
      }
    }

    // Cache configuration (applies to cache providers)
    if (env.VITE_WAYFINDER_CACHE_TIMEOUT) {
      const timeout = parseInt(env.VITE_WAYFINDER_CACHE_TIMEOUT);
      if (!isNaN(timeout) && timeout > 0) {
        // Apply to both routing and verification cache providers if applicable
        if (this.config.routing.gatewayProvider.type === "simple-cache") {
          (
            this.config.routing.gatewayProvider.config as CacheProviderConfig
          ).cacheTimeoutMinutes = timeout;
        }
        if (this.config.verification.gatewayProvider.type === "simple-cache") {
          (
            this.config.verification.gatewayProvider
              .config as CacheProviderConfig
          ).cacheTimeoutMinutes = timeout;
        }
      }
    }
  }

  /**
   * Validate configuration for consistency and correctness
   */
  private validateConfiguration(): void {
    const config = this.config;

    // Validate routing provider configuration
    if (config.routing.gatewayProvider.type === "static") {
      const staticConfig = config.routing.gatewayProvider
        .config as StaticProviderConfig;
      if (!staticConfig.gateways || staticConfig.gateways.length === 0) {
        logger.warn(
          "Static gateway provider selected for routing but no gateways configured, using fallback"
        );
        staticConfig.gateways = config.fallback.gateways;
      }
    }

    // Validate verification provider configuration
    if (
      config.verification.enabled &&
      config.verification.gatewayProvider.type === "static"
    ) {
      const staticConfig = config.verification.gatewayProvider
        .config as StaticProviderConfig;
      if (!staticConfig.gateways || staticConfig.gateways.length === 0) {
        logger.warn(
          "Static gateway provider selected for verification but no gateways configured, using defaults"
        );
        staticConfig.gateways = [
          "https://permagate.io",
          "https://vilenarios.com",
        ];
      }
    }

    // Validate routing strategy specific configs
    if (
      config.routing.strategy.strategy === "static" &&
      !config.routing.strategy.staticGateway
    ) {
      config.routing.strategy.staticGateway = "https://arweave.net";
    }

    if (
      config.routing.strategy.strategy === "preferred-fallback" &&
      !config.routing.strategy.preferredGateway
    ) {
      config.routing.strategy.preferredGateway = "https://arweave.net";
    }

    // Validate numeric values
    if (config.verification.timeoutMs <= 0) {
      config.verification.timeoutMs = 30000;
    }
  }

  /**
   * Create gateway provider based on configuration
   */
  private createGatewayProvider(providerConfig: GatewayProviderConfig): any {
    logger.info(`Creating gateway provider of type: ${providerConfig.type}`);
    logger.info("Provider config:", JSON.stringify(providerConfig, null, 2));

    switch (providerConfig.type) {
      case "network": {
        const config = providerConfig.config as NetworkProviderConfig;
        logger.info(
          `Creating NetworkGatewaysProvider with sortBy: ${config.sortBy}, sortOrder: ${config.sortOrder}, limit: ${config.limit}`
        );
        const provider = new NetworkGatewaysProvider({
          ario: this.createArioInstance(),
          sortBy: config.sortBy,
          sortOrder: config.sortOrder,
          limit: config.limit,
        });
        
        // Wrap getGateways with retry logic
        const originalGetGateways = provider.getGateways.bind(provider);
        provider.getGateways = async () => {
          return retryWithBackoff(
            () => originalGetGateways(),
            {
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
            }
          );
        };
        
        return provider;
      }

      case "static": {
        const config = providerConfig.config as StaticProviderConfig;
        logger.info(
          `Creating StaticGatewaysProvider with gateways: ${config.gateways.join(", ")}`
        );
        return new StaticGatewaysProvider({
          gateways: config.gateways,
        });
      }

      case "simple-cache": {
        const config = providerConfig.config as CacheProviderConfig;
        logger.info(
          `Creating SimpleCacheGatewaysProvider with TTL: ${config.cacheTimeoutMinutes} minutes, wrapped provider: ${config.wrappedProvider}`
        );
        const wrappedProvider: any = this.createGatewayProvider({
          type: config.wrappedProvider,
          config: config.wrappedProviderConfig,
        } as GatewayProviderConfig);

        return new SimpleCacheGatewaysProvider({
          ttlSeconds: config.cacheTimeoutMinutes * 60,
          gatewaysProvider: wrappedProvider,
        });
      }

      default:
        logger.warn(
          `Unknown gateway provider type: ${providerConfig}, falling back to static with fallback gateways`
        );
        // Fallback to static provider with default gateways
        return new StaticGatewaysProvider({
          gateways: this.config.fallback.gateways,
        });
    }
  }

  /**
   * Create ARIO instance - simplified in new SDK
   */
  private createArioInstance() {
    // The new SDK handles AO connection internally
    // Cast to any to handle type mismatch between SDK versions
    return ARIO.mainnet() as any;
  }

  /**
   * Create routing strategy based on configuration
   */
  private async createRoutingStrategy(gatewayProvider?: any) {
    const { strategy } = this.config.routing.strategy;
    logger.info(`Creating routing strategy: ${strategy}`);
    logger.info(
      "Strategy config:",
      JSON.stringify(this.config.routing.strategy, null, 2)
    );

    switch (strategy) {
      case "random":
        logger.info("Using RandomRoutingStrategy");
        return new RandomRoutingStrategy();

      case "static":
        const staticGateway =
          this.config.routing.strategy.staticGateway || "https://arweave.net";
        logger.info(
          `Using StaticRoutingStrategy with gateway: ${staticGateway}`
        );
        return new StaticRoutingStrategy({
          gateway: staticGateway,
        });

      case "fastest-ping":
        const timeoutMs = this.config.routing.strategy.timeoutMs || 500;
        logger.info(
          `Using FastestPingRoutingStrategy with timeout: ${timeoutMs}ms`
        );
        return new FastestPingRoutingStrategy({
          timeoutMs,
        });

      case "round-robin":
        // Get gateways from the provider if available
        let gateways: URL[];
        if (gatewayProvider) {
          try {
            gateways = await gatewayProvider.getGateways();
            logger.info(
              `Using ${gateways.length} gateways from provider for round-robin`
            );
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
        logger.info(
          "Round-robin gateways:",
          gateways.map((g) => g.toString()).join(", ")
        );
        return new RoundRobinRoutingStrategy({ gateways });

      case "preferred-fallback":
        // Use static routing strategy for preferred gateway since SDK doesn't have preferred-fallback
        const preferredGateway =
          this.config.routing.strategy.preferredGateway ||
          "https://arweave.net";
        logger.info(
          `Using StaticRoutingStrategy for preferred gateway: ${preferredGateway}`
        );
        return new StaticRoutingStrategy({
          gateway: preferredGateway,
        });

      default:
        logger.warn(
          `Unknown routing strategy: ${strategy}, falling back to RandomRoutingStrategy`
        );
        return new RandomRoutingStrategy();
    }
  }

  /**
   * Create verification strategy based on configuration
   */
  private async createVerificationStrategy() {
    if (
      !this.config.verification.enabled ||
      this.config.verification.strategy === "none"
    ) {
      logger.info("Verification strategy: disabled");
      return undefined;
    }

    logger.info(
      `Creating verification strategy: ${this.config.verification.strategy}`
    );
    logger.info(
      "Verification config:",
      JSON.stringify(this.config.verification, null, 2)
    );

    // Create gateway provider for verification
    logger.info("Creating verification gateway provider...");
    const verificationGatewayProvider = this.createGatewayProvider(
      this.config.verification.gatewayProvider
    );

    // Get the list of gateways for verification
    let verificationGateways: URL[];
    try {
      verificationGateways = await verificationGatewayProvider.getGateways();
      logger.info(
        `Verification gateways available (${verificationGateways.length}):`,
        verificationGateways.map((g: URL) => g.toString()).join(", ")
      );
    } catch (error) {
      logger.error("Failed to get verification gateways:", error);
      // Fall back to default trusted gateways
      verificationGateways = [
        new URL("https://permagate.io"),
        new URL("https://vilenarios.com"),
      ];
      logger.warn(
        `Using fallback verification gateways: ${verificationGateways.map((g) => g.toString()).join(", ")}`
      );
    }

    switch (this.config.verification.strategy) {
      case "hash":
        logger.info(
          `Creating HashVerificationStrategy with ${verificationGateways.length} trusted gateways`
        );
        return new HashVerificationStrategy({
          trustedGateways: verificationGateways,
        });

      default:
        logger.warn(
          "Unknown verification strategy:",
          this.config.verification.strategy
        );
        return undefined;
    }
  }

  /**
   * Check if content should be automatically fetched based on size and type
   */
  private shouldAutoFetch(contentType: string, size: number): boolean {
    // Size thresholds from constants
    const IMAGE_THRESHOLD = 25 * 1024 * 1024; // 25MB
    const VIDEO_THRESHOLD = 200 * 1024 * 1024; // 200MB
    const AUDIO_THRESHOLD = 50 * 1024 * 1024; // 50MB
    const TEXT_THRESHOLD = 10 * 1024 * 1024; // 10MB

    if (contentType.startsWith("image/") && size > IMAGE_THRESHOLD)
      return false;
    if (contentType.startsWith("video/") && size > VIDEO_THRESHOLD)
      return false;
    if (contentType.startsWith("audio/") && size > AUDIO_THRESHOLD)
      return false;
    if (
      (contentType.startsWith("text/") ||
        ["text/plain", "text/markdown"].includes(contentType)) &&
      size > TEXT_THRESHOLD
    )
      return false;

    return true;
  }

  /**
   * Get content URL via Wayfinder or fallback to original gateway
   * Now with intelligent caching and size-aware fetching
   * @param request Content request details
   * @param forceLoad Force loading even for large files
   * @param preload If true, only returns cached content or URL without verification
   */
  async getContentUrl(
    request: ContentRequest,
    forceLoad: boolean = false,
    preload: boolean = false
  ): Promise<ContentResponse> {
    const { txId, path = "", contentType, size } = request;
    const cacheKey = `${txId}${path}`;

    // Check if we should auto-fetch based on size thresholds
    if (
      !forceLoad &&
      contentType &&
      size &&
      !this.shouldAutoFetch(contentType, size)
    ) {
      // Return URL-only response for large files (will show manual load button)
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
        data: null, // No data for large files unless forced
        contentType: contentType || null,
        fromCache: false,
      };
    }

    // Check content cache first for full content (verified data)
    const contentCached = this.contentCache.get(cacheKey);
    const cacheTimeout = 60 * 60 * 1000; // 1 hour cache
    if (contentCached && Date.now() - contentCached.timestamp < cacheTimeout) {
      // Always get the most current verification status from memory
      const currentVerificationStatus = this.getVerificationStatus(txId);
      const isVerified = currentVerificationStatus.status === "verified";

      return {
        url: contentCached.url,
        gateway: contentCached.gateway,
        verified: isVerified,
        verificationStatus: currentVerificationStatus,
        data: contentCached.data,
        contentType: contentCached.contentType,
        fromCache: true,
      };
    }

    // Check URL cache for metadata-only response
    const urlCached = this.urlCache.get(cacheKey);
    if (urlCached && Date.now() - urlCached.timestamp < cacheTimeout) {
      const currentVerificationStatus = this.getVerificationStatus(txId);
      const isVerified = currentVerificationStatus.status === "verified";

      return {
        url: urlCached.url,
        gateway: urlCached.gateway,
        verified: isVerified, // Use actual verification status from memory
        verificationStatus: currentVerificationStatus,
        data: null, // No data in URL-only cache
        contentType: null, // Will be determined by caller
        fromCache: true,
      };
    }

    // If preloading, return URL without verification
    if (preload) {
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

    // Initialize if needed
    await this.initialize();

    // Try Wayfinder if enabled
    if (this.wayfinder && this.config.enableWayfinder) {
      try {
        const arUrl = `ar://${txId}${path}`;
        logger.info(`Wayfinder request for ${txId} - URL: ${arUrl}`);

        // Only set verification status if verification is enabled
        if (this.config.verification.enabled) {
          // Set initial verification status
          this.setVerificationStatus(txId, {
            txId,
            status: "verifying",
            timestamp: Date.now(),
          });

          // Start verification event
          this.handleVerificationEvent({
            type: "verification-started",
            txId,
            timestamp: Date.now(),
          });
        } else {
          // Set status to not-verified when verification is disabled
          this.setVerificationStatus(txId, {
            txId,
            status: "not-verified",
            timestamp: Date.now(),
          });
        }

        // Set up verification timeout as a safety net
        if (
          this.config.verification.enabled &&
          this.config.verification.timeoutMs > 0
        ) {
          setTimeout(() => {
            const currentStatus = this.getVerificationStatus(txId);
            if (currentStatus.status === "verifying") {
              logger.warn(
                `Verification timeout for ${txId} after ${this.config.verification.timeoutMs}ms`
              );
              this.setVerificationStatus(txId, {
                txId,
                status: "failed",
                error: "Verification timeout",
                timestamp: Date.now(),
              });

              // Notify listeners of timeout
              this.handleVerificationEvent({
                type: "verification-failed",
                txId,
                error: "Verification timeout",
                timestamp: Date.now(),
              });
            }
          }, this.config.verification.timeoutMs);
        }

        // Use request() method like the example
        logger.info("Making Wayfinder request...");
        const response = await this.wayfinder.request(arUrl);
        logger.info(`Wayfinder response received from: ${response.url}`);

        // Extract URL and content info from response
        const gatewayUrl = response.url;
        const gateway = this.extractGatewayFromUrl(gatewayUrl);
        const contentType =
          response.headers.get("content-type") || "application/octet-stream";

        logger.info(
          `Response details - Gateway: ${gateway}, Content-Type: ${contentType}`
        );

        // Handle content based on type to ensure proper verification completion
        let data: Blob;
        try {
          if (
            contentType.startsWith("image/") ||
            contentType.startsWith("video/") ||
            contentType.startsWith("audio/") ||
            contentType === "application/pdf" ||
            contentType.includes("octet-stream")
          ) {
            // Handle binary content - use blob() to complete stream and trigger verification
            data = await response.blob();
          } else if (contentType.startsWith("application/json")) {
            // Handle JSON content
            const jsonData = await response.json();
            data = new Blob([JSON.stringify(jsonData)], { type: contentType });
          } else {
            // Handle text content (HTML, plain text, etc.)
            const textData = await response.text();
            data = new Blob([textData], { type: contentType });
          }

          // The verification hash will come from the trusted gateways via verification events

          // Note: We only want to display the x-ar-io-digest from trusted gateways,
          // not self-computed hashes. The verification hash should come from the verification events.
        } catch (error) {
          logger.error(`Failed to process content for ${txId}:`, error);
          throw error;
        }

        // Cache both URL and full content
        this.urlCache.set(cacheKey, {
          url: gatewayUrl,
          timestamp: Date.now(),
          gateway,
        });

        // Cache the verified content for future use
        this.contentCache.set(cacheKey, {
          data,
          contentType,
          url: gatewayUrl,
          gateway,
          verified: false, // Will be updated by verification events
          verificationStatus: this.getVerificationStatus(txId),
          timestamp: Date.now(),
          size: data.size,
        });

        // Set initial status based on verification configuration
        this.setVerificationStatus(txId, {
          txId,
          status: this.config.verification.enabled ? "verifying" : "not-verified",
          gateway,
          timestamp: Date.now(),
        });

        // Trigger cache cleanup periodically (every 5 minutes)
        this.maybeCleanupCaches();

        return {
          url: gatewayUrl,
          gateway,
          verified: false, // Will be updated by verification events
          verificationStatus: this.getVerificationStatus(txId),
          contentType,
          data,
          fromCache: false,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        
        // Classify the error type
        const isGatewayError = errorMessage.includes("Process qNvAoz") || 
                              errorMessage.includes("rate limit") ||
                              errorMessage.includes("CU") ||
                              errorMessage.includes("gateway") ||
                              errorMessage.includes("Failed to get") ||
                              errorMessage.includes("Network error") ||
                              errorMessage.includes("timeout");
        
        if (isGatewayError) {
          // This is a routing/gateway error, not a verification error
          logger.warn(
            "AR.IO gateway network temporarily unavailable, using direct gateway instead:",
            error
          );
          logger.info(
            "Content will still load normally via direct gateway connection"
          );
          
          // Only set verification status if verification is enabled
          if (this.config.verification.enabled) {
            // For routing errors with verification enabled, we couldn't verify
            this.setVerificationStatus(txId, {
              txId,
              status: "not-verified",
              timestamp: Date.now(),
            });
          } else {
            // For routing errors with verification disabled, don't set any verification status
            // or set it to not-verified to avoid showing error icons
            this.setVerificationStatus(txId, {
              txId,
              status: "not-verified",
              timestamp: Date.now(),
            });
          }
        } else {
          // This is likely a verification error
          logger.warn(
            "Wayfinder verification failed:",
            error
          );
          
          // Only set failed status if verification was actually enabled
          if (this.config.verification.enabled) {
            this.setVerificationStatus(txId, {
              txId,
              status: "failed",
              error: errorMessage,
              timestamp: Date.now(),
            });
            
            // Notify listeners of verification failure
            this.handleVerificationEvent({
              type: "verification-failed",
              txId,
              error: errorMessage,
              timestamp: Date.now(),
            });
          } else {
            // Shouldn't happen, but handle gracefully
            this.setVerificationStatus(txId, {
              txId,
              status: "not-verified",
              timestamp: Date.now(),
            });
          }
        }

        // Return fallback on any error
        return this.getFallbackContentUrl(request);
      }
    }

    // Fallback to original gateway logic
    return this.getFallbackContentUrl(request);
  }

  /**
   * Fallback to original gateway system
   */
  private getFallbackContentUrl(request: ContentRequest): ContentResponse {
    const { txId, path = "" } = request;

    // Use the hostname-based fallback gateway detection
    // This ensures fallback uses the same gateway serving the Roam app
    const fallbackGateway =
      this.config.fallback.gateways[0] || determineFallbackGateway();
    const url = `${fallbackGateway}/${txId}${path}`;

    // Only set to 'not-verified' if there's no existing verification status
    // This preserves verified status for content that was previously verified
    const currentStatus = this.getVerificationStatus(txId);
    if (currentStatus.status === "pending") {
      this.setVerificationStatus(txId, {
        txId,
        status: "not-verified",
        gateway: fallbackGateway,
        timestamp: Date.now(),
      });
    }

    const finalStatus = this.getVerificationStatus(txId);
    return {
      url,
      gateway: fallbackGateway,
      verified: finalStatus.status === "verified",
      verificationStatus: finalStatus,
      data: null,
      contentType: null,
      fromCache: false,
    };
  }

  /**
   * Check if Wayfinder is available and working
   */
  async isAvailable(): Promise<boolean> {
    await this.initialize();
    return this.wayfinder !== null && this.config.enableWayfinder;
  }

  /**
   * Get verification status for a transaction
   */
  getVerificationStatus(txId: string): VerificationStatus {
    return (
      this.verificationStatuses.get(txId) || {
        txId,
        status: "pending",
        timestamp: Date.now(),
      }
    );
  }

  /**
   * Set verification status for a transaction
   */
  private setVerificationStatus(
    txId: string,
    status: VerificationStatus
  ): void {
    this.verificationStatuses.set(txId, status);
  }

  /**
   * Add event listener for verification events
   */
  addEventListener(listener: (event: VerificationEvent) => void): void {
    this.eventListeners.add(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: (event: VerificationEvent) => void): void {
    this.eventListeners.delete(listener);
  }

  /**
   * Handle verification events and notify listeners
   */
  private handleVerificationEvent(event: VerificationEvent): void {
    // Update verification status based on event type
    const currentStatus = this.getVerificationStatus(event.txId);

    switch (event.type) {
      case "verification-started":
        this.setVerificationStatus(event.txId, {
          ...currentStatus,
          status: "verifying",
        });
        break;
      case "verification-completed":
        logger.info(`Verification completed for ${event.txId}`);
        this.setVerificationStatus(event.txId, {
          ...currentStatus,
          status: "verified",
          gateway: event.gateway,
          verificationMethod: "hash",
        });

        // Update cached content verification status
        for (const [cacheKey, cached] of this.contentCache.entries()) {
          if (cacheKey.startsWith(event.txId)) {
            cached.verified = true;
            cached.verificationStatus = this.getVerificationStatus(event.txId);
          }
        }
        break;
      case "verification-failed":
        this.setVerificationStatus(event.txId, {
          ...currentStatus,
          status: "failed",
          error: event.error,
        });
        break;
      case "routing-succeeded":
        this.setVerificationStatus(event.txId, {
          ...currentStatus,
          gateway: event.gateway,
        });
        break;
    }

    // Notify all listeners
    this.eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        logger.warn("Error in verification event listener:", error);
      }
    });
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
   * Clear all caches
   */
  clearCache(): void {
    this.urlCache.clear();
    this.contentCache.clear();
    this.verificationStatuses.clear();
  }

  /**
   * Check if content is cached and still valid
   * Returns cached content response if available, null otherwise
   */
  getCachedContent(txId: string, path: string = ""): ContentResponse | null {
    const cacheKey = `${txId}${path}`;
    const cacheTimeout = 60 * 60 * 1000; // 1 hour cache

    // Check content cache first (has full blob data)
    const contentCached = this.contentCache.get(cacheKey);
    if (contentCached && Date.now() - contentCached.timestamp < cacheTimeout) {
      // Always get the most current verification status
      const currentVerificationStatus = this.getVerificationStatus(txId);
      const isVerified = currentVerificationStatus.status === "verified";

      logger.info(
        `Cache hit for ${txId} - returning cached content with verification status: ${currentVerificationStatus.status}`
      );

      return {
        url: contentCached.url,
        gateway: contentCached.gateway,
        verified: isVerified,
        verificationStatus: currentVerificationStatus,
        data: contentCached.data,
        contentType: contentCached.contentType,
        fromCache: true,
      };
    }

    return null;
  }

  /**
   * Clean up caches only if enough time has passed (throttled)
   */
  private maybeCleanupCaches(): void {
    const now = Date.now();
    const cleanupInterval = 5 * 60 * 1000; // 5 minutes

    if (now - this.lastCleanup > cleanupInterval) {
      this.cleanupCaches();
      this.lastCleanup = now;
    }
  }

  /**
   * Clean up old cache entries based on TTL and size limits
   */
  private cleanupCaches(): void {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // Default to 1 hour cache
    const maxCacheSize = 50; // Maximum number of cached items

    // Clean expired entries
    for (const [key, content] of this.contentCache.entries()) {
      if (now - content.timestamp > maxAge) {
        this.contentCache.delete(key);
      }
    }

    // Clean URL cache too
    for (const [key, cached] of this.urlCache.entries()) {
      if (now - cached.timestamp > maxAge) {
        this.urlCache.delete(key);
      }
    }

    // If still too many entries, remove oldest ones (LRU)
    if (this.contentCache.size > maxCacheSize) {
      const entries = Array.from(this.contentCache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      ); // Sort by timestamp (oldest first)

      const toRemove = entries.slice(0, entries.length - maxCacheSize);
      for (const [key] of toRemove) {
        this.contentCache.delete(key);
      }
    }
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(newConfig: Partial<WayfinderConfig>): void {
    logger.info("Updating Wayfinder configuration...");
    logger.info("Current config:", JSON.stringify(this.config, null, 2));
    logger.info("New config updates:", JSON.stringify(newConfig, null, 2));

    const oldConfig = JSON.parse(JSON.stringify(this.config)); // Deep clone

    // Merge the new configuration
    this.config = {
      ...this.config,
      ...newConfig,
      routing: {
        ...this.config.routing,
        ...(newConfig.routing || {}),
        gatewayProvider:
          newConfig.routing?.gatewayProvider ||
          this.config.routing.gatewayProvider,
        strategy: newConfig.routing?.strategy || this.config.routing.strategy,
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
    };

    logger.info("Merged config:", JSON.stringify(this.config, null, 2));

    // Save configuration to localStorage for persistence
    localStorage.setItem("wayfinder-config", JSON.stringify(this.config));

    // Check if we need to re-initialize Wayfinder due to significant config changes
    const needsReinitialization =
      oldConfig.enableWayfinder !== this.config.enableWayfinder ||
      JSON.stringify(oldConfig.routing) !==
        JSON.stringify(this.config.routing) ||
      JSON.stringify(oldConfig.verification) !==
        JSON.stringify(this.config.verification);

    logger.info(
      `Needs reinitialization: ${needsReinitialization}, Currently initialized: ${this.initialized}`
    );

    if (needsReinitialization && this.initialized) {
      logger.info("Clearing cache and reinitializing Wayfinder...");
      this.clearCache(); // Clear cache to ensure fresh routing
      this.initialized = false;
      this.wayfinder = null;
      this.initializationPromise = null;

      // Re-initialize if Wayfinder should be enabled
      if (this.config.enableWayfinder) {
        this.initialize().catch((error) => {
          logger.error(
            "Failed to re-initialize Wayfinder after config change:",
            error
          );
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
   * Apply a preset routing mode configuration
   */
  applyRoutingMode(mode: "balanced" | "fast" | "fair-share"): void {
    const routingConfigs = {
      balanced: {
        gatewayProvider: {
          type: "simple-cache" as const,
          config: {
            cacheTimeoutMinutes: 60,
            wrappedProvider: "network" as const,
            wrappedProviderConfig: {
              sortBy: "totalDelegatedStake" as const,
              sortOrder: "desc" as const,
              limit: 20, // Top 20 for quality + distribution
            },
          },
        },
        strategy: {
          strategy: "random" as const,
          staticGateway: "https://arweave.net",
          preferredGateway: "https://arweave.net",
          timeoutMs: 500,
          probePath: "/ar-io/info",
        },
      },
      fast: {
        gatewayProvider: {
          type: "simple-cache" as const,
          config: {
            cacheTimeoutMinutes: 60,
            wrappedProvider: "network" as const,
            wrappedProviderConfig: {
              sortBy: "totalDelegatedStake" as const,
              sortOrder: "desc" as const,
              limit: 10, // Smaller pool for faster ping testing
            },
          },
        },
        strategy: {
          strategy: "fastest-ping" as const,
          staticGateway: "https://arweave.net",
          preferredGateway: "https://arweave.net",
          timeoutMs: 500,
          probePath: "/ar-io/info",
        },
      },
      "fair-share": {
        gatewayProvider: {
          type: "simple-cache" as const,
          config: {
            cacheTimeoutMinutes: 60,
            wrappedProvider: "network" as const,
            wrappedProviderConfig: {
              sortBy: "totalDelegatedStake" as const,
              sortOrder: "desc" as const,
              limit: 30, // Larger pool for better distribution
            },
          },
        },
        strategy: {
          strategy: "round-robin" as const,
          staticGateway: "https://arweave.net",
          preferredGateway: "https://arweave.net",
          timeoutMs: 500,
          probePath: "/ar-io/info",
        },
      },
    };

    const routingConfig = routingConfigs[mode];
    if (routingConfig) {
      this.updateConfig({
        routing: routingConfig,
      });
    }
  }

  /**
   * Get current routing mode based on configuration
   */
  getCurrentRoutingMode(): "balanced" | "fast" | "fair-share" | "custom" {
    const { strategy, gatewayProvider } = this.config.routing;

    if (
      strategy.strategy === "random" &&
      gatewayProvider.type === "simple-cache" &&
      (gatewayProvider.config as any).wrappedProviderConfig?.limit === 20
    ) {
      return "balanced";
    }

    if (
      strategy.strategy === "fastest-ping" &&
      gatewayProvider.type === "simple-cache" &&
      (gatewayProvider.config as any).wrappedProviderConfig?.limit === 10
    ) {
      return "fast";
    }

    if (
      strategy.strategy === "round-robin" &&
      gatewayProvider.type === "simple-cache" &&
      (gatewayProvider.config as any).wrappedProviderConfig?.limit === 30
    ) {
      return "fair-share";
    }

    return "custom";
  }

  /**
   * Load configuration from localStorage
   */
  private loadPersistedConfig(): Partial<WayfinderConfig> {
    try {
      const stored = localStorage.getItem("wayfinder-config");
      if (stored) {
        const parsed = JSON.parse(stored);
        // Return the parsed config directly if it has the new structure
        if (parsed.routing && parsed.verification) {
          return parsed;
        }
        // Handle legacy config with just enableWayfinder
        if ('enableWayfinder' in parsed) {
          return { enableWayfinder: parsed.enableWayfinder };
        }
      }
    } catch (error) {
      logger.warn("Failed to load persisted Wayfinder config:", error);
    }
    return {};
  }

  /**
   * Get the current fallback gateway being used
   */
  getFallbackGateway(): string {
    return this.config.fallback.gateways[0] || determineFallbackGateway();
  }

  /**
   * Get service statistics with granular configuration details
   */
  getStats() {
    const totalRequests = this.verificationStatuses.size;
    const verified = Array.from(this.verificationStatuses.values()).filter(
      (s) => s.status === "verified"
    ).length;
    const failed = Array.from(this.verificationStatuses.values()).filter(
      (s) => s.status === "failed"
    ).length;

    return {
      // Master configuration
      enabled: this.config.enableWayfinder,
      initialized: this.initialized,
      fallbackGateway: this.getFallbackGateway(),

      // Provider configuration
      routingProvider: this.config.routing.gatewayProvider.type,
      verificationEnabled: this.config.verification.enabled,
      verificationProvider: this.config.verification.gatewayProvider.type,

      // Performance metrics
      totalRequests,
      verified,
      failed,
      verificationRate:
        totalRequests > 0 ? (verified / totalRequests) * 100 : 0,
      cacheSize: this.urlCache.size,
      contentCacheSize: this.contentCache.size,
    };
  }
}

// Create singleton instance
export const wayfinderService = new WayfinderService();

// Export the service class for testing
export { WayfinderService };

// Export the fallback detection function for testing
export { determineFallbackGateway };
