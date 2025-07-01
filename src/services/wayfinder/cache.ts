/**
 * Cache management for Wayfinder content
 */

import type { CachedContent, VerificationStatus } from '../wayfinderTypes'
import { logger } from '../../utils/logger'

export class ContentCache {
  private urlCache = new Map<string, { url: string; timestamp: number; gateway: string }>()
  private contentCache = new Map<string, CachedContent>()
  private lastCleanup = 0
  private readonly cacheTimeout = 60 * 60 * 1000 // 1 hour
  private readonly cleanupInterval = 5 * 60 * 1000 // 5 minutes
  private readonly maxCacheSize = 50 // Maximum number of cached items

  /**
   * Get cached content if available and valid
   */
  getCachedContent(txId: string, path: string = ''): CachedContent | null {
    const cacheKey = `${txId}${path}`
    const cached = this.contentCache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      logger.info(`Cache hit for ${txId}`)
      return cached
    }
    
    return null
  }

  /**
   * Get cached URL if available and valid
   */
  getCachedUrl(
    txId: string,
    path: string = ''
  ): { url: string; gateway: string; timestamp: number } | null {
    const cacheKey = `${txId}${path}`
    const cached = this.urlCache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached
    }
    
    return null
  }

  /**
   * Cache content response
   */
  cacheContent(
    txId: string,
    path: string,
    content: CachedContent
  ): void {
    const cacheKey = `${txId}${path}`
    this.contentCache.set(cacheKey, content)
    
    // Also cache URL separately
    this.urlCache.set(cacheKey, {
      url: content.url,
      gateway: content.gateway,
      timestamp: content.timestamp,
    })
    
    // Trigger cleanup if needed
    this.maybeCleanup()
  }

  /**
   * Cache URL only (no content data)
   */
  cacheUrl(
    txId: string,
    path: string,
    url: string,
    gateway: string
  ): void {
    const cacheKey = `${txId}${path}`
    this.urlCache.set(cacheKey, {
      url,
      gateway,
      timestamp: Date.now(),
    })
  }

  /**
   * Update verification status for cached content
   */
  updateVerificationStatus(txId: string, status: VerificationStatus): void {
    // Update all cached entries for this txId
    for (const [cacheKey, cached] of this.contentCache.entries()) {
      if (cacheKey.startsWith(txId)) {
        cached.verified = status.status === 'verified'
        cached.verificationStatus = status
      }
    }
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.urlCache.clear()
    this.contentCache.clear()
    this.lastCleanup = 0
  }

  /**
   * Clean up caches only if enough time has passed (throttled)
   */
  private maybeCleanup(): void {
    const now = Date.now()
    
    if (now - this.lastCleanup > this.cleanupInterval) {
      this.cleanup()
      this.lastCleanup = now
    }
  }

  /**
   * Clean up old cache entries based on TTL and size limits
   */
  private cleanup(): void {
    const now = Date.now()

    // Clean expired entries
    for (const [key, content] of this.contentCache.entries()) {
      if (now - content.timestamp > this.cacheTimeout) {
        this.contentCache.delete(key)
      }
    }

    // Clean URL cache too
    for (const [key, cached] of this.urlCache.entries()) {
      if (now - cached.timestamp > this.cacheTimeout) {
        this.urlCache.delete(key)
      }
    }

    // If still too many entries, remove oldest ones (LRU)
    if (this.contentCache.size > this.maxCacheSize) {
      const entries = Array.from(this.contentCache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      ) // Sort by timestamp (oldest first)

      const toRemove = entries.slice(0, entries.length - this.maxCacheSize)
      for (const [key] of toRemove) {
        this.contentCache.delete(key)
      }
    }

    logger.debug(`Cache cleanup complete. Content: ${this.contentCache.size}, URL: ${this.urlCache.size}`)
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      contentCacheSize: this.contentCache.size,
      urlCacheSize: this.urlCache.size,
      lastCleanup: this.lastCleanup,
    }
  }
}