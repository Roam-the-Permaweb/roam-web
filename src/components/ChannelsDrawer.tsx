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
  const { settings: wayfinderSettings, updateSettings: updateWayfinderSettings } = useWayfinderSettings()

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

                {/* AR.IO Settings Section */}
        <div className="section">
          <h2 className="section-title">AR.IO Network</h2>
          <div className="settings-controls">
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-label">Enhanced Content Delivery</span>
                <span className="setting-description">Use AR.IO network for enhanced content routing and verification</span>
              </div>
              <button 
                className={`toggle-btn ${wayfinderSettings.enableWayfinder ? 'active' : ''}`}
                onClick={() => updateWayfinderSettings({ enableWayfinder: !wayfinderSettings.enableWayfinder })}
                aria-label={`${wayfinderSettings.enableWayfinder ? 'Disable' : 'Enable'} AR.IO enhanced content delivery`}
              >
                <div className="toggle-indicator" />
              </button>
            </div>
            
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-label">GraphQL (Coming Soon)</span>
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
        </div>
      </div>
    </>
  )
}