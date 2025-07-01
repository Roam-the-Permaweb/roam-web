// TypeScript interfaces for Wayfinder integration

export interface VerificationStatus {
  txId: string
  status: 'pending' | 'verifying' | 'verified' | 'failed' | 'not-verified'
  gateway?: string
  verificationMethod?: string
  error?: string
  timestamp: number
}

// Gateway provider configuration types
export interface NetworkProviderConfig {
  sortBy: 'operatorStake' | 'totalDelegatedStake'
  sortOrder: 'asc' | 'desc'
  limit: number
}

export interface StaticProviderConfig {
  gateways: string[]
}

export interface CacheProviderConfig {
  cacheTimeoutMinutes: number
  wrappedProvider: 'network' | 'static'
  wrappedProviderConfig: NetworkProviderConfig | StaticProviderConfig
}

export type GatewayProviderConfig = 
  | { type: 'network'; config: NetworkProviderConfig }
  | { type: 'static'; config: StaticProviderConfig }
  | { type: 'simple-cache'; config: CacheProviderConfig }

// Routing strategy configuration types
export interface RoutingStrategyConfig {
  strategy: 'random' | 'fastest-ping' | 'round-robin' | 'static' | 'preferred-fallback'
  // Strategy-specific configs
  staticGateway?: string         // For static strategy
  preferredGateway?: string      // For preferred-fallback strategy
  timeoutMs?: number            // For fastest-ping strategy
  probePath?: string            // For fastest-ping strategy
}

// Main configuration structure
export interface WayfinderConfig {
  // Master control
  enableWayfinder: boolean
  
  // AO Compute Unit configuration (optional)
  ao?: {
    cuUrl?: string  // Custom CU URL (default: https://cu.ardrive.io)
  }
  
  // Routing configuration (required when Wayfinder enabled)
  routing: {
    gatewayProvider: GatewayProviderConfig
    strategy: RoutingStrategyConfig
  }
  
  // Verification configuration (optional)
  verification: {
    enabled: boolean
    strategy: 'hash' | 'none'
    gatewayProvider: GatewayProviderConfig
    timeoutMs: number
  }
  
  // Fallback configuration (when Wayfinder disabled)
  fallback: {
    gateways: string[]
  }
  
  // Telemetry configuration (opt-in only)
  telemetry: {
    enabled: boolean      // Default: false (privacy-first)
    sampleRate: number    // Default: 0.1 (10% when enabled)
  }
}

export interface ContentRequest {
  txId: string
  path?: string
  headers?: Record<string, string>
  contentType?: string  // For size-aware loading decisions
  size?: number        // File size for threshold checking
}

export interface ContentResponse {
  url: string
  gateway: string
  data: Blob | null
  contentType: string | null,
  verified: boolean
  verificationStatus: VerificationStatus
  fromCache?: boolean
}

export interface CachedContent {
  data: Blob
  contentType: string
  url: string
  gateway: string
  verified: boolean
  verificationStatus: VerificationStatus
  timestamp: number
  size: number
}

export type VerificationEventType = 
  | 'verification-started'
  | 'verification-progress' 
  | 'verification-completed'
  | 'verification-failed'
  | 'routing-succeeded'
  | 'routing-failed'

export interface VerificationEvent {
  type: VerificationEventType
  txId: string
  gateway?: string
  progress?: number
  error?: string
  timestamp: number
}