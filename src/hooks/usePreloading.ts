import { useEffect, useRef } from 'preact/hooks'
import { peekNextTransactions } from '../engine/fetchQueue'
import { GATEWAY_DATA_SOURCE } from '../engine/fetchQueue'
import { logger } from '../utils/logger'
import type { TxMeta, Channel } from '../constants'

// Cache for preloaded content
const preloadCache = new Map<string, boolean>()

export function usePreloading(currentTx: TxMeta | null, channel: Channel) {
  const preloadTimeoutRef = useRef<number | null>(null)

  const preloadContent = async (tx: TxMeta) => {
    const dataTxId = tx.arfsMeta?.dataTxId || tx.id
    const contentType = tx.arfsMeta?.contentType || 
                        tx.tags.find(t => t.name === 'Content-Type')?.value || 
                        ''
    const cacheKey = `${dataTxId}-${contentType}`
    
    // Skip if already preloaded
    if (preloadCache.has(cacheKey)) {
      return
    }

    try {
      
      // Only preload lightweight content types
      if (contentType.startsWith('image/') && contentType !== 'image/gif') {
        // Preload images (except GIFs which can be large)
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          preloadCache.set(cacheKey, true)
          logger.debug(`Preloaded image: ${dataTxId}`)
        }
        img.onerror = () => {
          logger.debug(`Failed to preload image: ${dataTxId}`)
        }
        img.src = `${GATEWAY_DATA_SOURCE[0]}/${dataTxId}`
      } 
      else if (contentType.startsWith('text/') || contentType === 'application/json') {
        // Preload text content
        const response = await fetch(`${GATEWAY_DATA_SOURCE[0]}/${dataTxId}`, {
          method: 'HEAD', // Just check if it exists, don't download
        })
        if (response.ok) {
          preloadCache.set(cacheKey, true)
          logger.debug(`Preloaded text: ${dataTxId}`)
        }
      }
      // Skip video/audio preloading to save bandwidth
      else {
        logger.debug(`Skipping preload for ${contentType}: ${dataTxId}`)
      }
    } catch (error) {
      logger.debug(`Preload failed for ${dataTxId}:`, error)
    }
  }

  useEffect(() => {
    if (!currentTx) return

    // Clear any existing timeout
    if (preloadTimeoutRef.current) {
      clearTimeout(preloadTimeoutRef.current)
    }

    // Start preloading after a short delay to not interfere with current content
    preloadTimeoutRef.current = window.setTimeout(async () => {
      try {
        const nextTransactions = await peekNextTransactions(channel, 2)
        
        // Preload next 2 transactions
        for (const tx of nextTransactions) {
          await preloadContent(tx)
        }
      } catch (error) {
        logger.debug('Preloading failed:', error)
      }
    }, 1000) // 1 second delay

    return () => {
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current)
      }
    }
  }, [currentTx?.id, channel])

  // Clean up old cache entries periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      // Keep cache size reasonable (max 50 items)
      if (preloadCache.size > 50) {
        const entries = Array.from(preloadCache.keys())
        // Remove oldest 25 entries
        for (let i = 0; i < 25; i++) {
          preloadCache.delete(entries[i])
        }
        logger.debug('Cleaned up preload cache')
      }
    }, 5 * 60 * 1000) // Every 5 minutes

    return () => clearInterval(cleanupInterval)
  }, [])
}