import { useRef } from 'preact/hooks'
import { initFetchQueue, getNextTx, clearSeenIds, GATEWAY_DATA_SOURCE } from '../engine/fetchQueue'
import { addHistory, goBack, goForward, peekForward, resetHistory } from '../engine/history'
import { logger } from '../utils/logger'
import type { Channel, TxMeta } from '../constants'

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
  
  const {
    setCurrentTx,
    setLoading,
    setQueueLoading,
    setError,
    clearError,
    setRangeSlider,
    setTempRange
  } = callbacks
  
  const handleReset = async () => {
    try {
      await resetHistory()
      setCurrentTx(null)
      logger.debug('History reset')
    } catch (e) {
      logger.error('Reset failed', e)
      setError('Failed to reset history.')
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
  
  const handleNext = async (channel: Channel, recordClick: () => void, shouldShowInterstitial: boolean, setShowInterstitial: (show: boolean) => void) => {
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
        } else {
          setError('Unexpected missing forward history.')
        }
      } else {
        const tx = await getNextTx(channel)
        if (!tx) {
          // No more content available
        } else {
          await addHistory(tx)
          setCurrentTx(tx)
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
        setError("Couldn't start roam: no items found.")
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
        setError("No content found to initialize.")
      } else {
        setCurrentTx(firstTx)
        await addHistory(firstTx)
      }
      
      return range
    } catch (e) {
      logger.error('Init failed', e)
      setError('Couldn\'t load content')
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
      console.error('Share failed:', error)
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
      console.error("Download failed:", err)
      alert("Failed to download the file.")
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
    initializeQueue
  }
}