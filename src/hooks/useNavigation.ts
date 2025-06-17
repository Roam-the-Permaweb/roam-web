import { useRef } from 'preact/hooks'
import { initFetchQueue, getNextTx, clearSeenIds, GATEWAY_DATA_SOURCE } from '../engine/fetchQueue'
import { addHistory, goBack, goForward, peekForward, resetHistory } from '../engine/history'
import { logger } from '../utils/logger'
import type { Channel, TxMeta } from '../constants'

// Constants for error handling
const ERROR_DEBOUNCE_MS = 2000 // Minimum 2 seconds between auto-advances on error
const MAX_CONSECUTIVE_ERRORS = 5 // Stop auto-advancing after 5 consecutive errors
const ERROR_RESET_TIMEOUT = 10000 // Reset error count after 10 seconds of no errors

interface NavigationCallbacks {
  setCurrentTx: (tx: TxMeta | null) => void
  setLoading: (loading: boolean) => void
  setQueueLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
  setRangeSlider: (range: { min: number; max: number }) => void
  setTempRange: (range: { min: number; max: number }) => void
}

export function useNavigation(callbacks: NavigationCallbacks) {
  const blockRangeRef = useRef<{ min?: number; max?: number } | null>(null)
  const lastErrorTimeRef = useRef<number>(0)
  const consecutiveErrorsRef = useRef<number>(0)
  const errorResetTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  const {
    setCurrentTx,
    setLoading,
    setQueueLoading,
    setError,
    clearError,
    setRangeSlider,
    setTempRange
  } = callbacks
  
  const handleReset = async (channel: Channel) => {
    clearError()
    setLoading(true)
    try {
      // Clear navigation history
      await resetHistory()
      logger.debug('History reset')
      
      // Clear seen IDs for fresh exploration
      clearSeenIds()
      logger.debug('Seen IDs cleared')
      
      // Clear current transaction first
      setCurrentTx(null)
      
      // Initialize fresh queue and immediately load first item
      await initializeQueue(channel)
      logger.debug('Reset complete with fresh content loaded')
    } catch (e) {
      logger.error('Reset failed', e)
      setError('Failed to reset. Try again.')
      setCurrentTx(null) // Ensure we exit loading state even on error
    } finally {
      setLoading(false)
    }
  }
  
  const handleBack = async () => {
    clearError()
    setLoading(true)
    try {
      const prev = await goBack()
      if (prev) {
        setCurrentTx(prev)
      } else {
        setError('No previous content.')
      }
    } catch (e) {
      logger.error('Back failed', e)
      setError('Failed to go back.')
    } finally {
      setLoading(false)
    }
  }
  
  const handleNext = async (channel: Channel, recordClick: () => void, shouldShowInterstitial: boolean, setShowInterstitial: (show: boolean) => void, isFromError: boolean = false) => {
    // If this is from an error, check debouncing and error limits
    if (isFromError) {
      const now = Date.now()
      const timeSinceLastError = now - lastErrorTimeRef.current
      
      // Enforce minimum time between error-triggered navigations
      if (timeSinceLastError < ERROR_DEBOUNCE_MS) {
        logger.warn(`Skipping error-triggered navigation - only ${timeSinceLastError}ms since last error (min: ${ERROR_DEBOUNCE_MS}ms)`)
        return
      }
      
      // Check if we've hit the consecutive error limit
      if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        logger.error(`Stopping auto-advance after ${MAX_CONSECUTIVE_ERRORS} consecutive errors`)
        setError('Too many consecutive errors. Please check your connection and try again.')
        return
      }
      
      // Update error tracking
      lastErrorTimeRef.current = now
      consecutiveErrorsRef.current++
      
      // Set up or reset the error count reset timer
      if (errorResetTimerRef.current) {
        clearTimeout(errorResetTimerRef.current)
      }
      errorResetTimerRef.current = setTimeout(() => {
        consecutiveErrorsRef.current = 0
        logger.debug('Reset consecutive error count after timeout')
      }, ERROR_RESET_TIMEOUT)
      
      logger.warn(`Error-triggered navigation (${consecutiveErrorsRef.current}/${MAX_CONSECUTIVE_ERRORS} consecutive errors)`)
    } else {
      // Reset error count on successful user-initiated navigation
      consecutiveErrorsRef.current = 0
    }
    
    clearError()
    setLoading(true)
    recordClick()
    
    if (shouldShowInterstitial) {
      setShowInterstitial(true)
      setLoading(false)
      return
    }
    
    try {
      const forward = await peekForward()
      if (forward) {
        const tx = await goForward()
        if (tx) {
          setCurrentTx(tx)
          // Reset error count on successful navigation
          if (!isFromError) {
            consecutiveErrorsRef.current = 0
          }
        } else {
          setError('Unexpected missing forward history.')
        }
      } else {
        const tx = await getNextTx(channel)
        if (!tx) {
          setError('No more content available. Try changing filters or reset.')
        } else {
          await addHistory(tx)
          setCurrentTx(tx)
          // Reset error count on successful navigation
          if (!isFromError) {
            consecutiveErrorsRef.current = 0
          }
        }
      }
    } catch (e) {
      logger.error('Next failed', e)
      setError('Failed to load next.')
    } finally {
      setLoading(false)
    }
  }
  
  const handleRoam = async (channel: Channel) => {
    clearError()
    setLoading(true)
    try {
      setCurrentTx(null)
      
      // Clear seen IDs for fresh exploration
      clearSeenIds()
      
      // Initialize a brand-new queue
      const range = await initFetchQueue(channel)
      if (range) {
        blockRangeRef.current = range
        setTempRange(range)
        setRangeSlider(range)
      }
      
      // Get and show the first transaction
      const tx = await getNextTx(channel)
      if (!tx) {
        setError("Couldn't start roam: no content found. Try different filters.")
        // Set a null transaction to exit loading state gracefully
        setCurrentTx(null)
      } else {
        await addHistory(tx)
        setCurrentTx(tx)
      }
    } catch (e) {
      logger.error('Roam failed', e)
      setError('Failed to start new roam.')
    } finally {
      setLoading(false)
    }
  }
  
  const initializeQueue = async (channel: Channel, options: any = {}) => {
    setQueueLoading(true)
    setCurrentTx(null)
    clearError()
    
    // Clear seen IDs when initializing a new queue to allow re-exploring content
    clearSeenIds()
    
    try {
      const range = await initFetchQueue(channel, options)
      if (range) {
        blockRangeRef.current = range
        setRangeSlider(range)
        setTempRange(range)
      }
      
      let firstTx: TxMeta | null = null
      if (options.initialTx) {
        firstTx = options.initialTx
      } else {
        firstTx = await getNextTx(channel)
      }
      
      if (!firstTx) {
        setError("No content found to initialize. Try different filters.")
        setCurrentTx(null) // Ensure we exit loading state
      } else {
        setCurrentTx(firstTx)
        await addHistory(firstTx)
      }
      
      return range
    } catch (e) {
      logger.error('Init failed', e)
      setError('Couldn\'t load content. Try different filters or reset.')
      setCurrentTx(null) // Ensure we exit loading state on error
      throw e
    } finally {
      setQueueLoading(false)
    }
  }
  
  const handleShare = async (currentTx: TxMeta | null, media: string, ownerAddress?: string, appName?: string) => {
    if (!currentTx) return
    
    const params = new URLSearchParams()
    params.set("txid", currentTx.id)
    params.set("channel", media)
    
    if (ownerAddress) {
      params.set("ownerAddress", ownerAddress)
    }
    
    if (appName) {
      params.set("appName", appName)
    }
    
    const min = blockRangeRef.current?.min
    const max = blockRangeRef.current?.max
    if (min !== undefined && max !== undefined) {
      params.set("minBlock", String(min))
      params.set("maxBlock", String(max))
    }
    
    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Woa, check this out!",
          text: `Check out what I found roaming the Permaweb! ${shareUrl}`,
          url: shareUrl,
        })
      } else {
        await navigator.clipboard.writeText(shareUrl)
        alert("Copied!")
      }
    } catch (error) {
      logger.error('Share failed:', error)
    }
  }
  
  const handleDownload = async (currentTx: TxMeta | null) => {
    if (!currentTx) return
    
    const arfsMeta = currentTx.arfsMeta
    const dataTxId = arfsMeta?.dataTxId || currentTx.id
    const filename = arfsMeta?.name || dataTxId
    
    try {
      const response = await fetch(`${GATEWAY_DATA_SOURCE[0]}/${dataTxId}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      logger.error("Download failed:", err)
      alert("Failed to download the file.")
    }
  }
  
  // Create a debounced error handler for MediaView
  const handleCorruptContent = (channel: Channel, recordClick: () => void, shouldShowInterstitial: boolean, setShowInterstitial: (show: boolean) => void) => {
    return async () => {
      logger.warn('Content failed to load, attempting to skip to next...')
      await handleNext(channel, recordClick, shouldShowInterstitial, setShowInterstitial, true)
    }
  }
  
  return {
    blockRangeRef,
    handleReset,
    handleBack,
    handleNext,
    handleRoam,
    handleShare,
    handleDownload,
    initializeQueue,
    handleCorruptContent
  }
}