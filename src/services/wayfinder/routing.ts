/**
 * Routing strategy creation and management for Wayfinder service
 */

import {
  RandomRoutingStrategy,
  StaticRoutingStrategy,
  FastestPingRoutingStrategy,
  RoundRobinRoutingStrategy,
  SimpleCacheRoutingStrategy,
  NetworkGatewaysProvider,
  StaticGatewaysProvider,
  SimpleCacheGatewaysProvider,
} from "@ar.io/wayfinder-core";
import { ARIO, AOProcess } from "@ar.io/sdk";
import { connect } from "@permaweb/aoconnect";
import { logger } from "../../utils/logger";
import { retryWithBackoff } from "../../utils/retry";
import type {
  GatewayProviderConfig,
  NetworkProviderConfig,
  StaticProviderConfig,
  CacheProviderConfig,
} from "../wayfinderTypes";

/**
 * Create ARIO instance with optional custom CU URL
 */
export function createArioInstance(cuUrl?: string) {
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
 * Create gateway provider based on configuration
 */
export function createGatewayProvider(
  providerConfig: GatewayProviderConfig,
  fallbackGateways: string[],
  cuUrl?: string
): any {
  logger.info(`Creating gateway provider of type: ${providerConfig.type}`);

  switch (providerConfig.type) {
    case "network": {
      const config = providerConfig.config as NetworkProviderConfig;
      const provider = new NetworkGatewaysProvider({
        ario: createArioInstance(cuUrl),
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
      const wrappedProvider = createGatewayProvider(
        {
          type: config.wrappedProvider,
          config: config.wrappedProviderConfig,
        } as GatewayProviderConfig,
        fallbackGateways,
        cuUrl
      );

      return new SimpleCacheGatewaysProvider({
        ttlSeconds: config.cacheTimeoutMinutes * 60,
        gatewaysProvider: wrappedProvider,
      });
    }

    default:
      // Fallback to static provider
      return new StaticGatewaysProvider({
        gateways: fallbackGateways,
      });
  }
}

/**
 * Routing strategy configuration
 */
export interface RoutingStrategyConfig {
  strategy: string;
  staticGateway?: string;
  timeoutMs?: number;
}

/**
 * Create routing strategy
 */
export async function createRoutingStrategy(
  config: RoutingStrategyConfig,
  gatewayProvider?: any,
  fallbackGateways?: string[]
) {
  logger.info(`Creating routing strategy: ${config.strategy}`);
  
  // Validate strategy parameter
  if (typeof config.strategy !== 'string') {
    logger.error('Invalid strategy parameter:', config.strategy);
    logger.warn('Falling back to random strategy due to invalid parameter');
    return new RandomRoutingStrategy();
  }

  switch (config.strategy) {
    case "random": {
      logger.info("Creating RandomRoutingStrategy instance");
      const randomStrategy = new RandomRoutingStrategy();
      logger.info("RandomRoutingStrategy created:", {
        constructorName: randomStrategy.constructor.name,
        strategyType: typeof randomStrategy
      });
      return randomStrategy;
    }

    case "static": {
      const staticGateway = config.staticGateway || "https://arweave.net";
      return new StaticRoutingStrategy({ gateway: staticGateway });
    }

    case "fastest-ping": {
      const timeoutMs = config.timeoutMs || 750;
      const baseStrategy = new FastestPingRoutingStrategy({ timeoutMs });
      
      // Wrap with caching to avoid pinging on every request
      // Cache the fastest gateway for 15 minutes
      logger.info("Wrapping FastestPingRoutingStrategy with 15-minute cache");
      return new SimpleCacheRoutingStrategy({
        routingStrategy: baseStrategy,
        ttlSeconds: 15 * 60, // 15 minutes
        logger: logger as any,
      });
    }

    case "round-robin": {
      let gateways: URL[];
      if (gatewayProvider) {
        try {
          gateways = await gatewayProvider.getGateways();
        } catch (error) {
          logger.warn(
            "Failed to get gateways from provider, using fallback:",
            error
          );
          gateways = (fallbackGateways || []).map((url) => new URL(url));
        }
      } else {
        gateways = (fallbackGateways || []).map((url) => new URL(url));
      }
      return new RoundRobinRoutingStrategy({ gateways });
    }

    default:
      logger.warn(
        `Unknown routing strategy: ${config.strategy}, falling back to random`
      );
      return new RandomRoutingStrategy();
  }
}

/**
 * Create verification strategy with independent trusted gateways
 */
export async function createVerificationStrategy(
  enabled: boolean,
  strategy: string,
  cuUrl?: string
): Promise<unknown> {
  logger.info("Creating verification strategy, config:", {
    enabled,
    strategy
  });
  
  if (!enabled || strategy === "none") {
    logger.info("Verification disabled or strategy is 'none', returning undefined");
    return undefined;
  }

  const { HashVerificationStrategy } = await import("@ar.io/wayfinder-core");

  // Create independent gateway provider for verification (separate from routing)
  let verificationGateways: URL[];
  try {
    logger.info("Fetching top 5 gateways by totalDelegatedStake for verification");
    
    // Create dedicated network provider for verification trusted gateways
    const ario = createArioInstance(cuUrl);
    const verificationGatewayProvider = new NetworkGatewaysProvider({
      ario,
      sortBy: "totalDelegatedStake", // Use most trusted gateways
      sortOrder: "desc",
      limit: 5, // Top 5 for verification
    });
    
    verificationGateways = await verificationGatewayProvider.getGateways();
    
    logger.info(
      `Verification gateways fetched: ${verificationGateways.length}`,
      verificationGateways.map(g => g.toString())
    );
    
    // Validate that we have proper gateway URLs
    const validGateways = verificationGateways.filter(g => {
      const url = g.toString();
      return url.startsWith('https://') && !url.includes('undefined') && !url.includes('localhost');
    });
    
    if (validGateways.length < 3) {
      logger.warn("Not enough valid verification gateways, using hardcoded fallback");
      throw new Error("Invalid verification gateways received");
    }
    
    verificationGateways = validGateways.slice(0, 5); // Ensure we only use top 5
  } catch (error) {
    logger.error("Failed to get verification gateways:", error);
    // Use hardcoded trusted gateways as fallback
    verificationGateways = [
      new URL("https://permagate.io"),
      new URL("https://vilenarios.com"), 
      new URL("https://arweave.net"),
      new URL("https://g8way.io"),
      new URL("https://ar-io.net"),
    ];
  }

  const verificationStrategy = new HashVerificationStrategy({
    trustedGateways: verificationGateways,
  });
  
  logger.info("Verification strategy created successfully with gateways:", 
    verificationGateways.map(g => g.toString())
  );
  logger.info("Verification strategy configured with maxConcurrency: 1");
  
  return verificationStrategy;
}