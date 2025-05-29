import { useState } from 'preact/hooks'
import { initFetchQueue, getNextTx, clearSeenIds } from '../engine/fetchQueue'
import { addHistory } from '../engine/history'
import { logger } from '../utils/logger'
import type { Channel, TxMeta } from '../constants'

interface RangeSliderCallbacks {
  setCurrentTx: (tx: TxMeta | null) => void
  setQueueLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  closeChannels: () => void
}

export function useRangeSlider(
  initialMin: number = 1, 
  initialMax: number = 1_000_000_000_000_000,
  callbacks: RangeSliderCallbacks
) {
  const [tempRange, setTempRange] = useState<{ min: number; max: number }>({ 
    min: initialMin, 
    max: initialMax 
  })
  const [rangeSlider, setRangeSlider] = useState<{ min: number; max: number }>({ 
    min: initialMin, 
    max: initialMax 
  })
  const [rangeError, setRangeError] = useState<string | null>(null)
  
  const { setCurrentTx, setQueueLoading, setError, closeChannels } = callbacks
  
  const resetToSliderRange = () => {
    setTempRange(rangeSlider)
    setRangeError(null)
  }
  
  const applyCustomRange = async (
    channel: Channel, 
    ownerAddress?: string, 
    appName?: string,
    blockRangeRef?: { current: { min?: number; max?: number } | null }
  ) => {
    if (tempRange.min >= tempRange.max) {
      setRangeError("Invalid range: minimum must be less than maximum")
      return
    }
    
    setQueueLoading(true)
    setRangeError(null)
    
    try {
      setRangeSlider(tempRange)
      setCurrentTx(null)
      
      // Clear seen IDs when applying custom range to allow fresh exploration
      clearSeenIds()
      
      await initFetchQueue(
        { media: channel.media, recency: channel.recency, ownerAddress, appName },
        { minBlock: tempRange.min, maxBlock: tempRange.max, ownerAddress, appName }
      )
      
      if (blockRangeRef) {
        blockRangeRef.current = { min: tempRange.min, max: tempRange.max }
      }
      
      const tx = await getNextTx(channel)
      if (!tx) {
        setError("No items found within this block range.")
      } else {
        await addHistory(tx)
        setCurrentTx(tx)
      }
      
      closeChannels()
    } catch (err) {
      logger.error('Failed to apply custom block range:', err)
      setRangeError("Couldn't apply custom block range.")
    } finally {
      setQueueLoading(false)
    }
  }
  
  const updateRanges = (newRange: { min: number; max: number }) => {
    setTempRange(newRange)
    setRangeSlider(newRange)
  }
  
  return {
    tempRange,
    setTempRange,
    rangeSlider,
    setRangeSlider,
    rangeError,
    setRangeError,
    resetToSliderRange,
    applyCustomRange,
    updateRanges
  }
}