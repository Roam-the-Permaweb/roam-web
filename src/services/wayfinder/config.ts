/**
 * Configuration management for Wayfinder
 */

import type { WayfinderConfig } from "../wayfinderTypes";
import { logger } from "../../utils/logger";

/**
 * Determine the fallback gateway based on current hostname
 */
export function determineFallbackGateway(): string {
  try {
    const hostname = window.location.hostname.toLowerCase();

    // For ar.io domains, use arweave.net as fallback
    if (hostname === "roam.ar.io" || hostname.endsWith(".ar.io")) {
      return "https://arweave.net";
    }

    // Extract gateway from roam.gateway.com pattern
    if (hostname.startsWith("roam.")) {
      const gatewayDomain = hostname.substring(5); // Remove 'roam.' prefix
      return `https://${gatewayDomain}`;
    }

    // Handle localhost and development scenarios
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.")
    ) {
      return "https://arweave.net";
    }

    // For direct gateway hosting (e.g., permagate.io/roam)
    if (hostname.includes(".")) {
      return `https://${hostname}`;
    }

    // Default fallback
    return "https://arweave.net";
  } catch (error) {
    logger.warn("Failed to determine fallback gateway from hostname:", error);
    return "https://arweave.net";
  }
}

/**
 * Default configuration - Wayfinder enabled with Balanced mode
 */
export const DEFAULT_CONFIG: WayfinderConfig = {
  // Master switch - enabled by default
  enableWayfinder: true,

  // AO configuration
  ao: {
    cuUrl: undefined, // Uses default https://cu.ardrive.io
  },

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

  // Telemetry configuration - disabled by default for privacy
  telemetry: {
    enabled: false, // Opt-in only - user must explicitly enable
    sampleRate: 0.1, // 10% sample rate when enabled
  },
};

/**
 * Routing mode presets
 */
export const ROUTING_MODE_CONFIGS = {
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
      timeoutMs: 1000, // 1000ms timeout as requested
      probePath: "/ar-io/info",
    },
    // Note: FastestPingRoutingStrategy is wrapped with SimpleCacheRoutingStrategy
    // in createRoutingStrategy() to cache the fastest gateway for 15 minutes
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
  self: {
    gatewayProvider: {
      type: "static" as const,
      config: {
        gateways: [determineFallbackGateway()], // Use current gateway
      },
    },
    strategy: {
      strategy: "static" as const,
      staticGateway: determineFallbackGateway(),
      preferredGateway: determineFallbackGateway(),
      timeoutMs: 500,
      probePath: "/ar-io/info",
    },
  },
};

/**
 * Load configuration from localStorage
 */
export function loadPersistedConfig(): Partial<WayfinderConfig> {
  try {
    const stored = localStorage.getItem("wayfinder-config");
    if (stored) {
      const parsed = JSON.parse(stored);

      // Validate the structure is correct
      if (parsed.routing && parsed.routing.strategy) {
        // Check if strategy has the correct structure
        if (
          typeof parsed.routing.strategy === "object" &&
          "strategy" in parsed.routing.strategy
        ) {
          logger.debug("Loaded valid persisted config");
          return parsed;
        } else {
          logger.warn(
            "Invalid routing strategy structure in persisted config, ignoring"
          );
          // Clear invalid config
          localStorage.removeItem("wayfinder-config");
          return {};
        }
      }

      // Handle legacy config with just enableWayfinder
      if ("enableWayfinder" in parsed) {
        return { enableWayfinder: parsed.enableWayfinder };
      }
    }
  } catch (error) {
    logger.warn("Failed to load persisted Wayfinder config:", error);
  }
  return {};
}

/**
 * Save configuration to localStorage
 */
export function saveConfig(config: WayfinderConfig): void {
  try {
    localStorage.setItem("wayfinder-config", JSON.stringify(config));
  } catch (error) {
    logger.warn("Failed to save Wayfinder config:", error);
  }
}

/**
 * Validate configuration for consistency
 */
export function validateConfig(config: WayfinderConfig): WayfinderConfig {
  const validated = { ...config };

  // Validate static routing configuration
  if (
    validated.routing.strategy.strategy === "static" &&
    !validated.routing.strategy.staticGateway
  ) {
    validated.routing.strategy.staticGateway = "https://arweave.net";
  }

  // Validate timeout values
  if (validated.verification.timeoutMs <= 0) {
    validated.verification.timeoutMs = 30000;
  }

  if (
    validated.routing.strategy.timeoutMs &&
    validated.routing.strategy.timeoutMs <= 0
  ) {
    validated.routing.strategy.timeoutMs = 500;
  }

  return validated;
}

/**
 * Get current routing mode based on configuration
 */
export function getCurrentRoutingMode(
  config: WayfinderConfig
): "balanced" | "fast" | "fair-share" | "self" | "custom" {
  const { strategy, gatewayProvider } = config.routing;

  // Check for self mode (static strategy with static gateway provider)
  if (
    strategy.strategy === "static" &&
    gatewayProvider.type === "static"
  ) {
    return "self";
  }

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
