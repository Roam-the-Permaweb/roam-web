import { Icons } from './Icons'

interface MediaActionsProps {
  onShare: () => void
  onDownload: () => void
  onOpenDetails: () => void
  onOpenInNewTab: () => void
}

export function MediaActions({ onShare, onDownload, onOpenDetails, onOpenInNewTab }: MediaActionsProps) {
  return (
    <div className="media-actions">
      <button className="action-btn primary" onClick={onOpenDetails} title="Details">
        <Icons.Details />
      </button>
      <button className="action-btn secondary" onClick={onOpenInNewTab} title="Open">
        <Icons.Open />
      </button>
      <button className="action-btn secondary" onClick={onShare} title="Share">
        <Icons.Share />
      </button>
      <button className="action-btn secondary" onClick={onDownload} title="Download">
        <Icons.Download />
      </button>
    </div>
  )
}