import { useState, useEffect } from "preact/hooks";
import { wayfinderService } from "../services/wayfinder";
import { logger } from "../utils/logger";

export type RoutingMode = "balanced" | "fast" | "fair-share";

interface SimplifiedWayfinderSettings {
  enabled: boolean;
  routingMode: RoutingMode;
  verifiedBrowsing: boolean;
  telemetryEnabled: boolean;  // Opt-in telemetry
  cuUrl?: string;  // Custom CU URL
}

interface UseSimplifiedWayfinderSettingsResult {
  settings: SimplifiedWayfinderSettings;
  updateSettings: (newSettings: Partial<SimplifiedWayfinderSettings>) => void;
  isLoading: boolean;
  isConnected: boolean;
}

/**
 * Simplified hook for managing Wayfinder settings
 */
export function useSimplifiedWayfinderSettings(): UseSimplifiedWayfinderSettingsResult {
  const [settings, setSettings] = useState<SimplifiedWayfinderSettings>({
    enabled: true, // Default to enabled
    routingMode: "balanced", // Default to balanced mode
    verifiedBrowsing: false, // Default to off for performance
    telemetryEnabled: false, // Default to off for privacy
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = () => {
      try {
        const config = wayfinderService.getConfig();
        const currentMode = wayfinderService.getCurrentRoutingMode();

        setSettings({
          enabled: config.enableWayfinder,
          routingMode: currentMode === "custom" ? "balanced" : currentMode,
          verifiedBrowsing: config.verification.enabled,
          telemetryEnabled: config.telemetry.enabled,
          cuUrl: config.ao?.cuUrl,
        });

        setIsConnected(config.enableWayfinder);
      } catch (error) {
        logger.warn("Failed to load Wayfinder settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Update connection status based on enabled setting
  useEffect(() => {
    setIsConnected(settings.enabled);
  }, [settings.enabled]);

  const updateSettings = (
    newSettings: Partial<SimplifiedWayfinderSettings>
  ) => {
    logger.info("Updating simplified Wayfinder settings:", newSettings);

    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);

    // Apply routing mode if changed
    if (
      newSettings.routingMode &&
      newSettings.routingMode !== settings.routingMode
    ) {
      wayfinderService.applyRoutingMode(newSettings.routingMode);
    }

    // Build config update
    const configUpdate: any = {};

    // Only update enabled state if it changed
    if ("enabled" in newSettings) {
      configUpdate.enableWayfinder = updatedSettings.enabled;
    }

    // Only update verification if it changed
    if ("verifiedBrowsing" in newSettings) {
      logger.info("Updating verification setting to:", updatedSettings.verifiedBrowsing);
      configUpdate.verification = {
        enabled: updatedSettings.verifiedBrowsing,
        strategy: "hash",
        gatewayProvider: {
          type: "network",
          config: {
            sortBy: "totalDelegatedStake",
            sortOrder: "desc",
            limit: 5,
          },
        },
        timeoutMs: 30000,
      };
    }

    // Only update CU URL if it changed
    if ("cuUrl" in newSettings) {
      configUpdate.ao = {
        cuUrl: updatedSettings.cuUrl || undefined,
      };
    }

    // Only update telemetry if it changed
    if ("telemetryEnabled" in newSettings) {
      configUpdate.telemetry = {
        enabled: updatedSettings.telemetryEnabled,
        sampleRate: 0.1, // Keep default 10% sample rate
      };
    }

    // Update the service config
    if (Object.keys(configUpdate).length > 0) {
      wayfinderService.updateConfig(configUpdate);
    }
  };

  return {
    settings,
    updateSettings,
    isLoading,
    isConnected,
  };
}
