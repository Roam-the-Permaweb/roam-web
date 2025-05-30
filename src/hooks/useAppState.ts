import { useState, useEffect } from 'preact/hooks'
import type { Channel, TxMeta } from '../constants'

export function useAppState() {
  // Main content state
  const [currentTx, setCurrentTx] = useState<TxMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [queueLoading, setQueueLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Channel configuration
  const [media, setMedia] = useState<Channel['media']>('images')
  const [recency, setRecency] = useState<Channel['recency']>('old')
  const [ownerAddress, setOwnerAddress] = useState<string | undefined>()
  const [appName, setAppName] = useState<string | undefined>()
  
  // UI state
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [showChannels, setShowChannels] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const [privacyOn, setPrivacyOn] = useState(true)
  
  // Interstitial state
  const [showInterstitial, setShowInterstitial] = useState(false)
  
  // Computed channel object
  const channel: Channel = { media, recency, ownerAddress, appName }
  
  // Helper functions
  const clearError = () => setError(null)
  const togglePrivacy = () => setPrivacyOn(p => !p)
  const openChannels = () => setShowChannels(true)
  const closeChannels = () => setShowChannels(false)
  
  // Lock scroll when drawers are open
  useEffect(() => {
    document.body.classList.toggle('drawer-open', detailsOpen || showChannels)
  }, [detailsOpen, showChannels])
  
  // Format timestamp for display
  const formattedTime = currentTx
    ? new Date(currentTx.block.timestamp * 1000).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : ''
  
  return {
    // State
    currentTx,
    loading,
    queueLoading, 
    error,
    media,
    recency,
    ownerAddress,
    appName,
    detailsOpen,
    showChannels,
    showAbout,
    zoomSrc,
    privacyOn,
    showInterstitial,
    channel,
    formattedTime,
    
    // Setters
    setCurrentTx,
    setLoading,
    setQueueLoading,
    setError,
    setMedia,
    setRecency,
    setOwnerAddress,
    setAppName,
    setDetailsOpen,
    setShowChannels,
    setShowAbout,
    setZoomSrc,
    setPrivacyOn,
    setShowInterstitial,
    
    // Helper functions
    clearError,
    togglePrivacy,
    openChannels,
    closeChannels
  }
}