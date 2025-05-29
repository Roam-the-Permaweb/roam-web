import { BlockRangeSlider } from './BlockRangeSlider'
import type { MediaType, TxMeta } from '../constants'

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
  
  // Range slider
  tempRange: { min: number; max: number }
  setTempRange: (range: { min: number; max: number }) => void
  chainTip: number
  rangeError: string | null
  queueLoading: boolean
  onResetRange: () => void
  onApplyRange: () => void
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
  chainTip,
  rangeError,
  queueLoading,
  onResetRange,
  onApplyRange
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
        
        <BlockRangeSlider
          tempRange={tempRange}
          setTempRange={setTempRange}
          chainTip={chainTip}
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
            disabled={tempRange.min >= tempRange.max || queueLoading}
          >
            {queueLoading ? "Loading…" : "Apply"}
          </button>
        </div>
      </div>
    </>
  )
}