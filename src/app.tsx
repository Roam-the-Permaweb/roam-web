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
import { MediaViewErrorBoundary } from './components/ErrorBoundary'
import { DetailsDrawer } from './components/DetailsDrawer'
import { ZoomOverlay } from './components/ZoomOverlay'
import { Interstitial } from './components/Interstitial'
import { WelcomeScreen } from './components/WelcomeScreen'
import { LoadingScreen } from './components/LoadingScreen'
import { NoContentScreen } from './components/NoContentScreen'
import { AppHeader } from './components/AppHeader'
import { AppControls } from './components/AppControls'
import { TransactionInfo } from './components/TransactionInfo'
import { AboutModal } from './components/AboutModal'
import { ChannelsDrawer } from './components/ChannelsDrawer'
import { SessionStats } from './components/SessionStats'
import { ResetConfirmModal } from './components/ResetConfirmModal'
import { Icons } from './components/Icons'
import { useInterstitialInjector } from './hooks/useInterstitialInjector'
import { useConsent } from './hooks/useConsent'
import { useDeepLink } from './hooks/useDeepLink'
import { useAppState } from './hooks/useAppState'
import { useNavigation } from './hooks/useNavigation'
import { useDateRangeSlider } from './hooks/useDateRangeSlider'
import { useSwipeGesture } from './hooks/useSwipeGesture'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSessionStats } from './hooks/useSessionStats'
import { useVerificationStatus } from './hooks/useVerificationStatus'
import { useBackButtonState } from './hooks/useBackButtonState'
import { logger } from './utils/logger'
import { objectUrlManager } from './utils/objectUrlManager'
import { MAX_AD_CLICKS, MIN_AD_CLICKS, DEFAULT_DATE_RANGE_DAYS, APP_SWIPE_THRESHOLD, APP_SWIPE_TIME_LIMIT } from './constants'
import { wayfinderService } from './services/wayfinder'
import { arnsService } from './services/arns'
import './styles/app.css'
import './styles/channels-drawer.css'
import './styles/welcome-screen.css'
import './styles/loading-screen.css'
import './styles/no-content.css'
import './styles/session-stats.css'
import './styles/reset-confirm.css'

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
   
  // Log app initialization
  useEffect(() => {
    logger.info('🚀 Roam app initializing', {
      version: '0.3.0',
      platform: 'web',
      timestamp: new Date().toISOString()
    })
    
    // Set up periodic cleanup for old Object URLs
    const cleanupInterval = setInterval(() => {
      objectUrlManager.cleanupOld(60000); // Clean up URLs older than 1 minute
    }, 30000); // Run every 30 seconds
    
    return () => {
      clearInterval(cleanupInterval);
      objectUrlManager.cleanupAll(); // Clean up all URLs on app unmount
    };
  }, [])
  
  const consent = useConsent()
  const deepLink = useDeepLink()
  const appState = useAppState()
  
  // Pre-initialize Wayfinder on app startup to spread out the load
  useEffect(() => {
    const preInitializeWayfinder = async () => {
      try {
        logger.info('wayfinder.pre-init.start', { timestamp: Date.now() })
        const startTime = Date.now()
        await wayfinderService.initialize()
        logger.info('wayfinder.pre-init.complete', { 
          duration: Date.now() - startTime,
          initialized: true
        })
      } catch (error) {
        logger.warn('wayfinder.pre-init.failed', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        })
      }
    }
    
    preInitializeWayfinder()
  }, [])
  
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
  
  // Session statistics modal
  const [showSessionStats, setShowSessionStats] = useState(false)
  
  // Reset confirmation modal
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  
  // Track current gateway for "Open in new tab" functionality
  const [currentGateway, setCurrentGateway] = useState<string | null>(null)
  
  // Session statistics tracking (now we use the hook directly)
  const sessionStats = useSessionStats(appState.currentTx)
  
  // Track ad views when interstitial is shown
  useEffect(() => {
    if (appState.showInterstitial) {
      logger.info('Tracking ad view - showInterstitial is true')
      sessionStats.incrementAdsViewed()
    }
  }, [appState.showInterstitial, sessionStats.incrementAdsViewed])
  
  // Track verification status for current transaction
  // For ArFS files, track the data transaction instead of metadata
  const verificationStatus = useVerificationStatus(
    appState.currentTx?.arfsMeta?.dataTxId || appState.currentTx?.id || null
  )
  
  
  // Track back button state
  const canNavigateBack = useBackButtonState(appState.currentTx)
  

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
  const { recordClick, shouldShowInterstitial, reset, clearPersistedData } = useInterstitialInjector(MIN_AD_CLICKS, MAX_AD_CLICKS)
  
  const handleCloseAd = () => {
    appState.setShowInterstitial(false)
    reset()
    // After ad, go to next
    navigation.handleNext(appState.channel, recordClick, false, appState.setShowInterstitial)
  }
  
  // Initialize queue on first load with deep link
  useEffect(() => {
    if (!deepLink.deepLinkParsed) return
    
    let cancelled = false
    
    const initializeApp = async () => {
      try {
        // Only auto-initialize if we have deep link parameters (direct links)
        const hasDeepLinkContent = deepLink.deepLinkOpts?.initialTx || 
                    deepLink.deepLinkOpts?.minBlock != null || 
                    deepLink.deepLinkOpts?.ownerAddress != null
        
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
        
        // Only auto-load content for direct links, not for fresh visits
        if (hasDeepLinkContent) {
          logger.debug('Initializing app with deep link', { channel: appState.channel })
          
          const opts = {
            initialTx: deepLink.deepLinkOpts?.initialTx,
            minBlock: deepLink.deepLinkOpts?.minBlock,
            maxBlock: deepLink.deepLinkOpts?.maxBlock,
            ownerAddress: deepLink.deepLinkOpts?.ownerAddress,
            appName: deepLink.deepLinkOpts?.appName
          }
          
          await navigation.initializeQueue(appState.channel, opts)
          // Mark as initially loaded so filter changes work properly
          setHasInitiallyLoaded(true)
        } else {
          logger.debug('Fresh visit - waiting for user to start exploring')
        }
        
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
  }, [deepLink.deepLinkParsed])

  // Handle filter changes (reload content when user changes filters)
  useEffect(() => {
    if (!deepLink.deepLinkParsed || !consent.accepted) return
    if (!hasInitiallyLoaded) return // Don't reload before initial load
    // Remove the currentTx check - allow filter changes even if content is being loaded
    
    let cancelled = false
    
    const handleFilterChange = async () => {
      try {
        logger.debug('Filter changed - reinitializing content', { 
          media: appState.media, 
          recency: appState.recency,
          ownerAddress: appState.ownerAddress,
          appName: appState.appName 
        })
        
        // Initialize new queue with current filters
        await navigation.initializeQueue(appState.channel)
      } catch (error) {
        if (!cancelled) {
          logger.error('Filter change initialization failed:', error)
        }
      }
    }
    
    handleFilterChange()
    return () => { cancelled = true }
  }, [appState.media, appState.recency, appState.ownerAddress, appState.appName])
  
  // Date slider is independent - no automatic syncing needed
  
  // ArNS metadata enhancement listener
  useEffect(() => {
    const handleArNSMetadata = (event: CustomEvent) => {
      const { arnsName, transaction, gatewayUrl } = event.detail;
      
      // Check if this metadata is for the current transaction
      if (appState.currentTx?.arnsName === arnsName) {
        logger.debug('[ArNS] Enhancing current transaction with background metadata');
        
        // Update current transaction with real metadata and resolved gateway
        const enhancedTx = {
          ...appState.currentTx,
          owner: transaction.owner,
          block: transaction.block,
          data: transaction.data,
          tags: transaction.tags,
          fee: transaction.fee,
          quantity: transaction.quantity,
          bundledIn: transaction.bundledIn,
          arnsGateway: gatewayUrl
        };
        
        appState.setCurrentTx(enhancedTx);
      }
    };
    
    arnsService.addEventListener('arns-metadata-ready', handleArNSMetadata);
    
    return () => {
      arnsService.removeEventListener('arns-metadata-ready', handleArNSMetadata);
    };
  }, [appState.currentTx?.arnsName]);
  
  
  // Early return if consent rejected
  if (consent.rejected) return null
  
  // Navigation handlers with proper parameters
  const handleNext = () => navigation.handleNext(
    appState.channel, 
    recordClick, 
    shouldShowInterstitial, 
    appState.setShowInterstitial
  )
  
  // Create error handler for MediaView
  const handleCorrupt = navigation.handleCorruptContent(
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
  
  const handleDownload = () => navigation.handleDownload(appState.currentTx, currentGateway)
  
  const handleOpenInNewTab = () => {
    if (!appState.currentTx) return
    const dataTxId = appState.currentTx.arfsMeta?.dataTxId || appState.currentTx.id
    
    let url: string
    
    // Handle ArNS names specially
    if (appState.currentTx.arnsName && appState.currentTx.arnsGateway) {
      // Check if the gateway URL already includes the ArNS subdomain
      const gatewayUrl = new URL(appState.currentTx.arnsGateway)
      if (gatewayUrl.hostname.startsWith(`${appState.currentTx.arnsName}.`)) {
        // Gateway URL already has the ArNS subdomain
        url = appState.currentTx.arnsGateway
      } else {
        // Need to add the ArNS subdomain
        url = `https://${appState.currentTx.arnsName}.${gatewayUrl.hostname}`
      }
    } else {
      // Use the current gateway if available, otherwise fall back to arweave.net
      const gateway = currentGateway || 'https://arweave.net'
      // Remove trailing slash from gateway if present
      const gatewayBase = gateway.endsWith('/') ? gateway.slice(0, -1) : gateway
      url = `${gatewayBase}/${dataTxId}`
    }
    
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  
  const handleRoam = () => navigation.handleRoam(appState.channel)

  // Auto-start exploring - only on initial consent acceptance
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false)
  
  useEffect(() => {
    if (consent.accepted && !hasInitiallyLoaded && !appState.currentTx && !appState.loading && deepLink.deepLinkParsed) {
      // Only auto-start if there's no deep link content and we haven't loaded initially
      const hasDeepLinkContent = deepLink.deepLinkOpts?.initialTx || 
                  deepLink.deepLinkOpts?.minBlock != null || 
                  deepLink.deepLinkOpts?.ownerAddress != null
      
      if (!hasDeepLinkContent) {
        logger.info('app.auto-start', { 
          consent: consent.accepted,
          deepLink: false,
          channel: appState.channel
        })
        setHasInitiallyLoaded(true)
        handleNext()
      } else {
        logger.info('app.deep-link-start', {
          hasInitialTx: !!deepLink.deepLinkOpts?.initialTx,
          hasOwner: !!deepLink.deepLinkOpts?.ownerAddress,
          hasBlockRange: deepLink.deepLinkOpts?.minBlock != null
        })
      }
    }
  }, [consent.accepted, hasInitiallyLoaded, appState.currentTx, appState.loading, deepLink.deepLinkParsed])
  
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

  // Keyboard shortcuts support
  useKeyboardShortcuts({
    onNext: handleNext,
    onPrevious: navigation.handleBack,
    onShare: handleShare,
    onDownload: handleDownload,
    onOpenChannels: appState.openChannels,
    onCloseOverlays: () => {
      if (appState.showChannels) appState.closeChannels()
      if (appState.detailsOpen) appState.setDetailsOpen(false)
      if (appState.showAbout) appState.setShowAbout(false)
      if (showSessionStats) setShowSessionStats(false)
      if (showResetConfirm) setShowResetConfirm(false)
      if (appState.zoomSrc) appState.setZoomSrc(null)
    },
    onTogglePrivacy: appState.togglePrivacy,
    onSessionStats: () => setShowSessionStats(true)
  })

  
  const handleApplyRange = () => {
    // Check if block height mode is active
    const blockHeightMode = localStorage.getItem('roam-block-height-mode') === 'true'
    
    if (blockHeightMode && dateRangeSlider.tempBlocks) {
      // Use temp block range in block mode
      dateRangeSlider.applyCustomBlockRange(
        dateRangeSlider.tempBlocks.min,
        dateRangeSlider.tempBlocks.max,
        appState.channel,
        appState.ownerAddress,
        appState.appName,
        navigation.blockRangeRef
      )
    } else {
      // Use date range in date mode
      dateRangeSlider.applyCustomDateRange(
        appState.channel,
        appState.ownerAddress,
        appState.appName,
        navigation.blockRangeRef
      )
    }
  }

  // Reset confirmation handlers
  const handleResetClick = async () => {
    setShowResetConfirm(true)
  }

  const handleResetConfirm = async () => {
    setShowResetConfirm(false)
    // Reset session statistics
    sessionStats.resetStats()
    // Reset ad click tracking
    clearPersistedData()
    // Reset navigation and seen content
    await navigation.handleReset(appState.channel)
  }

  const handleResetCancel = () => {
    setShowResetConfirm(false)
  }
  
  return (
    <div className="app">
      {!consent.accepted && (
        <WelcomeScreen onAccept={consent.handleAccept} onReject={consent.handleReject} />
      )}
      
      {/* Interstitial overlay */}
      {appState.showInterstitial && (
        <Interstitial src="/static-ad.jpg" onClose={handleCloseAd} />
      )}
      
      <AppHeader />

      {appState.zoomSrc && <ZoomOverlay src={appState.zoomSrc} onClose={() => appState.setZoomSrc(null)} />}

      {appState.error && appState.error.includes('No content found') && !appState.loading && !appState.queueLoading ? (
        <NoContentScreen 
          message="We couldn't find any content matching your current filters"
          onRetry={handleNext}
          onOpenFilters={appState.openChannels}
        />
      ) : appState.error && !appState.loading ? (
        <div className="error">{appState.error}</div>
      ) : null}

      <main ref={mainRef} className={`media-container ${appState.loading ? 'loading' : ''}`}>
        {/* Only show full loading screen when no content exists */}
        {(appState.loading || appState.queueLoading) && !appState.currentTx ? (
          <LoadingScreen />
        ) : appState.currentTx ? (
          <>
            <MediaViewErrorBoundary
              onError={() => {
                logger.error('MediaView error occurred');
                // Optionally skip to next content on error
                handleCorrupt();
              }}
            >
              <MediaView
                txMeta={appState.currentTx}
                privacyOn={appState.privacyOn}
                onPrivacyToggle={appState.togglePrivacy}
                onZoom={(src) => appState.setZoomSrc(src)}
                onCorrupt={handleCorrupt}
                loading={appState.loading}
                onShare={handleShare}
                onDownload={handleDownload}
                onDetails={() => appState.setDetailsOpen(true)}
                onOpenInNewTab={handleOpenInNewTab}
                onGatewayChange={setCurrentGateway}
              />
            </MediaViewErrorBoundary>

            {!appState.loading && (
              <TransactionInfo 
                txMeta={appState.currentTx} 
                formattedTime={appState.formattedTime}
                verificationStatus={verificationStatus}
                currentGateway={currentGateway}
              />
            )}
          </>
        ) : null}
      </main>

      <AppControls
        onReset={handleResetClick}
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
        canGoBack={canNavigateBack}
        loading={appState.loading}
        queueLoading={appState.queueLoading}
      />

      {/* Details Drawer */}
      <DetailsDrawer
        txMeta={appState.currentTx}
        open={appState.detailsOpen}
        onClose={() => appState.setDetailsOpen(false)}
        currentGateway={currentGateway}
        verificationStatus={verificationStatus}
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
        tempBlocks={dateRangeSlider.tempBlocks}
        onResetRange={dateRangeSlider.resetToSliderRange}
        onApplyRange={handleApplyRange}
        onBlockRangeEstimated={dateRangeSlider.handleBlockRangeEstimated}
      />

      {/* Floating action buttons */}
      <div className="floating-buttons">
        <button 
          className="stats-btn"
          onClick={() => setShowSessionStats(true)}
          title="Session Statistics"
          aria-label="View session statistics"
        >
          <Icons.BarChart size={16} />
        </button>
        
        <button 
          className="about-btn"
          onClick={() => appState.setShowAbout(true)}
          title="About"
          aria-label="About Roam"
        >
          <Icons.Info size={16} />
        </button>
      </div>
      
      <AboutModal 
        open={appState.showAbout} 
        onClose={() => appState.setShowAbout(false)} 
      />
      
      <SessionStats
        currentTx={appState.currentTx}
        open={showSessionStats}
        onClose={() => setShowSessionStats(false)}
      />

      <ResetConfirmModal
        open={showResetConfirm}
        onConfirm={handleResetConfirm}
        onCancel={handleResetCancel}
      />
    </div>
  )
}