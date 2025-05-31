/**
 * Roam - Arweave Content Discovery App
 * 
 * A shuffle-play interface for discovering random Arweave content.
 * Users explore transactions by content type (images, videos, music, websites, text, ArFS files)
 * using a "Next" button to navigate through a curated stream.
 * 
 * Key Features:
 * - Background transaction queue with sliding window algorithm
 * - Deep linking support for direct content access
 * - Advanced date range filtering with block height resolution
 * - Apple-inspired UI with dark theme and smooth transitions
 * - PWA with offline support after installation
 */
import { useEffect, useState, useRef } from 'preact/hooks'
import { MediaView } from './components/MediaView'
import { DetailsDrawer } from './components/DetailsDrawer'
import { ZoomOverlay } from './components/ZoomOverlay'
import { Interstitial } from './components/Interstitial'
import { ConsentModal } from './components/ConsentModal'
import { AppHeader } from './components/AppHeader'
import { AppControls } from './components/AppControls'
import { TransactionInfo } from './components/TransactionInfo'
import { AboutModal } from './components/AboutModal'
import { ChannelsDrawer } from './components/ChannelsDrawer'
import { Icons } from './components/Icons'
import { useInterstitialInjector } from './hooks/useInterstitialInjector'
import { useConsent } from './hooks/useConsent'
import { useDeepLink } from './hooks/useDeepLink'
import { useAppState } from './hooks/useAppState'
import { useNavigation } from './hooks/useNavigation'
import { useDateRangeSlider } from './hooks/useDateRangeSlider'
import { useSwipeGesture } from './hooks/useSwipeGesture'
import { logger } from './utils/logger'
import { MAX_AD_CLICKS, MIN_AD_CLICKS, DEFAULT_DATE_RANGE_DAYS, APP_SWIPE_THRESHOLD, APP_SWIPE_TIME_LIMIT } from './constants'
import './styles/app.css'
import './styles/channels-drawer.css'

export function App() {
  /**
   * Core Application State Management
   * 
   * The app uses a custom hook pattern for state management:
   * - useConsent: Handles NSFW content consent
   * - useDeepLink: Parses URL parameters and sets initial state  
   * - useAppState: Main application state (current transaction, queue, loading, etc.)
   * - useNavigation: Navigation logic and actions (next, back, share, download)
   * - useDateRangeSlider: Date-based filtering with block height resolution
   */
  const consent = useConsent()
  const deepLink = useDeepLink()
  const appState = useAppState()
  
  // Date range filtering with block height conversion
  // Allows users to filter content by date ranges, which are converted to Arweave block heights
  const dateRangeSliderCallbacks = {
    setCurrentTx: appState.setCurrentTx,
    setQueueLoading: appState.setQueueLoading,
    setError: appState.setError,
    closeChannels: appState.closeChannels,
    setRangeSlider: (range: { min: number; max: number }) => {
      // Update current block range when date range is applied
      setCurrentBlockRange(range)
    }
  }
  
  // Default date range: last 30 days (independent of current content)
  const thirtyDaysAgo = new Date(Date.now() - DEFAULT_DATE_RANGE_DAYS * 24 * 60 * 60 * 1000)
  const today = new Date()
  
  const dateRangeSlider = useDateRangeSlider(thirtyDaysAgo, today, dateRangeSliderCallbacks)
  
  // Track current block range for date slider sync
  const [currentBlockRange, setCurrentBlockRange] = useState<{ min: number; max: number } | null>(null)

  // Navigation callbacks 
  const navigationCallbacks = {
    setCurrentTx: appState.setCurrentTx,
    setLoading: appState.setLoading,
    setQueueLoading: appState.setQueueLoading,
    setError: appState.setError,
    clearError: appState.clearError,
    setRangeSlider: (range: { min: number; max: number }) => {
      // Store current block range for potential date slider sync
      setCurrentBlockRange(range)
      logger.debug('🔥 setRangeSlider called with:', range)
      // Block range updated
    },
    setTempRange: (range: { min: number; max: number }) => {
      // Also store temp range updates
      setCurrentBlockRange(range)
      logger.debug('🔥 setTempRange called with:', range)
      // Temp range updated
    }
  }
  
  const navigation = useNavigation(navigationCallbacks)
  
  // Interstitial ad management
  const { recordClick, shouldShowInterstitial, reset } = useInterstitialInjector(MIN_AD_CLICKS, MAX_AD_CLICKS)
  
  const handleCloseAd = () => {
    appState.setShowInterstitial(false)
    reset()
    // After ad, go to next
    navigation.handleNext(appState.channel, recordClick, false, appState.setShowInterstitial)
  }
  
  // Initialize queue when filters change and deep link is parsed
  useEffect(() => {
    if (!deepLink.deepLinkParsed) return
    
    let cancelled = false
    
    const initializeApp = async () => {
      try {
        // Only use deepLinkOpts on first run, then clear them
        const opts = deepLink.deepLinkOpts?.initialTx || 
                    deepLink.deepLinkOpts?.minBlock != null || 
                    deepLink.deepLinkOpts?.ownerAddress != null
          ? {
              initialTx: deepLink.deepLinkOpts.initialTx,
              minBlock: deepLink.deepLinkOpts.minBlock,
              maxBlock: deepLink.deepLinkOpts.maxBlock,
              ownerAddress: deepLink.deepLinkOpts.ownerAddress,
              appName: deepLink.deepLinkOpts.appName
            }
          : {}
        
        // Update app state with deep link values
        if (deepLink.deepLinkOpts?.ownerAddress && !cancelled) {
          appState.setOwnerAddress(deepLink.deepLinkOpts.ownerAddress)
        }
        if (deepLink.deepLinkOpts?.appName && !cancelled) {
          appState.setAppName(deepLink.deepLinkOpts.appName)
        }
        if (deepLink.deepLinkOpts?.channel?.media && !cancelled) {
          appState.setMedia(deepLink.deepLinkOpts.channel.media)
        }
        
        await navigation.initializeQueue(appState.channel, opts)
        // No need to sync date slider - it's independent
        
        if (deepLink.deepLinkOpts && !cancelled) {
          deepLink.clearDeepLink()
        }
      } catch (error) {
        if (!cancelled) {
          logger.error('App initialization failed:', error)
        }
      }
    }
    
    initializeApp()
    return () => { cancelled = true }
  }, [appState.media, appState.recency, appState.ownerAddress, appState.appName, deepLink.deepLinkParsed])
  
  // Date slider is independent - no automatic syncing needed
  
  // Early return if consent rejected
  if (consent.rejected) return null
  
  // Navigation handlers with proper parameters
  const handleNext = () => navigation.handleNext(
    appState.channel, 
    recordClick, 
    shouldShowInterstitial, 
    appState.setShowInterstitial
  )
  
  const handleShare = () => navigation.handleShare(
    appState.currentTx, 
    appState.media, 
    appState.ownerAddress, 
    appState.appName
  )
  
  const handleDownload = () => navigation.handleDownload(appState.currentTx)
  
  const handleOpenInNewTab = () => {
    if (!appState.currentTx) return
    const dataTxId = appState.currentTx.arfsMeta?.dataTxId || appState.currentTx.id
    const url = `https://arweave.net/${dataTxId}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  
  const handleRoam = () => navigation.handleRoam(appState.channel)
  
  // Swipe gesture support
  const mainRef = useRef<HTMLElement>(null)
  useSwipeGesture(
    mainRef,
    {
      onSwipeLeft: handleNext,
      onSwipeRight: navigation.handleBack
    },
    {
      threshold: APP_SWIPE_THRESHOLD,
      allowedTime: APP_SWIPE_TIME_LIMIT
    }
  )
  
  const handleApplyRange = () => dateRangeSlider.applyCustomDateRange(
    appState.channel,
    appState.ownerAddress,
    appState.appName,
    navigation.blockRangeRef
  )
  
  return (
    <div className="app">
      {!consent.accepted && (
        <ConsentModal onAccept={consent.handleAccept} onReject={consent.handleReject} />
      )}
      
      {/* Interstitial overlay */}
      {appState.showInterstitial && (
        <Interstitial src="/static-ad.jpg" onClose={handleCloseAd} />
      )}
      
      <AppHeader />

      {appState.zoomSrc && <ZoomOverlay src={appState.zoomSrc} onClose={() => appState.setZoomSrc(null)} />}

      {appState.error && <div className="error">{appState.error}</div>}

      <main ref={mainRef} className="media-container">
        {appState.loading && !appState.currentTx && <div className="loading">Loading…</div>}
        {!appState.currentTx && !appState.loading && <div className="placeholder">Feeling curious? Tap "Next" to explore — or "Roam" to spin the dice.</div>}
        {appState.currentTx && (
          <>
            <MediaView
              txMeta={appState.currentTx}
              privacyOn={appState.privacyOn}
              onPrivacyToggle={appState.togglePrivacy}
              onZoom={(src) => appState.setZoomSrc(src)}
              onCorrupt={handleNext}
              loading={appState.loading}
              onShare={handleShare}
              onDownload={handleDownload}
              onDetails={() => appState.setDetailsOpen(true)}
              onOpenInNewTab={handleOpenInNewTab}
            />

            {!appState.loading && (
              <TransactionInfo 
                txMeta={appState.currentTx} 
                formattedTime={appState.formattedTime} 
              />
            )}
          </>
        )}
      </main>

      <AppControls
        onReset={navigation.handleReset}
        onBack={navigation.handleBack}
        onNext={handleNext}
        onRoam={handleRoam}
        onOpenChannels={async () => {
          // Sync date slider with current block range when opening channels
          // Opening channels drawer - syncing with current block range
          if (currentBlockRange) {
            // Syncing date slider with current block range
            await dateRangeSlider.syncWithCurrentBlockRange(currentBlockRange.min, currentBlockRange.max)
          } else {
            // No current block range to sync
          }
          appState.openChannels()
        }}
        hasCurrentTx={!!appState.currentTx}
        loading={appState.loading}
        queueLoading={appState.queueLoading}
      />

      {/* Details Drawer */}
      <DetailsDrawer
        txMeta={appState.currentTx}
        open={appState.detailsOpen}
        onClose={() => appState.setDetailsOpen(false)}
      />

      <ChannelsDrawer
        open={appState.showChannels}
        onClose={appState.closeChannels}
        currentMedia={appState.media}
        onMediaChange={appState.setMedia}
        currentTx={appState.currentTx}
        ownerAddress={appState.ownerAddress}
        onOwnerFilterChange={appState.setOwnerAddress}
        recency={appState.recency}
        onRecencyChange={appState.setRecency}
        tempRange={dateRangeSlider.tempRange}
        setTempRange={dateRangeSlider.setTempRange}
        rangeError={dateRangeSlider.rangeError}
        queueLoading={appState.queueLoading}
        isResolvingBlocks={dateRangeSlider.isResolvingBlocks}
        actualBlocks={dateRangeSlider.actualBlocks}
        onResetRange={dateRangeSlider.resetToSliderRange}
        onApplyRange={handleApplyRange}
        onBlockRangeEstimated={dateRangeSlider.handleBlockRangeEstimated}
      />

      {/* Floating About button */}
      <button 
        className="about-btn"
        onClick={() => appState.setShowAbout(true)}
        title="About"
        aria-label="About Roam"
      >
        <Icons.Info size={16} />
      </button>
      
      <AboutModal 
        open={appState.showAbout} 
        onClose={() => appState.setShowAbout(false)} 
      />
    </div>
  )
}