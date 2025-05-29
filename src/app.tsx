// src/App.tsx
import { useEffect } from 'preact/hooks'
import { MediaView } from './components/MediaView'
import { DetailsDrawer } from './components/DetailsDrawer'
import { ZoomOverlay } from './components/ZoomOverlay'
import { Interstitial } from './components/Interstitial'
import { BlockRangeSlider } from './components/BlockRangeSlider'
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
        <div className="consent-backdrop">
          <div className="consent-modal">
            <h2>⚠️ Content Warning</h2>
            <p>This app will show anything posted to Arweave - some of it may be sensitive or NSFW. Click at your own risk! You must be 18+ to continue.</p>
            <div className="consent-actions">
              <button className="consent-btn accept" onClick={consent.handleAccept}>I accept</button>
              <button className="consent-btn reject" onClick={consent.handleReject}>Close app</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Interstitial overlay */}
      {appState.showInterstitial && (
        <Interstitial src="/assets/static-ad.jpg" onClose={handleCloseAd} />
      )}
      
      <header className="app-header">
        <div className="banner">
          <img src="/assets/banner.png" alt="Roam the Permaweb Banner" />
        </div>
      </header>

      {appState.zoomSrc && <ZoomOverlay src={appState.zoomSrc} onClose={() => appState.setZoomSrc(null)} />}

      {/* Controls */}
      <div className="controls">
        <button className="btn reset-btn" onClick={navigation.handleReset} disabled={appState.loading}>🔄 Reset</button>
        <button className="btn back-btn" onClick={navigation.handleBack} disabled={!appState.currentTx || appState.loading}>← Back</button>
        <button className="btn channels-btn" onClick={appState.openChannels} title="Channels">⚙️</button>
        <button className="btn next-btn" onClick={handleNext} disabled={appState.loading || appState.queueLoading}>Next →</button>
        <button className="btn roam-btn" onClick={handleRoam} disabled={appState.loading || appState.queueLoading}>Roam 🎲</button>
      </div>

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

          {/* Transaction info */}
          <div className="tx-info">
            <a
              href={`https://viewblock.io/arweave/tx/${appState.currentTx.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              TX: {appState.currentTx.id.slice(0,6)}…
            </a>
            <span></span>
            <a
              href={`https://viewblock.io/arweave/address/${appState.currentTx.owner.address}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Owner: {appState.currentTx.owner.address.slice(0,6)}…
            </a>
            <span></span>
            <a
              className="tx-info-time"
              href={`https://viewblock.io/arweave/block/${appState.currentTx.block.height}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {appState.formattedTime}
            </a>
          </div>

          <div className="media-actions">
            <button className="btn share-btn" onClick={handleShare}>🔗 Share</button>
            <button className="btn download-btn" onClick={handleDownload}>⬇️ Download</button>
            <button className="btn details-btn" onClick={() => appState.setDetailsOpen(true)}>📇 Details</button>
          </div>
        </>}
      </main>

      {/* Details Drawer */}
      <DetailsDrawer
        txMeta={appState.currentTx}
        open={appState.detailsOpen}
        onClose={() => appState.setDetailsOpen(false)}
      />

      {/* Channels Backdrop & Drawer */}
      <div className={`channels-backdrop ${appState.showChannels ? 'open' : ''}`} onClick={appState.closeChannels} />
      <div className={`channels-drawer ${appState.showChannels ? 'open' : ''}`}>
        <button className="drawer-close" onClick={appState.closeChannels}>✖️</button>
        <h2>Channels</h2>
        <div className="channel-picker">
          <button className={appState.media === 'images' ? 'active' : ''} onClick={() => { appState.setMedia('images'); appState.closeChannels() }}>🖼 Images</button>
          <button className={appState.media === 'music' ? 'active' : ''} onClick={() => { appState.setMedia('music'); appState.closeChannels() }}>🎵 Music</button>
          <button className={appState.media === 'videos' ? 'active' : ''} onClick={() => { appState.setMedia('videos'); appState.closeChannels() }}>🎬 Videos</button>
          <button className={appState.media === 'websites' ? 'active' : ''} onClick={() => { appState.setMedia('websites'); appState.closeChannels() }}>🌐 Websites</button>
          <button className={appState.media === 'text' ? 'active' : ''} onClick={() => { appState.setMedia('text'); appState.closeChannels() }}>📖 Text</button>
          <button className={appState.media === 'arfs' ? 'active' : ''} onClick={() => { appState.setMedia('arfs'); appState.closeChannels() }}>📁 ArFS</button>
          <button className={appState.media === 'everything' ? 'active' : ''} onClick={() => { appState.setMedia('everything'); appState.closeChannels() }}>⚡ Everything</button>
        </div>
        
        {/* Owner filter controls */}
        {(appState.currentTx || appState.ownerAddress) && (
          <div className="owner-filter">
            {appState.ownerAddress ? (
              <>
                <div className="filter-label">Filtering by owner: {appState.ownerAddress.slice(0, 8)}...</div>
                <button className="btn active" onClick={() => { appState.setOwnerAddress(undefined); appState.closeChannels() }}>
                  👥 Show everyone
                </button>
              </>
            ) : appState.currentTx ? (
              <button className="btn" onClick={() => { appState.setOwnerAddress(appState.currentTx!.owner.address); appState.closeChannels() }}>
                👤 More from this owner
              </button>
            ) : null}
          </div>
        )}
        
        <h3>When</h3>
        <div className="time-picker">
          <button className={appState.recency === 'new' ? 'active' : ''} onClick={() => { appState.setRecency('new'); appState.closeChannels() }}>⏰ New</button>
          <button className={appState.recency === 'old' ? 'active' : ''} onClick={() => { appState.setRecency('old'); appState.closeChannels() }}>🗄️ Old</button>
        </div>
        
        <BlockRangeSlider
          tempRange={rangeSlider.tempRange}
          setTempRange={rangeSlider.setTempRange}
          chainTip={deepLink.chainTip}
        />

        {rangeSlider.rangeError && <div className="slider-error">{rangeSlider.rangeError}</div>}

        <div className="block-range-actions">
          <button
            className="btn"
            onClick={rangeSlider.resetToSliderRange}
          >
            Cancel
          </button>
          <button
            className="btn"
            onClick={handleApplyRange}
            disabled={rangeSlider.tempRange.min >= rangeSlider.tempRange.max || appState.queueLoading}
          >
            {appState.queueLoading ? "Loading…" : "Apply"}
          </button>
        </div>
      </div>

      <footer className="app-footer">
        <nav>
          <button
            className="footer-link"
            onClick={() => appState.setShowAbout(true)}
          >
            About
          </button>
          <span className="footer-separator">|</span>
          <a href="https://github.com/roam-the-permaweb/roam-web" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
        </nav>
        <div className="footer-copy">Roam v0.0.4</div>
      </footer>
      
      {/* About Modal */}
      {appState.showAbout && (
        <div className="about-modal">
          <div className="modal-backdrop" onClick={() => appState.setShowAbout(false)} />
          <div className="modal-content">
            <h2>Ready to Roam?</h2>
            <p>
              This playful app lets you randomly explore Arweave content:
              images, music, videos, websites, and even text documents.
              <br></br>
              <br></br>
              Just pick a channel, choose New or Old, and click Next to
              roam around the permaweb. Filter by creator, dive deep into
              history, or share those hidden gems!
            </p>
            <button className="modal-close-btn" onClick={() => appState.setShowAbout(false)}>
              ✖️
            </button>
          </div>
        </div>
      )}
    </div>
  )
}