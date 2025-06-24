import { DateRangeSlider } from './DateRangeSlider'
import { Icons } from './Icons'
import { useSimplifiedWayfinderSettings } from '../hooks/useSimplifiedWayfinderSettings'
import type { MediaType, TxMeta } from '../constants'
import type { RoutingMode } from '../hooks/useSimplifiedWayfinderSettings'

interface DateRange {
  start: Date
  end: Date
}

interface ChannelsDrawerProps {
  open: boolean
  onClose: () => void
  
  // Media selection
  currentMedia: MediaType
  onMediaChange: (media: MediaType) => void
  
  // Owner filter
  currentTx: TxMeta | null
  ownerAddress?: string
  onOwnerFilterChange: (address?: string) => void
  
  // Recency
  recency: 'new' | 'old'
  onRecencyChange: (recency: 'new' | 'old') => void
  
  // Date range slider
  tempRange: DateRange
  setTempRange: (range: DateRange) => void
  rangeError: string | null
  queueLoading: boolean
  isResolvingBlocks?: boolean
  actualBlocks?: { min: number; max: number } | null // Actual blocks when syncing
  onResetRange: () => void
  onApplyRange: () => void
  onBlockRangeEstimated?: (minBlock: number, maxBlock: number) => void
}

export function ChannelsDrawer({
  open,
  onClose,
  currentMedia,
  onMediaChange,
  currentTx: _currentTx,
  ownerAddress: _ownerAddress,
  onOwnerFilterChange: _onOwnerFilterChange,
  recency: _recency,
  onRecencyChange: _onRecencyChange,
  tempRange,
  setTempRange,
  rangeError,
  queueLoading,
  isResolvingBlocks = false,
  actualBlocks,
  onResetRange,
  onApplyRange,
  onBlockRangeEstimated
}: ChannelsDrawerProps) {
  // Wayfinder settings management
  const { 
    settings: wayfinderSettings, 
    updateSettings: updateWayfinderSettings
  } = useSimplifiedWayfinderSettings()

  const handleMediaChange = (media: MediaType) => {
    onMediaChange(media)
    onClose()
  }

  const routingModeInfo: Record<RoutingMode, { label: string; description: string }> = {
    'balanced': {
      label: 'Balanced',
      description: 'Best mix of speed and load distribution'
    },
    'fast': {
      label: 'Fast',
      description: 'Always use the fastest responding gateway'
    },
    'fair-share': {
      label: 'Fair Share',
      description: 'Cycle through gateways evenly'
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className={`channels-backdrop ${open ? 'open' : ''}`} onClick={onClose} />
      
      {/* Drawer */}
      <div className={`channels-drawer ${open ? 'open' : ''}`}>
        <button className="drawer-close" onClick={onClose} type="button">
          <Icons.Close />
        </button>
        
        {/* Content Type Section */}
        <div className="section">
          <h2 className="section-title">Content Type</h2>
          <div className="content-grid">
            <button className={`content-card ${currentMedia === 'everything' ? 'active' : ''}`} onClick={() => handleMediaChange('everything')}>
              <span className="content-icon"><Icons.Everything /></span>
              <span className="content-label">Everything</span>
            </button>
            <button className={`content-card ${currentMedia === 'images' ? 'active' : ''}`} onClick={() => handleMediaChange('images')}>
              <span className="content-icon"><Icons.Images /></span>
              <span className="content-label">Images</span>
            </button>
            <button className={`content-card ${currentMedia === 'videos' ? 'active' : ''}`} onClick={() => handleMediaChange('videos')}>
              <span className="content-icon"><Icons.Videos /></span>
              <span className="content-label">Videos</span>
            </button>
            <button className={`content-card ${currentMedia === 'music' ? 'active' : ''}`} onClick={() => handleMediaChange('music')}>
              <span className="content-icon"><Icons.AudioMusic /></span>
              <span className="content-label">Music</span>
            </button>
            <button className={`content-card ${currentMedia === 'websites' ? 'active' : ''}`} onClick={() => handleMediaChange('websites')}>
              <span className="content-icon"><Icons.Websites /></span>
              <span className="content-label">Websites</span>
            </button>
            <button className={`content-card ${currentMedia === 'text' ? 'active' : ''}`} onClick={() => handleMediaChange('text')}>
              <span className="content-icon"><Icons.Text /></span>
              <span className="content-label">Text</span>
            </button>
            <button className={`content-card ${currentMedia === 'arfs' ? 'active' : ''}`} onClick={() => handleMediaChange('arfs')}>
              <span className="content-icon"><Icons.ArFS /></span>
              <span className="content-label">ArFS</span>
            </button>
          </div>
        </div>
        
        <DateRangeSlider
          tempRange={tempRange}
          setTempRange={setTempRange}
          onBlockRangeEstimated={onBlockRangeEstimated}
          isLoading={isResolvingBlocks}
          actualBlocks={actualBlocks || undefined}
          rangeError={rangeError}
          queueLoading={queueLoading}
          onResetRange={onResetRange}
          onApplyRange={onApplyRange}
        />

        {/* AR.IO Wayfinder Settings Section */}
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">AR.IO Wayfinder</h2>
          </div>
          
          <div className="settings-controls">
            {/* Master Control */}
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-label">Enable Wayfinder</span>
                <span className="setting-description">Smart gateway routing via AR.IO network</span>
              </div>
              <button 
                className={`toggle-btn ${wayfinderSettings.enabled ? 'active' : ''}`}
                onClick={() => updateWayfinderSettings({ enabled: !wayfinderSettings.enabled })}
                aria-label={`${wayfinderSettings.enabled ? 'Disable' : 'Enable'} Wayfinder`}
              >
                <div className="toggle-indicator" />
              </button>
            </div>

            {/* Routing Mode - Only show when Wayfinder is enabled */}
            {wayfinderSettings.enabled && (
              <>
                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-label">Routing Mode</span>
                    <span className="setting-description">{routingModeInfo[wayfinderSettings.routingMode].description}</span>
                  </div>
                  <div className="routing-mode-selector">
                    {(Object.keys(routingModeInfo) as RoutingMode[]).map((mode) => (
                      <button
                        key={mode}
                        className={`routing-mode-btn ${wayfinderSettings.routingMode === mode ? 'active' : ''}`}
                        onClick={() => updateWayfinderSettings({ routingMode: mode })}
                        aria-label={`Select ${routingModeInfo[mode].label} routing mode`}
                      >
                        {routingModeInfo[mode].label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Verified Browsing */}
                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-label">Verified Browsing</span>
                    <span className="setting-description">
                      Cryptographic proof that content hasn't been tampered with
                    </span>
                  </div>
                  <button 
                    className={`toggle-btn ${wayfinderSettings.verifiedBrowsing ? 'active' : ''}`}
                    onClick={() => updateWayfinderSettings({ verifiedBrowsing: !wayfinderSettings.verifiedBrowsing })}
                    aria-label={`${wayfinderSettings.verifiedBrowsing ? 'Disable' : 'Enable'} verified browsing`}
                  >
                    <div className="toggle-indicator" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}