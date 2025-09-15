import { useState, useEffect, useCallback } from 'preact/hooks'
import type { TxMeta } from '../constants'
import { logger } from '../utils/logger'

const STATS_STORAGE_KEY = 'roam_session_stats_v1'

// Helper functions for localStorage persistence
function saveStatsToStorage(stats: SessionStats): void {
  try {
    const serializable = {
      ...stats,
      uniqueCreators: Array.from(stats.uniqueCreators),
      uniqueArnsNames: Array.from(stats.uniqueArnsNames)
    }
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(serializable))
  } catch (error) {
    logger.warn('Failed to save session stats to localStorage:', error)
  }
}

function loadStatsFromStorage(): SessionStats | null {
  try {
    const stored = localStorage.getItem(STATS_STORAGE_KEY)
    if (!stored) return null
    
    const parsed = JSON.parse(stored)
    return {
      ...parsed,
      uniqueCreators: new Set(parsed.uniqueCreators || []),
      uniqueArnsNames: new Set(parsed.uniqueArnsNames || []),
      // Properly deserialize Date objects
      oldestContent: parsed.oldestContent ? {
        ...parsed.oldestContent,
        date: new Date(parsed.oldestContent.date)
      } : null,
      newestContent: parsed.newestContent ? {
        ...parsed.newestContent,
        date: new Date(parsed.newestContent.date)
      } : null,
      // Add defaults for new fields if missing (for backward compatibility)
      arnsContentViewed: parsed.arnsContentViewed || 0
    }
  } catch (error) {
    logger.warn('Failed to load session stats from localStorage:', error)
    return null
  }
}

function clearStatsFromStorage(): void {
  try {
    localStorage.removeItem(STATS_STORAGE_KEY)
  } catch (error) {
    logger.warn('Failed to clear session stats from localStorage:', error)
  }
}

interface SessionStats {
  contentViewed: number
  uniqueCreators: Set<string>
  contentTypes: Record<string, number>
  dataTransferred: number // actual data transferred in KB
  sessionStartTime: number
  oldestContent: { date: Date; blockHeight: number } | null
  newestContent: { date: Date; blockHeight: number } | null
  favoriteContentType: string
  adsViewed: number // Count of permaweb ads shown
  arnsContentViewed: number // Count of ArNS content viewed
  uniqueArnsNames: Set<string> // Unique ArNS names discovered
}

export function useSessionStats(currentTx: TxMeta | null) {
  const [stats, setStats] = useState<SessionStats>(() => {
    // Try to load from localStorage first
    const stored = loadStatsFromStorage()
    if (stored) {
      return stored
    }
    
    // Default stats if nothing stored
    return {
      contentViewed: 0,
      uniqueCreators: new Set<string>(),
      contentTypes: {},
      dataTransferred: 0,
      sessionStartTime: Date.now(),
      oldestContent: null,
      newestContent: null,
      favoriteContentType: 'Unknown',
      adsViewed: 0,
      arnsContentViewed: 0,
      uniqueArnsNames: new Set<string>()
    }
  })

  // Track viewed content
  useEffect(() => {
    if (!currentTx) return

    setStats(prevStats => {
      const newStats = { ...prevStats }
      
      // Increment content viewed
      newStats.contentViewed += 1
      
      // Track unique creators
      if (currentTx.owner?.address) {
        newStats.uniqueCreators = new Set([...prevStats.uniqueCreators, currentTx.owner.address])
      }
      
      // Track content types
      const contentType = getContentTypeCategory(getContentType(currentTx), currentTx)
      newStats.contentTypes = {
        ...prevStats.contentTypes,
        [contentType]: (prevStats.contentTypes[contentType] || 0) + 1
      }
      
      // Track ArNS content
      if (currentTx.arnsName) {
        newStats.arnsContentViewed = prevStats.arnsContentViewed + 1
        newStats.uniqueArnsNames = new Set([...prevStats.uniqueArnsNames, currentTx.arnsName])
      } else {
        // Preserve existing ArNS stats if current content is not ArNS
        newStats.arnsContentViewed = prevStats.arnsContentViewed
        newStats.uniqueArnsNames = prevStats.uniqueArnsNames
      }
      
      // Track actual data transferred (in KB)
      const contentSizeKB = estimateContentSize(currentTx)
      newStats.dataTransferred += contentSizeKB
      
      // Track oldest/newest content by block height
      if (currentTx.block?.height) {
        const contentDate = estimateBlockDate(currentTx.block.height)
        
        if (!newStats.oldestContent || currentTx.block.height < newStats.oldestContent.blockHeight) {
          newStats.oldestContent = {
            date: contentDate,
            blockHeight: currentTx.block.height
          }
        }
        
        if (!newStats.newestContent || currentTx.block.height > newStats.newestContent.blockHeight) {
          newStats.newestContent = {
            date: contentDate,
            blockHeight: currentTx.block.height
          }
        }
      }
      
      // Calculate favorite content type
      const contentTypeCounts = newStats.contentTypes
      newStats.favoriteContentType = Object.keys(contentTypeCounts).reduce((a, b) => 
        contentTypeCounts[a] > contentTypeCounts[b] ? a : b, 'Unknown'
      )
      
      return newStats
    })
  }, [currentTx?.id])

  // Save stats to localStorage whenever they change
  useEffect(() => {
    saveStatsToStorage(stats)
  }, [stats])

  const getSessionDuration = () => {
    return Math.floor((Date.now() - stats.sessionStartTime) / 1000 / 60) // minutes
  }

  const incrementAdsViewed = useCallback(() => {
    logger.info('incrementAdsViewed called')
    setStats(prevStats => {
      const newAdsViewed = prevStats.adsViewed + 1
      logger.info(`Ads viewed incremented from ${prevStats.adsViewed} to ${newAdsViewed}`)
      return {
        ...prevStats,
        adsViewed: newAdsViewed
      }
    })
  }, [])

  const resetStats = useCallback(() => {
    const newStats: SessionStats = {
      contentViewed: 0,
      uniqueCreators: new Set<string>(),
      contentTypes: {},
      dataTransferred: 0,
      sessionStartTime: Date.now(),
      oldestContent: null,
      newestContent: null,
      favoriteContentType: 'Unknown',
      adsViewed: 0,
      arnsContentViewed: 0,
      uniqueArnsNames: new Set<string>()
    }
    setStats(newStats)
    clearStatsFromStorage()
  }, [])

  return {
    ...stats,
    uniqueCreatorCount: stats.uniqueCreators.size,
    uniqueArnsNamesCount: stats.uniqueArnsNames.size,
    sessionDurationMinutes: getSessionDuration(),
    resetStats,
    incrementAdsViewed
  }
}

// Helper functions
function getContentType(tx: TxMeta): string {
  return tx.arfsMeta?.contentType || 
         tx.tags.find(t => t.name === 'Content-Type')?.value || 
         ''
}

function getContentTypeCategory(contentType?: string, _tx?: TxMeta): string {
  if (!contentType) return 'Unknown'
  
  // Special handling for ArNS content - track the underlying content type
  // but we could also track "ArNS Names" as a special category if desired
  
  // Images
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'JPGs'
  if (contentType === 'image/png') return 'PNGs'
  if (contentType === 'image/gif') return 'GIFs'
  if (contentType === 'image/webp') return 'WebP Images'
  if (contentType === 'image/svg+xml') return 'SVG Graphics'
  if (contentType.startsWith('image/')) return 'Other Images'
  
  // Videos
  if (contentType === 'video/mp4') return 'MP4 Videos'
  if (contentType === 'video/webm') return 'WebM Videos'
  if (contentType.startsWith('video/')) return 'Other Videos'
  
  // Audio
  if (contentType === 'audio/mpeg' || contentType === 'audio/mp3') return 'MP3 Audio'
  if (contentType === 'audio/wav') return 'WAV Audio'
  if (contentType.startsWith('audio/')) return 'Other Audio'
  
  // Documents & Text
  if (contentType === 'application/pdf') return 'PDFs'
  if (contentType === 'text/plain') return 'Text Files'
  if (contentType === 'text/markdown' || contentType === 'text/x-markdown') return 'Markdown'
  if (contentType === 'application/json') return 'JSON Data'
  if (contentType === 'text/csv') return 'CSV Data'
  
  // Web
  if (contentType === 'text/html') return 'Web Pages'
  if (contentType === 'application/x-arweave-manifest+json') return 'Arweave Apps'
  
  // Archives
  if (contentType === 'application/zip') return 'ZIP Archives'
  if (contentType === 'application/x-tar') return 'TAR Archives'
  
  return 'Other'
}

function estimateContentSize(tx: TxMeta): number {
  // Use actual data size if available
  // For ArFS files, use the size from arfsMeta if available, otherwise fall back to data.size
  const actualSize = tx.arfsMeta?.size ?? tx.data?.size
  
  if (actualSize && actualSize > 0) {
    // Convert bytes to KB
    return Math.round(actualSize / 1024)
  }
  
  // Fallback to rough estimates if no size available (shouldn't happen with current GraphQL)
  const contentType = getContentType(tx)
  
  if (contentType.startsWith('image/')) return 150 // Average image
  if (contentType.startsWith('video/')) return 2000 // Small video
  if (contentType.startsWith('audio/')) return 3000 // Audio file
  if (contentType.startsWith('text/')) return 5 // Text file
  
  return 50 // Default estimate
}

function estimateBlockDate(blockHeight: number): Date {
  // Arweave genesis: June 11, 2018
  // Approximate 2 minute block time
  const genesisDate = new Date('2018-06-11T00:00:00Z')
  const estimatedMs = genesisDate.getTime() + (blockHeight * 2 * 60 * 1000)
  return new Date(estimatedMs)
}