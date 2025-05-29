// src/App.tsx
import { useEffect } from 'preact/hooks'
import { MediaView } from './components/MediaView'
import { DetailsDrawer } from './components/DetailsDrawer'
import { ZoomOverlay } from './components/ZoomOverlay'
import { Interstitial } from './components/Interstitial'
import { ConsentModal } from './components/ConsentModal'
import { AppHeader } from './components/AppHeader'
import { AppControls } from './components/AppControls'
import { TransactionInfo } from './components/TransactionInfo'
import { MediaActions } from './components/MediaActions'
import { AboutModal } from './components/AboutModal'
import { AppFooter } from './components/AppFooter'
import { ChannelsDrawer } from './components/ChannelsDrawer'
import { useInterstitialInjector } from './hooks/useInterstitialInjector'
import { useConsent } from './hooks/useConsent'
import { useDeepLink } from './hooks/useDeepLink'
import { useAppState } from './hooks/useAppState'
import { useNavigation } from './hooks/useNavigation'
import { useRangeSlider } from './hooks/useRangeSlider'
import { MAX_AD_CLICKS, MIN_AD_CLICKS } from './constants'
import './styles/app.css'
import './styles/channels-drawer.css'

export function App() {
  // Custom hooks
  const consent = useConsent()
  const deepLink = useDeepLink()
  const appState = useAppState()
  
  // Range slider hook (create first to get functions)
  const rangeSliderCallbacks = {
    setCurrentTx: appState.setCurrentTx,
    setQueueLoading: appState.setQueueLoading,
    setError: appState.setError,
    closeChannels: appState.closeChannels
  }
  
  const rangeSlider = useRangeSlider(1, 1_000_000_000_000_000, rangeSliderCallbacks)
  
  // Navigation callbacks
  const navigationCallbacks = {
    setCurrentTx: appState.setCurrentTx,
    setLoading: appState.setLoading,
    setQueueLoading: appState.setQueueLoading,
    setError: appState.setError,
    clearError: appState.clearError,
    setRangeSlider: rangeSlider.setRangeSlider,
    setTempRange: rangeSlider.setTempRange
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
        
        const range = await navigation.initializeQueue(appState.channel, opts)
        if (range && !cancelled) {
          rangeSlider.updateRanges(range)
        }
        
        if (deepLink.deepLinkOpts && !cancelled) {
          deepLink.clearDeepLink()
        }
      } catch (error) {
        if (!cancelled) {
          console.error('App initialization failed:', error)
        }
      }
    }
    
    initializeApp()
    return () => { cancelled = true }
  }, [appState.media, appState.recency, appState.ownerAddress, appState.appName, deepLink.deepLinkParsed])
  
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
  
  const handleRoam = () => navigation.handleRoam(appState.channel)
  
  const handleApplyRange = () => rangeSlider.applyCustomRange(
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
        <Interstitial src="/assets/static-ad.jpg" onClose={handleCloseAd} />
      )}
      
      <AppHeader />

      {appState.zoomSrc && <ZoomOverlay src={appState.zoomSrc} onClose={() => appState.setZoomSrc(null)} />}

      <AppControls
        onReset={navigation.handleReset}
        onBack={navigation.handleBack}
        onNext={handleNext}
        onRoam={handleRoam}
        onOpenChannels={appState.openChannels}
        hasCurrentTx={!!appState.currentTx}
        loading={appState.loading}
        queueLoading={appState.queueLoading}
      />

      {appState.error && <div className="error">{appState.error}</div>}

      <main className="media-container">
        {appState.loading && <div className="loading">Loading…</div>}
        {!appState.currentTx && !appState.loading && <div className="placeholder">Feeling curious? Tap "Next" to explore — or "Roam" to spin the dice.</div>}
        {appState.currentTx && !appState.loading && <>
          <MediaView
            txMeta={appState.currentTx}
            privacyOn={appState.privacyOn}
            onPrivacyToggle={appState.togglePrivacy}
            onZoom={(src) => appState.setZoomSrc(src)}
            onCorrupt={handleNext}
          />

          <TransactionInfo 
            txMeta={appState.currentTx} 
            formattedTime={appState.formattedTime} 
          />

          <MediaActions
            onShare={handleShare}
            onDownload={handleDownload}
            onOpenDetails={() => appState.setDetailsOpen(true)}
          />
        </>}
      </main>

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
        tempRange={rangeSlider.tempRange}
        setTempRange={rangeSlider.setTempRange}
        chainTip={deepLink.chainTip}
        rangeError={rangeSlider.rangeError}
        queueLoading={appState.queueLoading}
        onResetRange={rangeSlider.resetToSliderRange}
        onApplyRange={handleApplyRange}
      />

      <AppFooter onOpenAbout={() => appState.setShowAbout(true)} />
      
      <AboutModal 
        open={appState.showAbout} 
        onClose={() => appState.setShowAbout(false)} 
      />
    </div>
  )
}