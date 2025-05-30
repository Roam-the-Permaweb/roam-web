import { useState } from 'preact/hooks'
import { initFetchQueue, getNextTx, clearSeenIds } from '../engine/fetchQueue'
import { addHistory } from '../engine/history'
import { logger } from '../utils/logger'
import { getBlockRangeForDateRange, getDateRangeForBlockRange, isValidArweaveDate } from '../utils/dateBlockUtils'
import type { Channel, TxMeta } from '../constants'

interface DateRange {
  start: Date
  end: Date
}

interface DateRangeSliderCallbacks {
  setCurrentTx: (tx: TxMeta | null) => void
  setQueueLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  closeChannels: () => void
  setRangeSlider?: (range: { min: number; max: number }) => void
}

export function useDateRangeSlider(
  initialStartDate: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
  initialEndDate: Date = new Date(), // Today
  callbacks: DateRangeSliderCallbacks
) {
  const [tempRange, setTempRange] = useState<DateRange>({ 
    start: initialStartDate, 
    end: initialEndDate 
  })
  const [dateRange, setDateRange] = useState<DateRange>({ 
    start: initialStartDate, 
    end: initialEndDate 
  })
  const [blockRange, setBlockRange] = useState<{ min: number; max: number } | null>(null)
  const [actualBlocks, setActualBlocks] = useState<{ min: number; max: number } | null>(null) // Track actual blocks when syncing
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [isResolvingBlocks, setIsResolvingBlocks] = useState(false)
  
  const { setCurrentTx, setQueueLoading, setError, closeChannels, setRangeSlider } = callbacks
  
  const resetToSliderRange = () => {
    setTempRange(dateRange)
    setRangeError(null)
    // Keep actual blocks when resetting to maintain sync
  }
  
  const applyCustomDateRange = async (
    channel: Channel, 
    ownerAddress?: string, 
    appName?: string,
    blockRangeRef?: { current: { min?: number; max?: number } | null }
  ) => {
    if (tempRange.start >= tempRange.end) {
      setRangeError("Invalid range: start date must be before end date")
      return
    }
    
    // Validate date range
    if (!isValidArweaveDate(tempRange.start) || !isValidArweaveDate(tempRange.end)) {
      setRangeError("Dates must be between June 2018 (Arweave genesis) and today")
      return
    }
    
    setQueueLoading(true)
    setIsResolvingBlocks(true)
    setRangeError(null)
    
    try {
      // Check if dates haven't changed and we have existing block range to reuse
      const datesUnchanged = (
        tempRange.start.getTime() === dateRange.start.getTime() && 
        tempRange.end.getTime() === dateRange.end.getTime()
      )
      
      let resolvedBlockRange: { minBlock: number; maxBlock: number } | null = null
      
      if (datesUnchanged && actualBlocks) {
        // Reuse existing actual blocks since dates haven't changed
        console.log('🔥 REUSING EXISTING BLOCKS - No date change detected:', actualBlocks)
        resolvedBlockRange = { minBlock: actualBlocks.min, maxBlock: actualBlocks.max }
      } else if (datesUnchanged && blockRange) {
        // Fallback to existing block range if no actual blocks but dates are the same
        console.log('🔥 REUSING EXISTING BLOCK RANGE - No date change detected:', blockRange)
        resolvedBlockRange = { minBlock: blockRange.min, maxBlock: blockRange.max }
      } else {
        // Dates have changed, need to resolve new block range
        logger.debug('Converting date range to blocks:', { 
          start: tempRange.start.toISOString(), 
          end: tempRange.end.toISOString(),
          startTimestamp: tempRange.start.getTime(),
          endTimestamp: tempRange.end.getTime(),
          datesUnchanged,
          hasActualBlocks: !!actualBlocks,
          hasBlockRange: !!blockRange
        })
        
        resolvedBlockRange = await getBlockRangeForDateRange(tempRange.start, tempRange.end, true) // Require exact when applying
      }
      
      if (!resolvedBlockRange) {
        throw new Error("Could not resolve date range to block heights. Try selecting a different date range or check network connectivity.")
      }
      
      logger.debug('Resolved block range:', resolvedBlockRange)
      
      setDateRange(tempRange)
      setBlockRange({ min: resolvedBlockRange.minBlock, max: resolvedBlockRange.maxBlock })
      // Store as actual blocks so future applies can reuse them if dates don't change
      setActualBlocks({ min: resolvedBlockRange.minBlock, max: resolvedBlockRange.maxBlock })
      setCurrentTx(null)
      
      // Update main app's current block range state for proper sync
      if (setRangeSlider) {
        setRangeSlider({ min: resolvedBlockRange.minBlock, max: resolvedBlockRange.maxBlock })
        console.log('🔥 UPDATED MAIN APP BLOCK RANGE:', { min: resolvedBlockRange.minBlock, max: resolvedBlockRange.maxBlock })
      }
      
      // Clear seen IDs when applying custom range to allow fresh exploration
      clearSeenIds()
      
      await initFetchQueue(
        { media: channel.media, recency: channel.recency, ownerAddress, appName },
        { 
          minBlock: resolvedBlockRange.minBlock, 
          maxBlock: resolvedBlockRange.maxBlock, 
          ownerAddress, 
          appName 
        }
      )
      
      if (blockRangeRef) {
        blockRangeRef.current = { 
          min: resolvedBlockRange.minBlock, 
          max: resolvedBlockRange.maxBlock 
        }
      }
      
      const tx = await getNextTx(channel)
      if (!tx) {
        setError("No items found within this date range.")
      } else {
        await addHistory(tx)
        setCurrentTx(tx)
      }
      
      closeChannels()
    } catch (err) {
      logger.error('Failed to apply custom date range:', err)
      setRangeError("Couldn't apply custom date range.")
    } finally {
      setQueueLoading(false)
      setIsResolvingBlocks(false)
    }
  }
  
  const updateRanges = (newDateRange: DateRange) => {
    setTempRange(newDateRange)
    setDateRange(newDateRange)
    // Clear actual blocks when user manually changes dates (enable estimation)
    setActualBlocks(null)
  }
  
  // Handle estimated block range updates from the DateRangeSlider component
  const handleBlockRangeEstimated = (minBlock: number, maxBlock: number) => {
    setBlockRange({ min: minBlock, max: maxBlock })
  }
  
  // Custom setTempRange wrapper that clears actual blocks when user changes dates
  const setTempRangeAndClearActual = (newRange: DateRange) => {
    setTempRange(newRange)
    // Clear actual blocks when user manually changes temp range (enable estimation)
    setActualBlocks(null)
  }
  
  // Get default date range (last 30 days)
  const getDefaultDateRange = (): DateRange => {
    const end = new Date()
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
    return { start, end }
  }
  
  // Set date range to last N days
  const setLastNDays = (days: number) => {
    const end = new Date()
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
    const newRange = { start, end }
    setTempRange(newRange)
    setDateRange(newRange)
  }
  
  // Set date range to specific preset periods
  const setPresetRange = (preset: 'last7days' | 'last30days' | 'last90days' | 'last6months' | 'last1year') => {
    let days: number
    switch (preset) {
      case 'last7days': days = 7; break
      case 'last30days': days = 30; break
      case 'last90days': days = 90; break
      case 'last6months': days = 180; break
      case 'last1year': days = 365; break
    }
    setLastNDays(days)
  }
  
  // Sync date range with current block range (called when channels drawer opens)
  const syncWithCurrentBlockRange = async (minBlock: number, maxBlock: number) => {
    try {
      console.log('🔥 SYNCING DATE SLIDER WITH:', { min: minBlock, max: maxBlock })
      
      const actualDateRange = await getDateRangeForBlockRange(minBlock, maxBlock)
      if (actualDateRange) {
        const newRange = { start: actualDateRange.startDate, end: actualDateRange.endDate }
        setTempRange(newRange)
        setDateRange(newRange)
        setBlockRange({ min: minBlock, max: maxBlock })
        
        // Store the actual blocks so DateRangeSlider can use them instead of estimating
        setActualBlocks({ min: minBlock, max: maxBlock })
        
        console.log('🔥 DATE SLIDER SYNCED:', { 
          actualBlocks: { minBlock, maxBlock },
          dateRange: {
            start: actualDateRange.startDate.toISOString(),
            end: actualDateRange.endDate.toISOString()
          }
        })
      }
    } catch (error) {
      logger.warn('Failed to sync with current block range:', error)
    }
  }
  
  return {
    // Date range state
    tempRange,
    setTempRange: setTempRangeAndClearActual, // Use wrapper that clears actual blocks
    dateRange,
    setDateRange,
    
    // Block range state (computed from dates)
    blockRange,
    actualBlocks, // Actual blocks when syncing (to avoid estimation)
    
    // Error and loading state
    rangeError,
    setRangeError,
    isResolvingBlocks,
    
    // Actions
    resetToSliderRange,
    applyCustomDateRange,
    updateRanges,
    handleBlockRangeEstimated,
    
    // Convenience methods
    getDefaultDateRange,
    setLastNDays,
    setPresetRange,
    syncWithCurrentBlockRange,
    
    // Legacy compatibility (for easy migration from useRangeSlider)
    rangeSlider: blockRange ? { min: blockRange.min, max: blockRange.max } : null,
    applyCustomRange: applyCustomDateRange, // alias for backward compatibility
  }
}