import { 
  Wayfinder,
  SimpleCacheGatewaysProvider,
  NetworkGatewaysProvider,
  StaticGatewaysProvider,
  HashVerificationStrategy,
  RandomRoutingStrategy,
  StaticRoutingStrategy,
  FastestPingRoutingStrategy,
  RoundRobinRoutingStrategy
} from '@ar.io/wayfinder-core'
import { ARIO } from '@ar.io/sdk'
import { logger } from '../utils/logger'
import { GATEWAY_DATA_SOURCE } from '../engine/fetchQueue'
import type { 
  WayfinderConfig,
  VerificationStatus,
  ContentRequest,
  ContentResponse,
  VerificationEvent,
  CachedContent
} from './wayfinderTypes'

/**
 * Determine the fallback gateway based on the current hostname
 * If viewing on roam.ar.io -> use arweave.net
 * If viewing on roam.somegateway.com -> use https://somegateway.com
 * Otherwise use first available gateway from GATEWAY_DATA_SOURCE
 */
function determineFallbackGateway(): string {
  try {
    const hostname = window.location.hostname.toLowerCase()
    
    // Special case: roam.ar.io should use arweave.net
    if (hostname === 'roam.ar.io') {
      logger.info('Detected roam.ar.io hostname, using arweave.net as fallback')
      return 'https://arweave.net'
    }
    
    // Extract gateway from roam.gateway.com pattern
    if (hostname.startsWith('roam.')) {
      const gatewayDomain = hostname.substring(5) // Remove 'roam.' prefix
      const fallbackUrl = `https://${gatewayDomain}`
      logger.info(`Detected roam subdomain on ${gatewayDomain}, using ${fallbackUrl} as fallback`)
      return fallbackUrl
    }
    
    // Handle localhost and development scenarios
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
      const fallback = GATEWAY_DATA_SOURCE[0] || 'https://arweave.net'
      logger.info(`Development environment detected, using configured fallback: ${fallback}`)
      return fallback
    }
    
    // For direct gateway hosting (e.g., permagate.io/roam, ardrive.net/roam)
    // Use the current hostname as the gateway
    if (hostname.includes('.')) {
      const fallbackUrl = `https://${hostname}`
      logger.info(`Direct gateway hosting detected, using ${fallbackUrl} as fallback`)
      return fallbackUrl
    }
    
    // Final fallback: use configured data source or arweave.net
    const fallback = GATEWAY_DATA_SOURCE[0] || 'https://arweave.net'
    logger.info(`Using default configured fallback gateway: ${fallback}`)
    return fallback
  } catch (error) {
    logger.warn('Failed to determine fallback gateway from hostname:', error)
    return GATEWAY_DATA_SOURCE[0] || 'https://arweave.net'
  }
}

// Default configuration - All Wayfinder features disabled by default (experimental)
const DEFAULT_CONFIG: WayfinderConfig = {
  // Master switch - disabled by default
  enableWayfinder: false,
  
  // Gateway provider configuration
  gatewayProvider: 'network',
  gatewayLimit: 5, // Top 5 staked gateways for better reliability
  staticGateways: ['https://arweave.net', 'https://permagate.io'],
  cacheTimeoutMinutes: 5, // Increased cache timeout to reduce requests
  
  // Routing configuration
  routingStrategy: 'random',  // Default to random for performance
  staticRoutingGateway: 'https://arweave.net',
  preferredGateway: 'https://arweave.net',
  routingTimeoutMs: 500,  // 500ms timeout for ping-based strategies
  probePath: '/ar-io/info',  // Default probe path for ping-based routing
  
  // Verification configuration  
  verificationStrategy: 'hash',  // Re-enabled with wayfinder-core 0.0.3-alpha.1
  // Default trusted gateways - will be replaced with top 5 staked gateways on init
  trustedGateways: [
    'https://arweave.net',
    'https://permagate.io', 
    'https://vilenarios.com',
    'https://arweave-search.goldsky.com',
    'https://g8way.io'
  ],
  verificationTimeoutMs: 20000,
  
  // Fallback configuration - uses hostname-based detection
  fallbackGateways: [determineFallbackGateway()]
}

/**
 * Custom routing strategy that avoids repeating the same gateway consecutively
 */
class AvoidRepeatRandomRoutingStrategy {
  private lastSelectedGateway: string | null = null
  private baseStrategy = new RandomRoutingStrategy()

  async selectGateway(options: { gateways: URL[], path?: string, subdomain?: string }): Promise<URL> {
    const { gateways } = options
    
    if (gateways.length <= 1) {
      // If only one gateway, use it
      const selected = await this.baseStrategy.selectGateway(options)
      this.lastSelectedGateway = selected.toString()
      return selected
    }

    // Filter out the last selected gateway if possible
    const availableGateways = this.lastSelectedGateway 
      ? gateways.filter(g => g.toString() !== this.lastSelectedGateway)
      : gateways

    // If filtering left us with no gateways, use all gateways
    const gatewaysToChooseFrom = availableGateways.length > 0 ? availableGateways : gateways

    // Select randomly from the filtered list
    const selected = await this.baseStrategy.selectGateway({ ...options, gateways: gatewaysToChooseFrom })
    this.lastSelectedGateway = selected.toString()
    return selected
  }
}

/**
 * Custom preferred-fallback routing strategy
 */
class PreferredFallbackRoutingStrategy {
  private preferredGateway: string
  private fallbackStrategy = new AvoidRepeatRandomRoutingStrategy()

  constructor(preferredGateway: string) {
    this.preferredGateway = preferredGateway
  }

  async selectGateway(options: { gateways: URL[], path?: string, subdomain?: string }): Promise<URL> {
    const { gateways } = options
    
    // Try to find the preferred gateway in the available list
    const preferred = gateways.find(g => g.toString() === this.preferredGateway || 
                                         g.toString() === this.preferredGateway + '/' ||
                                         g.host === new URL(this.preferredGateway).host)
    
    if (preferred) {
      return preferred
    }

    // If preferred gateway not available, fall back to random selection
    logger.info(`Preferred gateway ${this.preferredGateway} not available, falling back to random selection`)
    return this.fallbackStrategy.selectGateway(options)
  }
}

class WayfinderService {
  private wayfinder: Wayfinder | null = null
  private config: WayfinderConfig
  private verificationStatuses = new Map<string, VerificationStatus>()
  private eventListeners = new Set<(event: VerificationEvent) => void>()
  private urlCache = new Map<string, { url: string; timestamp: number; gateway: string }>()
  private contentCache = new Map<string, CachedContent>()
  // Note: AR.IO SDK does not currently expose x-ar-io-digest hashes in its public API
  private initialized = false
  private lastCleanup = 0
  private needsTrustedGatewayRefresh = false

  constructor(config: Partial<WayfinderConfig> = {}) {
    // Load persisted config first, then apply defaults and overrides
    const persistedConfig = this.loadPersistedConfig()
    this.config = { ...DEFAULT_CONFIG, ...persistedConfig, ...config }
    
    // Parse granular environment variables
    this.parseEnvironmentConfig()
    
    // Validate configuration
    this.validateConfiguration()
  }

  async initialize(): Promise<void> {
    if (this.initialized || !this.config.enableWayfinder) {
      return
    }

    try {
      logger.info('Initializing Wayfinder service')
      
      // Update trusted gateways to use top 5 staked gateways if using network provider
      if ((this.config.gatewayProvider === 'network' || this.config.gatewayProvider === 'simple-cache') &&
          this.needsTrustedGatewayRefresh) {
        await this.updateTrustedGatewaysFromNetwork()
        this.needsTrustedGatewayRefresh = false
      } else if (this.config.gatewayProvider === 'network' || this.config.gatewayProvider === 'simple-cache') {
        // First time initialization with network provider
        await this.updateTrustedGatewaysFromNetwork()
      }
      
      // Create gateway provider based on configuration
      const gatewaysProvider = this.createGatewayProvider()

      // Create verification strategy based on configuration
      const verificationStrategy = this.createVerificationStrategy()

      // Create routing strategy to avoid unnecessary network calls
      const routingStrategy = this.createRoutingStrategy()

      // Initialize Wayfinder - simplified like the example
      this.wayfinder = new Wayfinder({
        gatewaysProvider,
        verificationStrategy,
        routingStrategy,
        events: {
          onVerificationSucceeded: (event) => {
            // Gateway info not available in this event
            const gateway = 'verified'
            
            this.handleVerificationEvent({
              type: 'verification-completed',
              txId: event.txId,
              gateway,
              timestamp: Date.now()
            })
          },
          onVerificationFailed: (event) => {
            // event is an Error object, not a structured event
            this.handleVerificationEvent({
              type: 'verification-failed',
              txId: 'unknown', // txId not available in error
              error: event.message || 'Verification failed',
              timestamp: Date.now()
            })
          },
          onVerificationProgress: (event) => {
            if (event.totalBytes > 0) {
              const progress = (event.processedBytes / event.totalBytes) * 100
              const roundedProgress = Math.round(progress / 10) * 10
              if (roundedProgress > 0) {
                this.handleVerificationEvent({
                  type: 'verification-progress',
                  txId: event.txId,
                  progress: roundedProgress,
                  timestamp: Date.now()
                })
              }
            }
          },
        }
      })

      // Set up additional event listeners via emitter
      if (this.wayfinder.emitter) {
        this.wayfinder.emitter.on('routing-succeeded', (event) => {
          this.handleVerificationEvent({
            type: 'routing-succeeded',
            txId: 'unknown', // txId not available in routing events
            gateway: event.selectedGateway,
            timestamp: Date.now()
          })
        })
        
        this.wayfinder.emitter.on('routing-failed', (event) => {
          this.handleVerificationEvent({
            type: 'routing-failed',
            txId: 'unknown', // txId not available in routing events
            error: event.message || 'Routing failed',
            timestamp: Date.now()
          })
        })
      }

      this.initialized = true
      logger.info('Wayfinder service initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize Wayfinder:', error)
      this.config.enableWayfinder = false
    }
  }

  /**
   * Fetch top staked gateways from AR.IO network and update trusted gateways
   */
  private async updateTrustedGatewaysFromNetwork(): Promise<void> {
    try {
      logger.info('Fetching top staked gateways from AR.IO network...')
      
      // Use ARIO SDK directly to fetch gateways
      const ario = ARIO.mainnet()
      
      // Fetch gateways sorted by stake
      const gatewayResult = await ario.getGateways({
        sortBy: 'operatorStake',
        sortOrder: 'desc',
        limit: 100 // Fetch more to ensure we get active ones
      })
      
      logger.info(`ARIO.getGateways returned ${gatewayResult?.items?.length || 0} gateways`)
      
      if (gatewayResult?.items && gatewayResult.items.length > 0) {
        // Filter for active gateways and get top 5
        const activeGateways = gatewayResult.items
          .filter(g => g.status === 'joined') // Only active gateways
          .slice(0, 5) // Top 5 by stake
        
        logger.info(`Found ${activeGateways.length} active gateways from top staked`)
        
        // Convert to URLs
        const trustedGatewayUrls = activeGateways.map(gateway => {
          // Gateway objects have gatewayAddress (domain) and settings.protocol
          const protocol = gateway.settings?.protocol || 'https'
          const port = gateway.settings?.port
          const fqdn = gateway.settings?.fqdn || gateway.gatewayAddress
          
          // Build URL
          let url = `${protocol}://${fqdn}`
          if (port && port !== 443 && port !== 80) {
            url += `:${port}`
          }
          
          logger.info(`Gateway ${gateway.gatewayAddress}: stake=${gateway.operatorStake}, url=${url}`)
          
          return url
        })
        
        if (trustedGatewayUrls.length > 0) {
          this.config.trustedGateways = trustedGatewayUrls
          logger.info(`Updated trusted gateways to top ${trustedGatewayUrls.length} staked gateways:`, trustedGatewayUrls)
        } else {
          logger.warn('No active gateways found, keeping default trusted gateways')
        }
      } else {
        logger.warn('No gateways returned from network, keeping default trusted gateways')
      }
    } catch (error) {
      logger.error('Failed to fetch top staked gateways:', error)
      logger.info('Keeping default trusted gateways:', this.config.trustedGateways)
    }
  }

  /**
   * Parse granular environment variables for Wayfinder configuration
   */
  private parseEnvironmentConfig(): void {
    const env = import.meta.env

    // Master control - VITE_ENABLE_WAYFINDER enables both routing and verification
    if (env.VITE_ENABLE_WAYFINDER === 'true') {
      this.config.enableWayfinder = true
    } else if (env.VITE_ENABLE_WAYFINDER === 'false') {
      this.config.enableWayfinder = false
      return // Skip other parsing if master switch is off
    }

    // Legacy environment variable support (now enables master switch)
    if (env.VITE_WAYFINDER_ENABLE_ROUTING === 'true' || env.VITE_WAYFINDER_ENABLE_VERIFICATION === 'true') {
      this.config.enableWayfinder = true
    }

    // Gateway provider configuration
    if (env.VITE_WAYFINDER_GATEWAY_PROVIDER) {
      const provider = env.VITE_WAYFINDER_GATEWAY_PROVIDER as 'network' | 'static' | 'simple-cache'
      if (['network', 'static', 'simple-cache'].includes(provider)) {
        this.config.gatewayProvider = provider
      }
    }

    if (env.VITE_WAYFINDER_GATEWAY_LIMIT) {
      const limit = parseInt(env.VITE_WAYFINDER_GATEWAY_LIMIT)
      if (!isNaN(limit) && limit > 0) {
        this.config.gatewayLimit = limit
      }
    }

    if (env.VITE_WAYFINDER_STATIC_GATEWAYS) {
      this.config.staticGateways = env.VITE_WAYFINDER_STATIC_GATEWAYS.split(',').map((g: string) => g.trim())
    }

    // Verification configuration
    if (env.VITE_WAYFINDER_VERIFICATION_STRATEGY) {
      const strategy = env.VITE_WAYFINDER_VERIFICATION_STRATEGY as 'hash' | 'none'
      if (['hash', 'none'].includes(strategy)) {
        this.config.verificationStrategy = strategy
      }
    }

    if (env.VITE_WAYFINDER_TRUSTED_GATEWAYS) {
      this.config.trustedGateways = env.VITE_WAYFINDER_TRUSTED_GATEWAYS.split(',').map((g: string) => g.trim())
    }

    if (env.VITE_WAYFINDER_VERIFICATION_TIMEOUT) {
      const timeout = parseInt(env.VITE_WAYFINDER_VERIFICATION_TIMEOUT)
      if (!isNaN(timeout) && timeout > 0) {
        this.config.verificationTimeoutMs = timeout
      }
    }

    if (env.VITE_WAYFINDER_CACHE_TIMEOUT) {
      const timeout = parseInt(env.VITE_WAYFINDER_CACHE_TIMEOUT)
      if (!isNaN(timeout) && timeout > 0) {
        this.config.cacheTimeoutMinutes = timeout
      }
    }
    
    // Routing configuration
    if (env.VITE_WAYFINDER_ROUTING_STRATEGY) {
      const strategy = env.VITE_WAYFINDER_ROUTING_STRATEGY as 'random' | 'fastest-ping' | 'round-robin' | 'static' | 'preferred-fallback'
      if (['random', 'fastest-ping', 'round-robin', 'static', 'preferred-fallback'].includes(strategy)) {
        this.config.routingStrategy = strategy
      }
    }

    if (env.VITE_WAYFINDER_STATIC_ROUTING_GATEWAY) {
      this.config.staticRoutingGateway = env.VITE_WAYFINDER_STATIC_ROUTING_GATEWAY
    }

    if (env.VITE_WAYFINDER_PREFERRED_GATEWAY) {
      this.config.preferredGateway = env.VITE_WAYFINDER_PREFERRED_GATEWAY
    }

    if (env.VITE_WAYFINDER_ROUTING_TIMEOUT) {
      const timeout = parseInt(env.VITE_WAYFINDER_ROUTING_TIMEOUT)
      if (!isNaN(timeout) && timeout > 0) {
        this.config.routingTimeoutMs = timeout
      }
    }

  }

  /**
   * Validate configuration for consistency and correctness
   */
  private validateConfiguration(): void {
    const config = this.config

    // No additional validation needed - single master switch controls everything

    // Validate gateway provider configuration
    if (config.gatewayProvider === 'static' && (!config.staticGateways || config.staticGateways.length === 0)) {
      logger.warn('Static gateway provider selected but no static gateways configured, using fallback gateways')
      config.staticGateways = config.fallbackGateways
    }

    // Validate verification configuration when Wayfinder is enabled
    if (config.enableWayfinder && config.verificationStrategy === 'hash' && 
        (!config.trustedGateways || config.trustedGateways.length === 0)) {
      logger.warn('Hash verification enabled but no trusted gateways configured, using default trusted gateways')
      config.trustedGateways = ['https://permagate.io', 'https://vilenarios.com']
    }

    // Validate numeric values
    if (config.gatewayLimit <= 0) {
      config.gatewayLimit = 5
    }

    if (config.verificationTimeoutMs <= 0) {
      config.verificationTimeoutMs = 20000
    }

    if (config.cacheTimeoutMinutes <= 0) {
      config.cacheTimeoutMinutes = 1
    }
  }

  /**
   * Create gateway provider based on configuration
   */
  private createGatewayProvider() {
    if (!this.config.enableWayfinder) {
      return new StaticGatewaysProvider({
        gateways: this.config.fallbackGateways
      })
    }

    switch (this.config.gatewayProvider) {
      case 'network':
        return new SimpleCacheGatewaysProvider({
          ttlSeconds: 60 * 60, // Cache for 1 hour to minimize network requests
          gatewaysProvider: new NetworkGatewaysProvider({
            ario: this.createArioInstance(),
            sortBy: 'operatorStake',
            sortOrder: 'desc',
            limit: this.config.gatewayLimit,
          }),
        })

      case 'static':
        return new StaticGatewaysProvider({
          gateways: this.config.staticGateways
        })

      case 'simple-cache':
        return new SimpleCacheGatewaysProvider({
          ttlSeconds: this.config.cacheTimeoutMinutes * 60,
          gatewaysProvider: new NetworkGatewaysProvider({
            ario: this.createArioInstance(),
            sortBy: 'operatorStake',
            sortOrder: 'desc',
            limit: this.config.gatewayLimit,
          }),
        })

      default:
        return new StaticGatewaysProvider({
          gateways: this.config.fallbackGateways
        })
    }
  }

  /**
   * Create ARIO instance - simplified in new SDK
   */
  private createArioInstance() {
    // The new SDK handles AO connection internally
    // Cast to any to handle type mismatch between SDK versions
    return ARIO.mainnet() as any
  }

  /**
   * Create routing strategy based on configuration
   */
  private createRoutingStrategy() {
    switch (this.config.routingStrategy) {
      case 'random':
        return new AvoidRepeatRandomRoutingStrategy()
        
      case 'static':
        return new StaticRoutingStrategy({
          gateway: this.config.staticRoutingGateway || 'https://arweave.net'
        })
        
      case 'fastest-ping':
        return new FastestPingRoutingStrategy({
          timeoutMs: this.config.routingTimeoutMs || 500
        })
        
      case 'round-robin':
        // RoundRobinRoutingStrategy expects URL objects
        const gateways = this.config.staticGateways.map(url => new URL(url))
        return new RoundRobinRoutingStrategy({
          gateways: gateways.length > 0 ? gateways : [new URL('https://arweave.net')]
        })
        
      case 'preferred-fallback':
        // Create a custom preferred-fallback strategy
        return new PreferredFallbackRoutingStrategy(this.config.preferredGateway || 'https://arweave.net')
        
      default:
        return new AvoidRepeatRandomRoutingStrategy()
    }
  }

  /**
   * Create verification strategy based on configuration
   */
  private createVerificationStrategy() {
    if (!this.config.enableWayfinder || this.config.verificationStrategy === 'none') {
      logger.info('Verification strategy: disabled (none or Wayfinder disabled)')
      return undefined
    }

    switch (this.config.verificationStrategy) {
      case 'hash':
        logger.info(`Verification strategy: hash with trusted gateways: ${this.config.trustedGateways.join(', ')}`)
        return new HashVerificationStrategy({
          trustedGateways: this.config.trustedGateways.map(url => {
            // Ensure URL doesn't have trailing slash and is properly formatted
            const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url
            return new URL(cleanUrl)
          })
        })

      default:
        logger.warn('Unknown verification strategy:', this.config.verificationStrategy)
        return undefined
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

    if (contentType.startsWith('image/') && size > IMAGE_THRESHOLD) return false;
    if (contentType.startsWith('video/') && size > VIDEO_THRESHOLD) return false;
    if (contentType.startsWith('audio/') && size > AUDIO_THRESHOLD) return false;
    if ((contentType.startsWith('text/') || ['text/plain', 'text/markdown'].includes(contentType)) && size > TEXT_THRESHOLD) return false;
    
    return true;
  }

  /**
   * Get content URL via Wayfinder or fallback to original gateway
   * Now with intelligent caching and size-aware fetching
   * @param request Content request details
   * @param forceLoad Force loading even for large files
   * @param preload If true, only returns cached content or URL without verification
   */
  async getContentUrl(request: ContentRequest, forceLoad: boolean = false, preload: boolean = false): Promise<ContentResponse> {
    const { txId, path = '', contentType, size } = request
    const cacheKey = `${txId}${path}`

    // Check if we should auto-fetch based on size thresholds
    if (!forceLoad && contentType && size && !this.shouldAutoFetch(contentType, size)) {
      // Return URL-only response for large files (will show manual load button)
      const fallbackGateway = this.config.fallbackGateways[0] || determineFallbackGateway()
      const url = `${fallbackGateway}/${txId}${path}`

      return {
        url,
        gateway: fallbackGateway,
        verified: false,
        verificationStatus: {
          txId,
          status: 'not-verified',
          timestamp: Date.now()
        },
        data: null, // No data for large files unless forced
        contentType: contentType || null,
        fromCache: false
      }
    }

    // Check content cache first for full content (verified data)
    const contentCached = this.contentCache.get(cacheKey)
    if (contentCached && Date.now() - contentCached.timestamp < this.config.cacheTimeoutMinutes * 60 * 1000) {
      // Always get the most current verification status from memory
      const currentVerificationStatus = this.getVerificationStatus(txId)
      const isVerified = currentVerificationStatus.status === 'verified'
      
      return {
        url: contentCached.url,
        gateway: contentCached.gateway,
        verified: isVerified,
        verificationStatus: currentVerificationStatus,
        data: contentCached.data,
        contentType: contentCached.contentType,
        fromCache: true
      }
    }

    // Check URL cache for metadata-only response
    const urlCached = this.urlCache.get(cacheKey)
    if (urlCached && Date.now() - urlCached.timestamp < this.config.cacheTimeoutMinutes * 60 * 1000) {
      const currentVerificationStatus = this.getVerificationStatus(txId)
      const isVerified = currentVerificationStatus.status === 'verified'
      
      return {
        url: urlCached.url,
        gateway: urlCached.gateway,
        verified: isVerified, // Use actual verification status from memory
        verificationStatus: currentVerificationStatus,
        data: null, // No data in URL-only cache
        contentType: null, // Will be determined by caller
        fromCache: true
      }
    }

    // If preloading, return URL without verification
    if (preload) {
      const fallbackGateway = this.config.fallbackGateways[0] || determineFallbackGateway()
      const url = `${fallbackGateway}/${txId}${path}`
      
      return {
        url,
        gateway: fallbackGateway,
        verified: false,
        verificationStatus: {
          txId,
          status: 'not-verified',
          timestamp: Date.now()
        },
        data: null,
        contentType: contentType || null,
        fromCache: false
      }
    }

    // Initialize if needed
    await this.initialize()

    // Try Wayfinder if enabled  
    if (this.wayfinder && this.config.enableWayfinder) {
      try {
        const arUrl = `ar://${txId}${path}`
        
        // Set initial verification status
        this.setVerificationStatus(txId, {
          txId,
          status: 'verifying',
          timestamp: Date.now()
        })

        // Start verification event
        this.handleVerificationEvent({
          type: 'verification-started',
          txId,
          timestamp: Date.now()
        })

        // Set up verification timeout as a safety net
        if (this.config.enableWayfinder && this.config.verificationTimeoutMs > 0) {
          setTimeout(() => {
            const currentStatus = this.getVerificationStatus(txId)
            if (currentStatus.status === 'verifying') {
              logger.warn(`Verification timeout for ${txId} after ${this.config.verificationTimeoutMs}ms`)
              this.setVerificationStatus(txId, {
                txId,
                status: 'failed',
                error: 'Verification timeout',
                timestamp: Date.now()
              })
              
              // Notify listeners of timeout
              this.handleVerificationEvent({
                type: 'verification-failed',
                txId,
                error: 'Verification timeout',
                timestamp: Date.now()
              })
            }
          }, this.config.verificationTimeoutMs)
        }

        // Use request() method like the example
        const response = await this.wayfinder.request(arUrl)
        
        // Extract URL and content info from response
        const gatewayUrl = response.url
        const gateway = this.extractGatewayFromUrl(gatewayUrl)
        const contentType = response.headers.get('content-type') || 'application/octet-stream'
        
        // Handle content based on type to ensure proper verification completion
        let data: Blob
        try {
          if (contentType.startsWith('image/') || 
              contentType.startsWith('video/') || 
              contentType.startsWith('audio/') ||
              contentType === 'application/pdf' ||
              contentType.includes('octet-stream')) {
            // Handle binary content - use blob() to complete stream and trigger verification
            data = await response.blob()
          } else if (contentType.startsWith('application/json')) {
            // Handle JSON content
            const jsonData = await response.json()
            data = new Blob([JSON.stringify(jsonData)], {type: contentType})
          } else {
            // Handle text content (HTML, plain text, etc.)
            const textData = await response.text()
            data = new Blob([textData], {type: contentType})
          }
          
          // The verification hash will come from the trusted gateways via verification events
          
          // Note: We only want to display the x-ar-io-digest from trusted gateways, 
          // not self-computed hashes. The verification hash should come from the verification events.
          
        } catch (error) {
          logger.error(`Failed to process content for ${txId}:`, error)
          throw error
        }
        
        // Cache both URL and full content
        this.urlCache.set(cacheKey, {
          url: gatewayUrl,
          timestamp: Date.now(),
          gateway
        })

        // Cache the verified content for future use
        this.contentCache.set(cacheKey, {
          data,
          contentType,
          url: gatewayUrl,
          gateway,
          verified: false, // Will be updated by verification events
          verificationStatus: this.getVerificationStatus(txId),
          timestamp: Date.now(),
          size: data.size
        })

        // Set initial status - verification will be updated via events
        this.setVerificationStatus(txId, {
          txId,
          status: 'verifying',
          gateway,
          timestamp: Date.now()
        })

        // Trigger cache cleanup periodically (every 5 minutes)
        this.maybeCleanupCaches()

        return {
          url: gatewayUrl,
          gateway,
          verified: false, // Will be updated by verification events
          verificationStatus: this.getVerificationStatus(txId),
          contentType,
          data,
          fromCache: false
        }
      } catch (error) {
        logger.warn('Wayfinder request failed, falling back to original gateway:', error)
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.setVerificationStatus(txId, {
          txId,
          status: 'failed',
          error: errorMessage,
          timestamp: Date.now()
        })
        
        // Notify listeners of failure
        this.handleVerificationEvent({
          type: 'verification-failed',
          txId,
          error: errorMessage,
          timestamp: Date.now()
        })
        
        // Return fallback on error
        return this.getFallbackContentUrl(request)
      }
    }

    // Fallback to original gateway logic
    return this.getFallbackContentUrl(request)
  }

  /**
   * Fallback to original gateway system
   */
  private getFallbackContentUrl(request: ContentRequest): ContentResponse {
    const { txId, path = '' } = request
    
    // Use the hostname-based fallback gateway detection
    // This ensures fallback uses the same gateway serving the Roam app
    const fallbackGateway = this.config.fallbackGateways[0] || determineFallbackGateway()
    const url = `${fallbackGateway}/${txId}${path}`

    // Only set to 'not-verified' if there's no existing verification status
    // This preserves verified status for content that was previously verified
    const currentStatus = this.getVerificationStatus(txId)
    if (currentStatus.status === 'pending') {
      this.setVerificationStatus(txId, {
        txId,
        status: 'not-verified',
        gateway: fallbackGateway,
        timestamp: Date.now()
      })
    }

    const finalStatus = this.getVerificationStatus(txId)
    return {
      url,
      gateway: fallbackGateway,
      verified: finalStatus.status === 'verified',
      verificationStatus: finalStatus,
      data: null,
      contentType: null,
      fromCache: false
    }
  }

  /**
   * Check if Wayfinder is available and working
   */
  async isAvailable(): Promise<boolean> {
    await this.initialize()
    return this.wayfinder !== null && this.config.enableWayfinder
  }

  /**
   * Get verification status for a transaction
   */
  getVerificationStatus(txId: string): VerificationStatus {
    return this.verificationStatuses.get(txId) || {
      txId,
      status: 'pending',
      timestamp: Date.now()
    }
  }

  /**
   * Set verification status for a transaction
   */
  private setVerificationStatus(txId: string, status: VerificationStatus): void {
    this.verificationStatuses.set(txId, status)
  }

  /**
   * Add event listener for verification events
   */
  addEventListener(listener: (event: VerificationEvent) => void): void {
    this.eventListeners.add(listener)
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: (event: VerificationEvent) => void): void {
    this.eventListeners.delete(listener)
  }

  /**
   * Handle verification events and notify listeners
   */
  private handleVerificationEvent(event: VerificationEvent): void {
    // Update verification status based on event type
    const currentStatus = this.getVerificationStatus(event.txId)
    
    switch (event.type) {
      case 'verification-started':
        this.setVerificationStatus(event.txId, {
          ...currentStatus,
          status: 'verifying'
        })
        break
      case 'verification-completed':
        logger.info(`Verification completed for ${event.txId}`)
        this.setVerificationStatus(event.txId, {
          ...currentStatus,
          status: 'verified',
          gateway: event.gateway,
          verificationMethod: 'hash'
        })
        
        // Update cached content verification status
        for (const [cacheKey, cached] of this.contentCache.entries()) {
          if (cacheKey.startsWith(event.txId)) {
            cached.verified = true
            cached.verificationStatus = this.getVerificationStatus(event.txId)
          }
        }
        break
      case 'verification-failed':
        this.setVerificationStatus(event.txId, {
          ...currentStatus,
          status: 'failed',
          error: event.error
        })
        break
      case 'routing-succeeded':
        this.setVerificationStatus(event.txId, {
          ...currentStatus,
          gateway: event.gateway
        })
        break
    }

    // Notify all listeners
    this.eventListeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        logger.warn('Error in verification event listener:', error)
      }
    })
  }

  /**
   * Extract gateway hostname from URL
   */
  private extractGatewayFromUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      return `${urlObj.protocol}//${urlObj.host}`
    } catch {
      return 'unknown'
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.urlCache.clear()
    this.contentCache.clear()
    this.verificationStatuses.clear()
  }

  /**
   * Clean up caches only if enough time has passed (throttled)
   */
  private maybeCleanupCaches(): void {
    const now = Date.now()
    const cleanupInterval = 5 * 60 * 1000 // 5 minutes
    
    if (now - this.lastCleanup > cleanupInterval) {
      this.cleanupCaches()
      this.lastCleanup = now
    }
  }

  /**
   * Clean up old cache entries based on TTL and size limits
   */
  private cleanupCaches(): void {
    const now = Date.now()
    const maxAge = this.config.cacheTimeoutMinutes * 60 * 1000
    const maxCacheSize = 50 // Maximum number of cached items

    // Clean expired entries
    for (const [key, content] of this.contentCache.entries()) {
      if (now - content.timestamp > maxAge) {
        this.contentCache.delete(key)
      }
    }

    // Clean URL cache too
    for (const [key, cached] of this.urlCache.entries()) {
      if (now - cached.timestamp > maxAge) {
        this.urlCache.delete(key)
      }
    }

    // If still too many entries, remove oldest ones (LRU)
    if (this.contentCache.size > maxCacheSize) {
      const entries = Array.from(this.contentCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp) // Sort by timestamp (oldest first)
      
      const toRemove = entries.slice(0, entries.length - maxCacheSize)
      for (const [key] of toRemove) {
        this.contentCache.delete(key)
      }
    }
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(newConfig: Partial<WayfinderConfig>): void {
    const oldConfig = { ...this.config }
    
    // Check if we're switching to network provider
    const switchingToNetwork = 
      (oldConfig.gatewayProvider !== 'network' && oldConfig.gatewayProvider !== 'simple-cache') &&
      (newConfig.gatewayProvider === 'network' || newConfig.gatewayProvider === 'simple-cache')
    
    // For trusted gateways: Only override if explicitly provided OR we're not using network provider
    if ('trustedGateways' in newConfig && 
        (this.config.gatewayProvider === 'static' || switchingToNetwork)) {
      // Allow trusted gateway changes for static provider or when switching to network
      this.config = { ...this.config, ...newConfig }
    } else if (!('trustedGateways' in newConfig)) {
      // Normal config update without trusted gateway changes
      this.config = { ...this.config, ...newConfig }
    } else {
      // Skip trusted gateway override for network provider unless switching
      const { trustedGateways, ...configWithoutTrustedGateways } = newConfig
      this.config = { ...this.config, ...configWithoutTrustedGateways }
      logger.info('Preserving network-fetched trusted gateways, ignoring UI override')
    }
    
    // Handle network provider switch - trigger gateway refresh
    if (switchingToNetwork) {
      logger.info('Switching to network provider, will fetch top staked gateways on next initialization')
      // Mark that we need to refresh trusted gateways
      this.needsTrustedGatewayRefresh = true
    }
    
    // Save complete configuration to localStorage for persistence
    localStorage.setItem('wayfinder-config', JSON.stringify({
      enableWayfinder: this.config.enableWayfinder,
      gatewayProvider: this.config.gatewayProvider,
      gatewayLimit: this.config.gatewayLimit,
      cacheTimeoutMinutes: this.config.cacheTimeoutMinutes,
      routingStrategy: this.config.routingStrategy,
      staticRoutingGateway: this.config.staticRoutingGateway,
      preferredGateway: this.config.preferredGateway,
      routingTimeoutMs: this.config.routingTimeoutMs,
      verificationStrategy: this.config.verificationStrategy,
      verificationTimeoutMs: this.config.verificationTimeoutMs,
      staticGateways: this.config.staticGateways,
      trustedGateways: this.config.trustedGateways
    }))
    
    // Check if we need to re-initialize Wayfinder due to significant config changes
    const needsReinitialization = (
      oldConfig.enableWayfinder !== this.config.enableWayfinder ||
      oldConfig.gatewayProvider !== this.config.gatewayProvider ||
      oldConfig.gatewayLimit !== this.config.gatewayLimit ||
      oldConfig.cacheTimeoutMinutes !== this.config.cacheTimeoutMinutes ||
      oldConfig.routingStrategy !== this.config.routingStrategy ||
      oldConfig.staticRoutingGateway !== this.config.staticRoutingGateway ||
      oldConfig.preferredGateway !== this.config.preferredGateway ||
      oldConfig.routingTimeoutMs !== this.config.routingTimeoutMs ||
      oldConfig.verificationStrategy !== this.config.verificationStrategy ||
      oldConfig.verificationTimeoutMs !== this.config.verificationTimeoutMs ||
      JSON.stringify(oldConfig.staticGateways) !== JSON.stringify(this.config.staticGateways) ||
      JSON.stringify(oldConfig.trustedGateways) !== JSON.stringify(this.config.trustedGateways)
    )
    
    if (needsReinitialization && this.initialized) {
      this.initialized = false
      this.wayfinder = null
      
      // Re-initialize if Wayfinder should be enabled
      if (this.config.enableWayfinder) {
        this.initialize().catch(error => {
          logger.error('Failed to re-initialize Wayfinder after config change:', error)
        })
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): WayfinderConfig {
    return { ...this.config }
  }

  /**
   * Load configuration from localStorage
   */
  private loadPersistedConfig(): Partial<WayfinderConfig> {
    try {
      const stored = localStorage.getItem('wayfinder-config')
      if (stored) {
        const parsed = JSON.parse(stored)
        return {
          enableWayfinder: parsed.enableWayfinder,
          gatewayProvider: parsed.gatewayProvider,
          gatewayLimit: parsed.gatewayLimit,
          cacheTimeoutMinutes: parsed.cacheTimeoutMinutes,
          routingStrategy: parsed.routingStrategy,
          staticRoutingGateway: parsed.staticRoutingGateway,
          preferredGateway: parsed.preferredGateway,
          routingTimeoutMs: parsed.routingTimeoutMs,
          verificationStrategy: parsed.verificationStrategy,
          verificationTimeoutMs: parsed.verificationTimeoutMs,
          staticGateways: parsed.staticGateways,
          trustedGateways: parsed.trustedGateways
        }
      }
    } catch (error) {
      logger.warn('Failed to load persisted Wayfinder config:', error)
    }
    return {}
  }

  /**
   * Get the current fallback gateway being used
   */
  getFallbackGateway(): string {
    return this.config.fallbackGateways[0] || determineFallbackGateway()
  }

  /**
   * Get service statistics with granular configuration details
   */
  getStats() {
    const totalRequests = this.verificationStatuses.size
    const verified = Array.from(this.verificationStatuses.values())
      .filter(s => s.status === 'verified').length
    const failed = Array.from(this.verificationStatuses.values())
      .filter(s => s.status === 'failed').length

    return {
      // Master configuration
      enabled: this.config.enableWayfinder,
      initialized: this.initialized,
      fallbackGateway: this.getFallbackGateway(),
      
      // Provider configuration
      gatewayProvider: this.config.gatewayProvider,
      verificationStrategy: this.config.verificationStrategy,
      
      // Performance metrics
      totalRequests,
      verified,
      failed,
      verificationRate: totalRequests > 0 ? (verified / totalRequests) * 100 : 0,
      cacheSize: this.urlCache.size,
      contentCacheSize: this.contentCache.size
    }
  }
}

// Create singleton instance
export const wayfinderService = new WayfinderService()

// Export the service class for testing
export { WayfinderService }

// Export the fallback detection function for testing
export { determineFallbackGateway }
