import { useEffect, useRef } from 'preact/hooks'
import { peekNextTransactions } from '../engine/fetchQueue'
import { GATEWAY_DATA_SOURCE } from '../engine/fetchQueue'
import { wayfinderService } from '../services/wayfinder'
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
    const size = tx.arfsMeta?.size
    const cacheKey = `${dataTxId}-${contentType}`
    
    // Skip if already preloaded
    if (preloadCache.has(cacheKey)) {
      return
    }

    try {
      // Check if Wayfinder is available for verification + routing
      const isWayfinderAvailable = await wayfinderService.isAvailable()
      
      // Prepare content request with size info for intelligent loading
      const contentRequest = {
        txId: dataTxId,
        contentType,
        size
      }
      
      // Get URL via Wayfinder (with verification) or fallback
      let contentUrl: string
      
      if (isWayfinderAvailable) {
        try {
          const wayfinderResult = await wayfinderService.getContentUrl(contentRequest)
          contentUrl = wayfinderResult.url
        } catch (error) {
          // Fallback to original gateway
          contentUrl = `${GATEWAY_DATA_SOURCE[0]}/${dataTxId}`
        }
      } else {
        // Wayfinder disabled, use direct gateway
        contentUrl = `${GATEWAY_DATA_SOURCE[0]}/${dataTxId}`
      }
      
      // Only preload lightweight content types to save bandwidth
      if (contentType.startsWith('image/') && contentType !== 'image/gif') {
        // Skip large images (>5MB) for preloading
        if (size && size > 5 * 1024 * 1024) {
          return
        }
        
        // Preload images (except GIFs which can be large)
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          preloadCache.set(cacheKey, true)
        }
        img.onerror = () => {
          // Silent fail for preloading
        }
        img.src = contentUrl
      } 
      else if (contentType.startsWith('text/') || contentType === 'application/json') {
        // Skip large text files (>1MB) for preloading
        if (size && size > 1024 * 1024) {
          return
        }
        
        // Preload text content with HEAD request
        const response = await fetch(contentUrl, {
          method: 'HEAD',
          mode: 'cors'
        })
        if (response.ok) {
          preloadCache.set(cacheKey, true)
        }
      }
      // Skip video/audio preloading entirely to save bandwidth
      
    } catch (error) {
      // Silent fail for preloading - don't spam logs
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
        // Silent fail for preloading
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
      }
    }, 5 * 60 * 1000) // Every 5 minutes

    return () => clearInterval(cleanupInterval)
  }, [])
}