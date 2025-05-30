import { DateRangeSlider } from './DateRangeSlider'
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
        <button className="drawer-close" onClick={onClose}>✖️</button>
        
        <h2>Channels</h2>
        <div className="channel-picker">
          <button className={currentMedia === 'images' ? 'active' : ''} onClick={() => handleMediaChange('images')}>🖼 Images</button>
          <button className={currentMedia === 'music' ? 'active' : ''} onClick={() => handleMediaChange('music')}>🎵 Music</button>
          <button className={currentMedia === 'videos' ? 'active' : ''} onClick={() => handleMediaChange('videos')}>🎬 Videos</button>
          <button className={currentMedia === 'websites' ? 'active' : ''} onClick={() => handleMediaChange('websites')}>🌐 Websites</button>
          <button className={currentMedia === 'text' ? 'active' : ''} onClick={() => handleMediaChange('text')}>📖 Text</button>
          <button className={currentMedia === 'arfs' ? 'active' : ''} onClick={() => handleMediaChange('arfs')}>📁 ArFS</button>
          <button className={currentMedia === 'everything' ? 'active' : ''} onClick={() => handleMediaChange('everything')}>⚡ Everything</button>
        </div>
        
        {/* Owner filter controls */}
        {(currentTx || ownerAddress) && (
          <div className="owner-filter">
            {ownerAddress ? (
              <>
                <div className="filter-label">Filtering by owner: {ownerAddress.slice(0, 8)}...</div>
                <button className="btn active" onClick={() => handleOwnerFilter(undefined)}>
                  👥 Show everyone
                </button>
              </>
            ) : currentTx ? (
              <button className="btn" onClick={() => handleOwnerFilter(currentTx.owner.address)}>
                👤 More from this owner
              </button>
            ) : null}
          </div>
        )}
        
        <h3>When</h3>
        <div className="time-picker">
          <button className={recency === 'new' ? 'active' : ''} onClick={() => handleRecencyChange('new')}>⏰ New</button>
          <button className={recency === 'old' ? 'active' : ''} onClick={() => handleRecencyChange('old')}>🗄️ Old</button>
        </div>
        
        <DateRangeSlider
          tempRange={tempRange}
          setTempRange={setTempRange}
          onBlockRangeEstimated={onBlockRangeEstimated}
          isLoading={isResolvingBlocks}
          actualBlocks={actualBlocks || undefined}
        />

        {rangeError && <div className="slider-error">{rangeError}</div>}

        <div className="block-range-actions">
          <button
            className="btn"
            onClick={onResetRange}
          >
            Cancel
          </button>
          <button
            className="btn"
            onClick={onApplyRange}
            disabled={tempRange.start >= tempRange.end || queueLoading}
          >
            {queueLoading ? "Loading…" : isResolvingBlocks ? "Resolving…" : "Apply"}
          </button>
        </div>
      </div>
    </>
  )
}