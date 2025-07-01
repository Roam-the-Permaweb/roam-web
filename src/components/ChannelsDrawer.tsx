import { useState, useEffect } from 'preact/hooks'
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
  
  // Advanced settings state
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [customCuUrl, setCustomCuUrl] = useState(wayfinderSettings.cuUrl || '')
  const [cuUrlError, setCuUrlError] = useState('')
  const [showTelemetryInfo, setShowTelemetryInfo] = useState(false)
  
  // Update customCuUrl when wayfinderSettings changes
  useEffect(() => {
    setCustomCuUrl(wayfinderSettings.cuUrl || '')
  }, [wayfinderSettings.cuUrl])

  const handleMediaChange = (media: MediaType) => {
    onMediaChange(media)
    onClose()
  }
  
  // Validation function for CU URL
  const validateCuUrl = (url: string) => {
    if (!url) return true // Empty is valid (uses default)
    
    try {
      const parsed = new URL(url)
      const isValid = parsed.protocol === 'https:' || parsed.protocol === 'http:'
      setCuUrlError(isValid ? '' : 'URL must start with http:// or https://')
      return isValid
    } catch {
      setCuUrlError('Invalid URL format')
      return false
    }
  }
  
  // Apply CU URL changes
  const handleApplyCuUrl = () => {
    if (validateCuUrl(customCuUrl)) {
      updateWayfinderSettings({ 
        cuUrl: customCuUrl || undefined // Empty string becomes undefined
      })
    }
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
            <button className={`content-card ${currentMedia === 'arns' ? 'active' : ''}`} onClick={() => handleMediaChange('arns')}>
              <span className="content-icon"><Icons.ArNS /></span>
              <span className="content-label">ArNS</span>
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

                {/* Telemetry - Help Improve AR.IO Network */}
                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-label">
                      Help Improve AR.IO Network
                      <button 
                        className="info-btn"
                        onClick={() => setShowTelemetryInfo(!showTelemetryInfo)}
                        aria-label="Learn more about telemetry"
                      >
                        <Icons.Info size={14} />
                      </button>
                    </span>
                    <span className="setting-description">
                      Share anonymous routing metrics (10% sample)
                    </span>
                    {showTelemetryInfo && (
                      <div className="telemetry-info">
                        <p>When enabled, Roam shares anonymous performance data to help improve the AR.IO network:</p>
                        <ul>
                          <li>• Gateway routing performance</li>
                          <li>• Request success/failure rates</li>
                          <li>• Response times</li>
                        </ul>
                        <p><strong>No personal data, transaction IDs, or content information is ever shared.</strong></p>
                      </div>
                    )}
                  </div>
                  <button 
                    className={`toggle-btn ${wayfinderSettings.telemetryEnabled ? 'active' : ''}`}
                    onClick={() => updateWayfinderSettings({ telemetryEnabled: !wayfinderSettings.telemetryEnabled })}
                    aria-label={`${wayfinderSettings.telemetryEnabled ? 'Disable' : 'Enable'} telemetry`}
                  >
                    <div className="toggle-indicator" />
                  </button>
                </div>

                {/* Advanced Settings */}
                <div className="advanced-settings">
                  <button 
                    className="advanced-toggle"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    aria-label={showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
                  >
                    <Icons.ChevronDown size={16} className={showAdvanced ? 'rotated' : ''} />
                    <span>Advanced Settings</span>
                  </button>
                  
                  {showAdvanced && (
                    <div className="advanced-content">
                      <div className="setting-row">
                        <div className="setting-info">
                          <span className="setting-label">AO Compute Unit URL</span>
                          <span className="setting-description">
                            Override the default CU for gateway information
                          </span>
                        </div>
                        <div className="input-group">
                          <input
                            type="text"
                            className={`text-input ${cuUrlError ? 'error' : ''}`}
                            value={customCuUrl}
                            onChange={(e) => {
                              const target = e.target as HTMLInputElement
                              setCustomCuUrl(target.value)
                              validateCuUrl(target.value)
                            }}
                            onBlur={handleApplyCuUrl}
                            placeholder="https://cu.ardrive.io"
                          />
                          {cuUrlError && (
                            <span className="error-message">{cuUrlError}</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="cu-info">
                        <Icons.Info size={14} />
                        <span>
                          The AO Compute Unit provides gateway information from the AR.IO network. 
                          Only change this if the default CU is experiencing issues. 
                          Common alternatives: https://cu.ao-testnet.xyz
                        </span>
                      </div>
                      
                      {customCuUrl && (
                        <button 
                          className="reset-cu-btn"
                          onClick={() => {
                            setCustomCuUrl('')
                            updateWayfinderSettings({ cuUrl: undefined })
                          }}
                        >
                          Reset to Default
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}