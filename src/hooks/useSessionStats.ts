import { useState, useEffect } from 'preact/hooks'
import type { TxMeta } from '../constants'

const STATS_STORAGE_KEY = 'roam_session_stats_v1'

// Helper functions for localStorage persistence
function saveStatsToStorage(stats: SessionStats): void {
  try {
    const serializable = {
      ...stats,
      uniqueCreators: Array.from(stats.uniqueCreators)
    }
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(serializable))
  } catch (error) {
    console.warn('Failed to save session stats to localStorage:', error)
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
      // Properly deserialize Date objects
      oldestContent: parsed.oldestContent ? {
        ...parsed.oldestContent,
        date: new Date(parsed.oldestContent.date)
      } : null,
      newestContent: parsed.newestContent ? {
        ...parsed.newestContent,
        date: new Date(parsed.newestContent.date)
      } : null
    }
  } catch (error) {
    console.warn('Failed to load session stats from localStorage:', error)
    return null
  }
}

function clearStatsFromStorage(): void {
  try {
    localStorage.removeItem(STATS_STORAGE_KEY)
  } catch (error) {
    console.warn('Failed to clear session stats from localStorage:', error)
  }
}

interface SessionStats {
  contentViewed: number
  uniqueCreators: Set<string>
  contentTypes: Record<string, number>
  dataTransferred: number // approximate in KB
  sessionStartTime: number
  oldestContent: { date: Date; blockHeight: number } | null
  newestContent: { date: Date; blockHeight: number } | null
  favoriteContentType: string
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
      favoriteContentType: 'Unknown'
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
      const contentType = getContentTypeCategory(getContentType(currentTx))
      newStats.contentTypes = {
        ...prevStats.contentTypes,
        [contentType]: (prevStats.contentTypes[contentType] || 0) + 1
      }
      
      // Estimate data transferred (rough approximation)
      const estimatedSize = estimateContentSize(currentTx)
      newStats.dataTransferred += estimatedSize
      
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

  const getContentDiversity = () => {
    const types = Object.keys(stats.contentTypes).length
    return Math.min(types / 7 * 100, 100) // 7 main content types = 100%
  }

  const resetStats = () => {
    const newStats: SessionStats = {
      contentViewed: 0,
      uniqueCreators: new Set<string>(),
      contentTypes: {},
      dataTransferred: 0,
      sessionStartTime: Date.now(),
      oldestContent: null,
      newestContent: null,
      favoriteContentType: 'Unknown'
    }
    setStats(newStats)
    clearStatsFromStorage()
  }

  return {
    ...stats,
    uniqueCreatorCount: stats.uniqueCreators.size,
    sessionDurationMinutes: getSessionDuration(),
    contentDiversityPercent: Math.round(getContentDiversity()),
    resetStats
  }
}

// Helper functions
function getContentType(tx: TxMeta): string {
  return tx.arfsMeta?.contentType || 
         tx.tags.find(t => t.name === 'Content-Type')?.value || 
         ''
}

function getContentTypeCategory(contentType?: string): string {
  if (!contentType) return 'Unknown'
  
  if (contentType.startsWith('image/')) return 'Images'
  if (contentType.startsWith('video/')) return 'Videos'
  if (contentType.startsWith('audio/')) return 'Music'
  if (contentType.startsWith('text/') || contentType === 'application/json') return 'Text'
  if (contentType === 'text/html' || contentType === 'application/x-arweave-manifest+json') return 'Websites'
  
  return 'Other'
}

function estimateContentSize(tx: TxMeta): number {
  const contentType = getContentType(tx)
  
  // Rough size estimates in KB based on content type
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