import { 
  Wayfinder,
  SimpleCacheGatewaysProvider,
  NetworkGatewaysProvider,
  StaticGatewaysProvider,
  HashVerificationStrategy,
  TrustedGatewaysHashProvider,
  ARIO
} from '@ar.io/sdk'
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

// Default configuration - Wayfinder disabled by default (experimental)
const DEFAULT_CONFIG: WayfinderConfig = {
  enableVerification: false,
  enableWayfinder: false,
  gatewayLimit: 5,
  cacheTimeoutMinutes: 1, // Match example's 60 seconds
  verificationTimeoutMs: 10000, // Increase timeout
  fallbackGateways: GATEWAY_DATA_SOURCE.length > 0 ? GATEWAY_DATA_SOURCE : ['https://arweave.net', 'https://permagate.io']
}

class WayfinderService {
  private wayfinder: Wayfinder | null = null
  private config: WayfinderConfig
  private verificationStatuses = new Map<string, VerificationStatus>()
  private eventListeners = new Set<(event: VerificationEvent) => void>()
  private urlCache = new Map<string, { url: string; timestamp: number; gateway: string }>()
  private contentCache = new Map<string, CachedContent>()
  private initialized = false
  private lastCleanup = 0

  constructor(config: Partial<WayfinderConfig> = {}) {
    // Load persisted config first, then apply defaults and overrides
    const persistedConfig = this.loadPersistedConfig()
    this.config = { ...DEFAULT_CONFIG, ...persistedConfig, ...config }
    
    // Check environment variable for explicit enable/disable
    if (import.meta.env.VITE_ENABLE_WAYFINDER === 'true') {
      this.config.enableWayfinder = true
      this.config.enableVerification = true
      logger.info('Wayfinder enabled via environment variable')
    } else if (import.meta.env.VITE_ENABLE_WAYFINDER === 'false') {
      this.config.enableWayfinder = false
      this.config.enableVerification = false
      logger.info('Wayfinder explicitly disabled via environment variable')
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized || !this.config.enableWayfinder) {
      return
    }

    try {
      logger.info('Initializing Wayfinder service...')
      
      // Create gateway provider with caching
      const gatewaysProvider = new SimpleCacheGatewaysProvider({
        ttlSeconds: this.config.cacheTimeoutMinutes * 60,
        /*gatewaysProvider: new NetworkGatewaysProvider({
          ario: ARIO.mainnet(),
          sortBy: 'operatorStake',
          sortOrder: 'desc',
          limit: this.config.gatewayLimit,
        }),*/
          gatewaysProvider: new StaticGatewaysProvider({
            gateways: ['https://permagate.io'], // Multiple trusted gateways
          }),
      })

      // Create verification strategy if enabled
      let verificationStrategy
      if (this.config.enableVerification) {
        verificationStrategy = new HashVerificationStrategy({
          trustedHashProvider: new TrustedGatewaysHashProvider({
            gatewaysProvider: new StaticGatewaysProvider({
              gateways: ['https://permagate.io'], // Multiple trusted gateways
            }),
          }),
        })
        
        logger.debug('Configured trusted gateways for verification:', ['https://permagate.io'])
        logger.info('✅ Verification enabled with CORS mode for header access')
      }

      // Initialize Wayfinder - simplified like the example
      this.wayfinder = new Wayfinder({
        gatewaysProvider,
        verificationStrategy,
        events: {
          onVerificationPassed: (event) => {
            logger.debug(`✅ Verification succeeded for ${event.txId}`)
            this.handleVerificationEvent({
              type: 'verification-completed',
              txId: event.txId,
              gateway: 'verified',
              timestamp: Date.now()
            })
          },
          onVerificationFailed: (event) => {
            logger.warn('❌ Verification failed:', event)
            // Extract txId and error message from event
            const txId = (event as any).txId || 'unknown'
            const errorMessage = (event as any).error?.message || (event as any).message || 'Verification failed'
            
            // Log detailed failure information
            logger.warn(`Verification failure details for ${txId}:`, {
              error: errorMessage,
              event: event
            })
            
            this.handleVerificationEvent({
              type: 'verification-failed',
              txId,
              error: errorMessage,
              timestamp: Date.now()
            })
          },
          onVerificationProgress: (event) => {
            const percentage = (event.processedBytes / event.totalBytes) * 100;
            if (event.totalBytes > 0) {
              const progress = (event.processedBytes / event.totalBytes) * 100
              const roundedProgress = Math.round(progress / 10) * 10
                if (roundedProgress > 0) {
                  logger.debug(
                    `Verification progress for ${event.txId}: ${percentage.toFixed(2)}%`,
                  );
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

      this.initialized = true
      logger.info('Wayfinder service initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize Wayfinder:', error)
      this.config.enableWayfinder = false
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
   */
  async getContentUrl(request: ContentRequest, forceLoad: boolean = false): Promise<ContentResponse> {
    const { txId, path = '', contentType, size } = request
    const cacheKey = `${txId}${path}`

    // Check if we should auto-fetch based on size thresholds
    if (!forceLoad && contentType && size && !this.shouldAutoFetch(contentType, size)) {
      logger.debug(`Skipping auto-fetch for large ${contentType} file: ${size} bytes`)
      
      // Return URL-only response for large files (will show manual load button)
      const fallbackGateway = GATEWAY_DATA_SOURCE[0] || 'https://arweave.net'
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
        contentType,
        fromCache: false
      }
    }

    // Check content cache first for full content (verified data)
    const contentCached = this.contentCache.get(cacheKey)
    if (contentCached && Date.now() - contentCached.timestamp < this.config.cacheTimeoutMinutes * 60 * 1000) {
      // Always get the most current verification status from memory
      const currentVerificationStatus = this.getVerificationStatus(txId)
      const isVerified = currentVerificationStatus.status === 'verified'
      
      logger.debug(`Using cached verified content for ${txId}: ${contentCached.size} bytes, verified: ${isVerified}`)
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
      logger.debug(`Using cached URL for ${txId}: ${urlCached.url}`)
      return {
        url: urlCached.url,
        gateway: urlCached.gateway,
        verified: false, // URL cache doesn't store verification status
        verificationStatus: this.getVerificationStatus(txId),
        data: null, // No data in URL-only cache
        contentType: null, // Will be determined by caller
        fromCache: true
      }
    }

    // Initialize if needed
    await this.initialize()

    // Try Wayfinder first if enabled
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

        // Set up verification timeout
        if (this.config.enableVerification) {
          /*setTimeout(() => {
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
          }, this.config.verificationTimeoutMs) */
        }

        // Use request() method like the example
        logger.debug(`🧭 Making Wayfinder request for: ${arUrl}`)
        const response = await this.wayfinder.request(arUrl, {cache: "no-cache"})
        
        // Extract URL and content info from response
        const gatewayUrl = response.url
        const gateway = this.extractGatewayFromUrl(gatewayUrl)
        const contentType = response.headers.get('content-type') || 'application/octet-stream'
        
        // Debug response headers
        logger.debug(`📡 Wayfinder response headers for ${txId}:`, {
          url: gatewayUrl,
          status: response.status,
          contentType,
          headers: response.headers ? Object.fromEntries(response.headers.entries()) : 'No headers object',
          hasArIoDigest: response.headers?.has('x-ar-io-digest') || false,
          arIoDigest: response.headers?.get('x-ar-io-digest') || 'NOT FOUND'
        })
        
        // Handle content based on type to ensure proper verification completion
        let data: Blob
        try {
          if (contentType.startsWith('image/') || 
              contentType.startsWith('video/') || 
              contentType.startsWith('audio/') ||
              contentType === 'application/pdf' ||
              contentType.includes('octet-stream')) {
            // Handle binary content - use blob() to complete stream and trigger verification
            logger.debug(`Processing binary content for ${txId}: ${contentType}`)
            data = await response.blob()
          } else if (contentType.startsWith('application/json')) {
            // Handle JSON content
            logger.debug(`Processing JSON content for ${txId}: ${contentType}`)
            const jsonData = await response.json()
            data = new Blob([JSON.stringify(jsonData)], {type: contentType})
          } else {
            // Handle text content (HTML, plain text, etc.)
            logger.debug(`Processing text content for ${txId}: ${contentType}`)
            const textData = await response.text()
            data = new Blob([textData], {type: contentType})
          }
          
          logger.debug(`Successfully processed ${data.size} bytes for ${txId}`)
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

        logger.debug(`Cached verified content for ${txId}: ${data.size} bytes`)

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
        
        this.setVerificationStatus(txId, {
          txId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now()
        })
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
    
    // Use the original gateway system from GATEWAY_DATA_SOURCE
    // This maintains exact backwards compatibility
    const fallbackGateway = GATEWAY_DATA_SOURCE[0] || 'https://arweave.net'
    const url = `${fallbackGateway}/${txId}${path}`

    this.setVerificationStatus(txId, {
      txId,
      status: 'not-verified',
      gateway: fallbackGateway,
      timestamp: Date.now()
    })

    logger.debug(`Using fallback gateway for ${txId}: ${fallbackGateway}`)

    return {
      url,
      gateway: fallbackGateway,
      verified: false,
      verificationStatus: this.getVerificationStatus(txId),
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
            logger.debug(`Updated cache verification status for ${event.txId}`)
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
    logger.debug('Wayfinder caches cleared')
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
        logger.debug(`Removed expired cache entry: ${key}`)
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
        logger.debug(`Removed LRU cache entry: ${key}`)
      }
    }
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(newConfig: Partial<WayfinderConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // Save to localStorage for persistence
    localStorage.setItem('wayfinder-config', JSON.stringify({
      enableWayfinder: this.config.enableWayfinder,
      enableGraphQL: false // GraphQL not implemented yet
    }))
    
    logger.info('Wayfinder configuration updated:', this.config)
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
          enableWayfinder: parsed.enableWayfinder ?? true,
          enableVerification: parsed.enableWayfinder ?? true, // Follow wayfinder setting
          // GraphQL will be handled separately when implemented
        }
      }
    } catch (error) {
      logger.warn('Failed to load persisted Wayfinder config:', error)
    }
    return {}
  }

  /**
   * Get service statistics
   */
  getStats() {
    const totalRequests = this.verificationStatuses.size
    const verified = Array.from(this.verificationStatuses.values())
      .filter(s => s.status === 'verified').length
    const failed = Array.from(this.verificationStatuses.values())
      .filter(s => s.status === 'failed').length

    return {
      enabled: this.config.enableWayfinder,
      initialized: this.initialized,
      totalRequests,
      verified,
      failed,
      verificationRate: totalRequests > 0 ? (verified / totalRequests) * 100 : 0,
      cacheSize: this.urlCache.size
    }
  }
}

// Create singleton instance
export const wayfinderService = new WayfinderService()

// Export the service class for testing
export { WayfinderService }