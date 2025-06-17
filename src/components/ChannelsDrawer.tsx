import { useState } from 'preact/hooks'
import { DateRangeSlider } from './DateRangeSlider'
import { Icons } from './Icons'
import { useWayfinderSettings } from '../hooks/useWayfinderSettings'
import type { MediaType, TxMeta } from '../constants'

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
  currentTx,
  ownerAddress,
  onOwnerFilterChange,
  recency,
  onRecencyChange,
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
    updateSettings: updateWayfinderSettings, 
    resetToDefaults,
    validationErrors
  } = useWayfinderSettings()
  
  // Advanced settings visibility
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleMediaChange = (media: MediaType) => {
    onMediaChange(media)
    onClose()
  }

  const handleRecencyChange = (newRecency: 'new' | 'old') => {
    onRecencyChange(newRecency)
    onClose()
  }

  const handleOwnerFilter = (address?: string) => {
    onOwnerFilterChange(address)
    onClose()
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
        
        {/* Creator Section */}
        {(currentTx || ownerAddress) && (
          <div className="section">
            <h2 className="section-title">Creator</h2>
            <div className="creator-controls">
              {ownerAddress ? (
                <>
                  <div className="creator-info">
                    <span className="creator-icon"><Icons.Creator /></span>
                    <span className="creator-address">{ownerAddress.slice(0, 8)}...</span>
                  </div>
                  <button className="creator-btn active" onClick={() => handleOwnerFilter(undefined)}>
                    <span className="creator-icon"><Icons.Everyone /></span>
                    <span>Show Everyone</span>
                  </button>
                </>
              ) : currentTx ? (
                <button className="creator-btn" onClick={() => handleOwnerFilter(currentTx.owner.address)}>
                  <span className="creator-icon"><Icons.Creator /></span>
                  <span>More from this Creator</span>
                </button>
              ) : null}
            </div>
          </div>
        )}
        
        {/* Time Period Section */}
        <div className="section">
          <h2 className="section-title">Time Period</h2>
          <div className="time-controls">
            <button className={`time-btn ${recency === 'new' ? 'active' : ''}`} onClick={() => handleRecencyChange('new')}>
              <span className="time-icon"><Icons.Recent /></span>
              <span>Recent</span>
            </button>
            <button className={`time-btn ${recency === 'old' ? 'active' : ''}`} onClick={() => handleRecencyChange('old')}>
              <span className="time-icon"><Icons.Archive /></span>
              <span>Archive</span>
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
            <div className="section-title-with-status">
              <h2 className="section-title">AR.IO Wayfinder</h2>
            </div>
            <button 
              className={`advanced-toggle ${showAdvanced ? 'active' : ''}`}
              onClick={() => setShowAdvanced(!showAdvanced)}
              aria-label={`${showAdvanced ? 'Hide' : 'Show'} advanced settings`}
            >
              <Icons.Settings />
              Advanced
            </button>
          </div>
          
          {/* General Error Display */}
          {validationErrors.general && (
            <div className="general-error">
              <Icons.AlertTriangle />
              {validationErrors.general}
            </div>
          )}
          
          <div className="settings-controls">
            {/* Master Control */}
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-label">Enable Wayfinder</span>
                <span className="setting-description">Smart gateway routing + content verification via AR.IO network</span>
              </div>
              <button 
                className={`toggle-btn ${wayfinderSettings.enableWayfinder ? 'active' : ''}`}
                onClick={() => updateWayfinderSettings({ enableWayfinder: !wayfinderSettings.enableWayfinder })}
                aria-label={`${wayfinderSettings.enableWayfinder ? 'Disable' : 'Enable'} AR.IO Wayfinder`}
              >
                <div className="toggle-indicator" />
              </button>
            </div>

            {/* Advanced Configuration */}
            {showAdvanced && (
              <div className="advanced-settings">
                {/* Routing Configuration */}
                <div className="subsection">
                  <h3 className="subsection-title">Routing Configuration</h3>
                  
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Gateway Provider</span>
                      <span className="setting-description">How gateways are selected for routing</span>
                    </div>
                    <select 
                      className="setting-select"
                      value={wayfinderSettings.routingProvider}
                      onChange={(e) => updateWayfinderSettings({ routingProvider: e.currentTarget.value as 'network' | 'static' | 'simple-cache' })}
                    >
                      <option value="network">Network (AR.IO)</option>
                      <option value="static">Static List</option>
                      <option value="simple-cache">Cached Network</option>
                    </select>
                  </div>

                  {(wayfinderSettings.routingProvider === 'network' || 
                    (wayfinderSettings.routingProvider === 'simple-cache' && wayfinderSettings.routingCacheProvider === 'network')) && (
                    <>
                      <div className="setting-row">
                        <div className="setting-info">
                          <span className="setting-label">Gateway Limit</span>
                          <span className="setting-description">Number of top gateways to use</span>
                        </div>
                        <input 
                          type="number"
                          className="setting-input"
                          value={wayfinderSettings.routingNetworkLimit}
                          min="1"
                          max="100"
                          onChange={(e) => updateWayfinderSettings({ routingNetworkLimit: parseInt(e.currentTarget.value) || 50 })}
                        />
                      </div>

                      <div className="setting-row">
                        <div className="setting-info">
                          <span className="setting-label">Sort By</span>
                          <span className="setting-description">Gateway selection criteria</span>
                        </div>
                        <select 
                          className="setting-select"
                          value={wayfinderSettings.routingNetworkSortBy}
                          onChange={(e) => updateWayfinderSettings({ routingNetworkSortBy: e.currentTarget.value as 'operatorStake' | 'totalDelegatedStake' })}
                        >
                          <option value="operatorStake">Operator Stake</option>
                          <option value="totalDelegatedStake">Total Delegated Stake</option>
                        </select>
                      </div>
                    </>
                  )}

                  {wayfinderSettings.routingProvider === 'static' && (
                    <div className="setting-row">
                      <div className="setting-info">
                        <span className="setting-label">Static Gateways</span>
                        <span className="setting-description">Comma-separated gateway URLs</span>
                      </div>
                      <div>
                        <textarea 
                          className={`setting-textarea ${validationErrors.routingStaticGateways ? 'error' : ''}`}
                          value={wayfinderSettings.routingStaticGateways.join(', ')}
                          placeholder="https://arweave.net, https://permagate.io"
                          onChange={(e) => {
                            const gateways = e.currentTarget.value.split(',').map(g => g.trim()).filter(g => g)
                            updateWayfinderSettings({ routingStaticGateways: gateways })
                          }}
                        />
                        {validationErrors.routingStaticGateways && (
                          <div className="validation-error">{validationErrors.routingStaticGateways}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {wayfinderSettings.routingProvider === 'simple-cache' && (
                    <>
                      <div className="setting-row">
                        <div className="setting-info">
                          <span className="setting-label">Cache Provider</span>
                          <span className="setting-description">Underlying provider to cache</span>
                        </div>
                        <select 
                          className="setting-select"
                          value={wayfinderSettings.routingCacheProvider}
                          onChange={(e) => updateWayfinderSettings({ routingCacheProvider: e.currentTarget.value as 'network' | 'static' })}
                        >
                          <option value="network">Network (AR.IO)</option>
                          <option value="static">Static List</option>
                        </select>
                      </div>
                      <div className="setting-row">
                        <div className="setting-info">
                          <span className="setting-label">Cache Timeout</span>
                          <span className="setting-description">Cache duration (minutes)</span>
                        </div>
                        <input 
                          type="number"
                          className="setting-input"
                          value={wayfinderSettings.routingCacheTimeout}
                          min="1"
                          max="60"
                          onChange={(e) => updateWayfinderSettings({ routingCacheTimeout: parseInt(e.currentTarget.value) || 1 })}
                        />
                      </div>
                    </>
                  )}

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Routing Strategy</span>
                      <span className="setting-description">How gateways are selected</span>
                    </div>
                    <select 
                      className="setting-select"
                      value={wayfinderSettings.routingStrategy}
                      onChange={(e) => updateWayfinderSettings({ routingStrategy: e.currentTarget.value as 'random' | 'fastest-ping' | 'round-robin' | 'static' | 'preferred-fallback' })}
                    >
                      <option value="random">Random</option>
                      <option value="fastest-ping">Fastest Ping</option>
                      <option value="round-robin">Round Robin</option>
                      <option value="static">Static Gateway</option>
                      <option value="preferred-fallback">Preferred + Fallback</option>
                    </select>
                  </div>

                  {wayfinderSettings.routingStrategy === 'static' && (
                    <div className="setting-row">
                      <div className="setting-info">
                        <span className="setting-label">Static Gateway URL</span>
                        <span className="setting-description">Single gateway for all requests</span>
                      </div>
                      <div>
                        <input 
                          type="url"
                          className={`setting-input ${validationErrors.routingStaticGateway ? 'error' : ''}`}
                          value={wayfinderSettings.routingStaticGateway}
                          placeholder="https://arweave.net"
                          onChange={(e) => updateWayfinderSettings({ routingStaticGateway: e.currentTarget.value.trim() })}
                        />
                        {validationErrors.routingStaticGateway && (
                          <div className="validation-error">{validationErrors.routingStaticGateway}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {wayfinderSettings.routingStrategy === 'preferred-fallback' && (
                    <div className="setting-row">
                      <div className="setting-info">
                        <span className="setting-label">Preferred Gateway URL</span>
                        <span className="setting-description">Primary gateway with fallback</span>
                      </div>
                      <div>
                        <input 
                          type="url"
                          className={`setting-input ${validationErrors.routingPreferredGateway ? 'error' : ''}`}
                          value={wayfinderSettings.routingPreferredGateway}
                          placeholder="https://arweave.net"
                          onChange={(e) => updateWayfinderSettings({ routingPreferredGateway: e.currentTarget.value.trim() })}
                        />
                        {validationErrors.routingPreferredGateway && (
                          <div className="validation-error">{validationErrors.routingPreferredGateway}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {wayfinderSettings.routingStrategy === 'fastest-ping' && (
                    <div className="setting-row">
                      <div className="setting-info">
                        <span className="setting-label">Ping Timeout (ms)</span>
                        <span className="setting-description">Max ping response time</span>
                      </div>
                      <div>
                        <input 
                          type="number"
                          className="setting-input"
                          value={wayfinderSettings.routingTimeoutMs}
                          min="100"
                          max="5000"
                          step="100"
                          onChange={(e) => updateWayfinderSettings({ routingTimeoutMs: parseInt(e.currentTarget.value) || 500 })}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Verification Configuration */}
                <div className="subsection">
                  <h3 className="subsection-title">Verification Configuration</h3>
                  
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Enable Verification</span>
                      <span className="setting-description">Verify content integrity</span>
                    </div>
                    <button 
                      className={`toggle-btn ${wayfinderSettings.verificationEnabled ? 'active' : ''}`}
                      onClick={() => updateWayfinderSettings({ verificationEnabled: !wayfinderSettings.verificationEnabled })}
                      aria-label={`${wayfinderSettings.verificationEnabled ? 'Disable' : 'Enable'} verification`}
                    >
                      <div className="toggle-indicator" />
                    </button>
                  </div>

                  {wayfinderSettings.verificationEnabled && (
                    <>
                      <div className="setting-row">
                        <div className="setting-info">
                          <span className="setting-label">Verification Strategy</span>
                          <span className="setting-description">Method for content verification</span>
                        </div>
                        <select 
                          className="setting-select"
                          value={wayfinderSettings.verificationStrategy}
                          onChange={(e) => updateWayfinderSettings({ verificationStrategy: e.currentTarget.value as 'hash' | 'none' })}
                        >
                          <option value="hash">Hash-based</option>
                          <option value="none">None</option>
                        </select>
                      </div>

                      {wayfinderSettings.verificationStrategy === 'hash' && (
                        <>
                          <div className="setting-row">
                            <div className="setting-info">
                              <span className="setting-label">Gateway Provider</span>
                              <span className="setting-description">Source for verification gateways</span>
                            </div>
                            <select 
                              className="setting-select"
                              value={wayfinderSettings.verificationProvider}
                              onChange={(e) => updateWayfinderSettings({ verificationProvider: e.currentTarget.value as 'network' | 'static' | 'simple-cache' })}
                            >
                              <option value="network">Network (AR.IO)</option>
                              <option value="static">Static List</option>
                              <option value="simple-cache">Cached Network</option>
                            </select>
                          </div>

                          {(wayfinderSettings.verificationProvider === 'network' || 
                            (wayfinderSettings.verificationProvider === 'simple-cache' && wayfinderSettings.verificationCacheProvider === 'network')) && (
                            <>
                              <div className="setting-row">
                                <div className="setting-info">
                                  <span className="setting-label">Gateway Limit</span>
                                  <span className="setting-description">Number of verification gateways</span>
                                </div>
                                <input 
                                  type="number"
                                  className="setting-input"
                                  value={wayfinderSettings.verificationNetworkLimit}
                                  min="1"
                                  max="10"
                                  onChange={(e) => updateWayfinderSettings({ verificationNetworkLimit: parseInt(e.currentTarget.value) || 5 })}
                                />
                              </div>

                              <div className="setting-row">
                                <div className="setting-info">
                                  <span className="setting-label">Sort By</span>
                                  <span className="setting-description">Gateway selection criteria</span>
                                </div>
                                <select 
                                  className="setting-select"
                                  value={wayfinderSettings.verificationNetworkSortBy}
                                  onChange={(e) => updateWayfinderSettings({ verificationNetworkSortBy: e.currentTarget.value as 'operatorStake' | 'totalDelegatedStake' })}
                                >
                                  <option value="operatorStake">Operator Stake</option>
                                  <option value="totalDelegatedStake">Total Delegated Stake</option>
                                </select>
                              </div>
                            </>
                          )}

                          {wayfinderSettings.verificationProvider === 'static' && (
                            <div className="setting-row">
                              <div className="setting-info">
                                <span className="setting-label">Verification Gateways</span>
                                <span className="setting-description">Trusted gateways for hash comparison</span>
                              </div>
                              <div>
                                <textarea 
                                  className={`setting-textarea ${validationErrors.verificationStaticGateways ? 'error' : ''}`}
                                  value={wayfinderSettings.verificationStaticGateways.join(', ')}
                                  placeholder="https://permagate.io, https://vilenarios.com"
                                  onChange={(e) => {
                                    const gateways = e.currentTarget.value.split(',').map(g => g.trim()).filter(g => g)
                                    updateWayfinderSettings({ verificationStaticGateways: gateways })
                                  }}
                                />
                                {validationErrors.verificationStaticGateways && (
                                  <div className="validation-error">{validationErrors.verificationStaticGateways}</div>
                                )}
                              </div>
                            </div>
                          )}

                          {wayfinderSettings.verificationProvider === 'simple-cache' && (
                            <>
                              <div className="setting-row">
                                <div className="setting-info">
                                  <span className="setting-label">Cache Provider</span>
                                  <span className="setting-description">Underlying provider to cache</span>
                                </div>
                                <select 
                                  className="setting-select"
                                  value={wayfinderSettings.verificationCacheProvider}
                                  onChange={(e) => updateWayfinderSettings({ verificationCacheProvider: e.currentTarget.value as 'network' | 'static' })}
                                >
                                  <option value="network">Network (AR.IO)</option>
                                  <option value="static">Static List</option>
                                </select>
                              </div>
                              <div className="setting-row">
                                <div className="setting-info">
                                  <span className="setting-label">Cache Timeout</span>
                                  <span className="setting-description">Cache duration (minutes)</span>
                                </div>
                                <input 
                                  type="number"
                                  className="setting-input"
                                  value={wayfinderSettings.verificationCacheTimeout}
                                  min="1"
                                  max="60"
                                  onChange={(e) => updateWayfinderSettings({ verificationCacheTimeout: parseInt(e.currentTarget.value) || 1 })}
                                />
                              </div>
                            </>
                          )}

                          <div className="setting-row">
                            <div className="setting-info">
                              <span className="setting-label">Verification Timeout</span>
                              <span className="setting-description">Max verification time (ms)</span>
                            </div>
                            <div>
                              <input 
                                type="number"
                                className="setting-input"
                                value={wayfinderSettings.verificationTimeoutMs}
                                min="1000"
                                max="30000"
                                step="1000"
                                onChange={(e) => updateWayfinderSettings({ verificationTimeoutMs: parseInt(e.currentTarget.value) || 20000 })}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Fallback Configuration */}
                <div className="subsection">
                  <h3 className="subsection-title">Fallback Configuration</h3>
                  
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Fallback Gateways</span>
                      <span className="setting-description">Used when Wayfinder is disabled</span>
                    </div>
                    <div>
                      <textarea 
                        className={`setting-textarea ${validationErrors.fallbackGateways ? 'error' : ''}`}
                        value={wayfinderSettings.fallbackGateways.join(', ')}
                        placeholder="https://arweave.net"
                        onChange={(e) => {
                          const gateways = e.currentTarget.value.split(',').map(g => g.trim()).filter(g => g)
                          updateWayfinderSettings({ fallbackGateways: gateways })
                        }}
                      />
                      {validationErrors.fallbackGateways && (
                        <div className="validation-error">{validationErrors.fallbackGateways}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="subsection">
                  <h3 className="subsection-title">Future Features</h3>
                  
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">GraphQL Routing (Coming Soon)</span>
                      <span className="setting-description">Use AR.IO network for metadata queries</span>
                    </div>
                    <button 
                      className="toggle-btn disabled"
                      disabled
                      aria-label="GraphQL routing not yet available"
                    >
                      <div className="toggle-indicator" />
                    </button>
                  </div>
                </div>

                <div className="subsection">
                  <button 
                    className="reset-btn"
                    onClick={resetToDefaults}
                    aria-label="Reset all Wayfinder settings to defaults"
                  >
                    <Icons.RotateCcw />
                    Reset to Defaults
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}