import { useState, useEffect } from "preact/hooks";
import { wayfinderService } from "../services/wayfinder";
import { logger } from "../utils/logger";
import type {
  WayfinderConfig,
  GatewayProviderConfig,
  NetworkProviderConfig,
  StaticProviderConfig,
  CacheProviderConfig,
  RoutingStrategyConfig,
} from "../services/wayfinderTypes";

interface WayfinderSettings {
  // Master control
  enableWayfinder: boolean;

  // Routing settings
  routingProvider: "network" | "static" | "simple-cache";
  routingNetworkLimit: number;
  routingNetworkSortBy: "operatorStake" | "totalDelegatedStake";
  routingStaticGateways: string[];
  routingCacheProvider: "network" | "static";
  routingCacheTimeout: number;
  routingStrategy:
    | "random"
    | "fastest-ping"
    | "round-robin"
    | "static"
    | "preferred-fallback";
  routingStaticGateway: string;
  routingPreferredGateway: string;
  routingTimeoutMs: number;
  routingProbePath: string;

  // Verification settings
  verificationEnabled: boolean;
  verificationStrategy: "hash" | "none";
  verificationProvider: "network" | "static" | "simple-cache";
  verificationNetworkLimit: number;
  verificationNetworkSortBy: "operatorStake" | "totalDelegatedStake";
  verificationStaticGateways: string[];
  verificationCacheProvider: "network" | "static";
  verificationCacheTimeout: number;
  verificationTimeoutMs: number;

  // Fallback settings
  fallbackGateways: string[];

  // Future features
  enableGraphQL: boolean;
}

interface UseWayfinderSettingsResult {
  settings: WayfinderSettings;
  updateSettings: (newSettings: Partial<WayfinderSettings>) => void;
  isLoading: boolean;
  resetToDefaults: () => void;
  validationErrors: Record<string, string>;
  isConnected: boolean;
}

/**
 * Hook for managing Wayfinder settings with persistence
 */
export function useWayfinderSettings(): UseWayfinderSettingsResult {
  const [settings, setSettings] = useState<WayfinderSettings>({
    // Master control - disabled by default
    enableWayfinder: false,

    // Routing settings
    routingProvider: "simple-cache",
    routingNetworkLimit: 50,
    routingNetworkSortBy: "operatorStake",
    routingStaticGateways: ["https://vilenarios.com", "https://permagate.io"],
    routingCacheProvider: "network",
    routingCacheTimeout: 60,
    routingStrategy: "random",
    routingStaticGateway: "https://arweave.net",
    routingPreferredGateway: "https://arweave.net",
    routingTimeoutMs: 500,
    routingProbePath: "/ar-io/info",

    // Verification settings
    verificationEnabled: true,
    verificationStrategy: "hash",
    verificationProvider: "network",
    verificationNetworkLimit: 5,
    verificationNetworkSortBy: "operatorStake",
    verificationStaticGateways: [
      "https://permagate.io",
      "https://vilenarios.com",
    ],
    verificationCacheProvider: "network",
    verificationCacheTimeout: 1,
    verificationTimeoutMs: 20000,

    // Fallback settings
    fallbackGateways: ["https://arweave.net"],

    // Future features
    enableGraphQL: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [isConnected, setIsConnected] = useState(false);

  // Validate gateway URL format
  const validateGatewayUrl = (url: string): boolean => {
    try {
      const parsedUrl = new URL(url.trim());
      return parsedUrl.protocol === "https:" && parsedUrl.hostname.length > 0;
    } catch {
      return false;
    }
  };

  // Validate gateway array
  const validateGateways = (
    gateways: string[],
    fieldName: string
  ): string | null => {
    if (!gateways || gateways.length === 0) {
      return `${fieldName} cannot be empty`;
    }

    const invalidUrls = gateways.filter((url) => !validateGatewayUrl(url));
    if (invalidUrls.length > 0) {
      return `Invalid URLs: ${invalidUrls.join(", ")}. URLs must use HTTPS.`;
    }

    return null;
  };

  // Load settings on mount
  useEffect(() => {
    const loadSettings = () => {
      try {
        const config = wayfinderService.getConfig();

        // Extract routing settings
        const routingProviderConfig = config.routing.gatewayProvider;
        const routingStrategy = config.routing.strategy;

        // Extract verification settings
        const verificationProviderConfig = config.verification.gatewayProvider;

        setSettings({
          // Master control
          enableWayfinder: config.enableWayfinder,

          // Routing settings
          routingProvider: routingProviderConfig.type,
          routingNetworkLimit:
            routingProviderConfig.type === "network"
              ? (routingProviderConfig.config as NetworkProviderConfig).limit
              : 10,
          routingNetworkSortBy:
            routingProviderConfig.type === "network"
              ? (routingProviderConfig.config as NetworkProviderConfig).sortBy
              : "operatorStake",
          routingStaticGateways:
            routingProviderConfig.type === "static"
              ? (routingProviderConfig.config as StaticProviderConfig).gateways
              : ["https://vilenarios.com", "https://permagate.io"],
          routingCacheProvider:
            routingProviderConfig.type === "simple-cache"
              ? (routingProviderConfig.config as CacheProviderConfig)
                  .wrappedProvider
              : "network",
          routingCacheTimeout:
            routingProviderConfig.type === "simple-cache"
              ? (routingProviderConfig.config as CacheProviderConfig)
                  .cacheTimeoutMinutes
              : 1,
          routingStrategy: routingStrategy.strategy,
          routingStaticGateway:
            routingStrategy.staticGateway || "https://arweave.net",
          routingPreferredGateway:
            routingStrategy.preferredGateway || "https://arweave.net",
          routingTimeoutMs: routingStrategy.timeoutMs || 500,
          routingProbePath: routingStrategy.probePath || "/ar-io/info",

          // Verification settings
          verificationEnabled: config.verification.enabled,
          verificationStrategy: config.verification.strategy,
          verificationProvider: verificationProviderConfig.type,
          verificationNetworkLimit:
            verificationProviderConfig.type === "network"
              ? (verificationProviderConfig.config as NetworkProviderConfig)
                  .limit
              : 5,
          verificationNetworkSortBy:
            verificationProviderConfig.type === "network"
              ? (verificationProviderConfig.config as NetworkProviderConfig)
                  .sortBy
              : "operatorStake",
          verificationStaticGateways:
            verificationProviderConfig.type === "static"
              ? (verificationProviderConfig.config as StaticProviderConfig)
                  .gateways
              : ["https://permagate.io", "https://vilenarios.com"],
          verificationCacheProvider:
            verificationProviderConfig.type === "simple-cache"
              ? (verificationProviderConfig.config as CacheProviderConfig)
                  .wrappedProvider
              : "network",
          verificationCacheTimeout:
            verificationProviderConfig.type === "simple-cache"
              ? (verificationProviderConfig.config as CacheProviderConfig)
                  .cacheTimeoutMinutes
              : 1,
          verificationTimeoutMs: config.verification.timeoutMs,

          // Fallback settings
          fallbackGateways: config.fallback.gateways,

          // Future features
          enableGraphQL: false, // Not implemented yet
        });

        // Set initial connection status based on enabled state
        setIsConnected(config.enableWayfinder);
      } catch (error) {
        logger.warn("Failed to load Wayfinder settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Update connection status based on enableWayfinder setting
  useEffect(() => {
    // Simply reflect whether Wayfinder is enabled
    // Actual initialization happens lazily on first content request
    setIsConnected(settings.enableWayfinder);
  }, [settings.enableWayfinder]);

  const updateSettings = (newSettings: Partial<WayfinderSettings>) => {
    logger.info("Updating Wayfinder settings from UI...");
    logger.info("Current settings:", JSON.stringify(settings, null, 2));
    logger.info("New settings:", JSON.stringify(newSettings, null, 2));

    // Validate settings before applying
    const newErrors: Record<string, string> = {};
    const updatedSettings = { ...settings, ...newSettings };

    // Validate routing static gateways if provider is static
    if (
      updatedSettings.routingProvider === "static" &&
      "routingStaticGateways" in newSettings
    ) {
      const error = validateGateways(
        newSettings.routingStaticGateways!,
        "Routing static gateways"
      );
      if (error) newErrors.routingStaticGateways = error;
    }

    // Validate verification static gateways if provider is static
    if (
      updatedSettings.verificationProvider === "static" &&
      "verificationStaticGateways" in newSettings
    ) {
      const error = validateGateways(
        newSettings.verificationStaticGateways!,
        "Verification static gateways"
      );
      if (error) newErrors.verificationStaticGateways = error;
    }

    // Validate static routing gateway if routing strategy is static
    if (
      updatedSettings.routingStrategy === "static" &&
      "routingStaticGateway" in newSettings
    ) {
      if (!validateGatewayUrl(newSettings.routingStaticGateway!)) {
        newErrors.routingStaticGateway =
          "Invalid static routing gateway URL. Must use HTTPS.";
      }
    }

    // Validate preferred gateway if routing strategy is preferred-fallback
    if (
      updatedSettings.routingStrategy === "preferred-fallback" &&
      "routingPreferredGateway" in newSettings
    ) {
      if (!validateGatewayUrl(newSettings.routingPreferredGateway!)) {
        newErrors.routingPreferredGateway =
          "Invalid preferred gateway URL. Must use HTTPS.";
      }
    }

    // Validate fallback gateways
    if ("fallbackGateways" in newSettings) {
      const error = validateGateways(
        newSettings.fallbackGateways!,
        "Fallback gateways"
      );
      if (error) newErrors.fallbackGateways = error;
    }

    // Update validation errors
    setValidationErrors(newErrors);

    // Only proceed if no validation errors
    if (Object.keys(newErrors).length === 0) {
      setSettings(updatedSettings);

      // Convert UI settings to service configuration
      const serviceConfig: Partial<WayfinderConfig> = {};

      // Map settings to service config
      if ("enableWayfinder" in newSettings) {
        serviceConfig.enableWayfinder = newSettings.enableWayfinder;
      }

      // Build routing configuration
      const routingUpdated = Object.keys(newSettings).some((key) =>
        key.startsWith("routing")
      );
      if (routingUpdated) {
        // Build gateway provider config
        let gatewayProvider: GatewayProviderConfig;
        if (updatedSettings.routingProvider === "network") {
          gatewayProvider = {
            type: "network",
            config: {
              sortBy: updatedSettings.routingNetworkSortBy,
              sortOrder: "desc",
              limit: updatedSettings.routingNetworkLimit,
            },
          };
        } else if (updatedSettings.routingProvider === "static") {
          gatewayProvider = {
            type: "static",
            config: {
              gateways: updatedSettings.routingStaticGateways,
            },
          };
        } else {
          // simple-cache
          const wrappedConfig =
            updatedSettings.routingCacheProvider === "network"
              ? {
                  sortBy:
                    updatedSettings.routingNetworkSortBy as "operatorStake",
                  sortOrder: "desc" as const,
                  limit: updatedSettings.routingNetworkLimit,
                }
              : { gateways: updatedSettings.routingStaticGateways };

          gatewayProvider = {
            type: "simple-cache",
            config: {
              cacheTimeoutMinutes: updatedSettings.routingCacheTimeout,
              wrappedProvider: updatedSettings.routingCacheProvider,
              wrappedProviderConfig: wrappedConfig,
            },
          };
        }

        // Build routing strategy
        const strategy: RoutingStrategyConfig = {
          strategy: updatedSettings.routingStrategy,
          staticGateway: updatedSettings.routingStaticGateway,
          preferredGateway: updatedSettings.routingPreferredGateway,
          timeoutMs: updatedSettings.routingTimeoutMs,
          probePath: updatedSettings.routingProbePath,
        };

        serviceConfig.routing = {
          gatewayProvider,
          strategy,
        };
      }

      // Build verification configuration
      const verificationUpdated = Object.keys(newSettings).some((key) =>
        key.startsWith("verification")
      );
      if (verificationUpdated) {
        // Build gateway provider config
        let gatewayProvider: GatewayProviderConfig;
        if (updatedSettings.verificationProvider === "network") {
          gatewayProvider = {
            type: "network",
            config: {
              sortBy: updatedSettings.verificationNetworkSortBy,
              sortOrder: "desc",
              limit: updatedSettings.verificationNetworkLimit,
            },
          };
        } else if (updatedSettings.verificationProvider === "static") {
          gatewayProvider = {
            type: "static",
            config: {
              gateways: updatedSettings.verificationStaticGateways,
            },
          };
        } else {
          // simple-cache
          const wrappedConfig =
            updatedSettings.verificationCacheProvider === "network"
              ? {
                  sortBy:
                    updatedSettings.verificationNetworkSortBy as "operatorStake",
                  sortOrder: "desc" as const,
                  limit: updatedSettings.verificationNetworkLimit,
                }
              : { gateways: updatedSettings.verificationStaticGateways };

          gatewayProvider = {
            type: "simple-cache",
            config: {
              cacheTimeoutMinutes: updatedSettings.verificationCacheTimeout,
              wrappedProvider: updatedSettings.verificationCacheProvider,
              wrappedProviderConfig: wrappedConfig,
            },
          };
        }

        serviceConfig.verification = {
          enabled: updatedSettings.verificationEnabled,
          strategy: updatedSettings.verificationStrategy,
          gatewayProvider,
          timeoutMs: updatedSettings.verificationTimeoutMs,
        };
      }

      // Update fallback configuration
      if ("fallbackGateways" in newSettings) {
        serviceConfig.fallback = {
          gateways: updatedSettings.fallbackGateways,
        };
      }

      try {
        logger.info(
          "Updating Wayfinder service with config:",
          JSON.stringify(serviceConfig, null, 2)
        );
        // Update the wayfinder service
        wayfinderService.updateConfig(serviceConfig);
        logger.info("Wayfinder service updated successfully");
      } catch (error) {
        logger.error("Failed to update Wayfinder service:", error);
        // Revert settings on service update failure
        setSettings(settings);
        setValidationErrors({
          general: "Failed to apply settings. Please try again.",
        });
      }
    } else {
      logger.warn("Validation errors prevented settings update:", newErrors);
    }
  };

  const resetToDefaults = () => {
    const defaultSettings: WayfinderSettings = {
      enableWayfinder: false,
      routingProvider: "simple-cache",
      routingNetworkLimit: 50,
      routingNetworkSortBy: "operatorStake",
      routingStaticGateways: ["https://vilenarios.com", "https://permagate.io"],
      routingCacheProvider: "network",
      routingCacheTimeout: 60,
      routingStrategy: "random",
      routingStaticGateway: "https://arweave.net",
      routingPreferredGateway: "https://arweave.net",
      routingTimeoutMs: 500,
      routingProbePath: "/ar-io/info",
      verificationEnabled: true,
      verificationStrategy: "hash",
      verificationProvider: "network",
      verificationNetworkLimit: 5,
      verificationNetworkSortBy: "operatorStake",
      verificationStaticGateways: [
        "https://permagate.io",
        "https://vilenarios.com",
      ],
      verificationCacheProvider: "network",
      verificationCacheTimeout: 1,
      verificationTimeoutMs: 20000,
      fallbackGateways: ["https://arweave.net"],
      enableGraphQL: false,
    };

    updateSettings(defaultSettings);
  };

  return {
    settings,
    updateSettings,
    resetToDefaults,
    isLoading,
    validationErrors,
    isConnected,
  };
}
