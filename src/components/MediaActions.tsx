interface MediaActionsProps {
  onShare: () => void
  onDownload: () => void
  onOpenDetails: () => void
}

export function MediaActions({ onShare, onDownload, onOpenDetails }: MediaActionsProps) {
  return (
    <div className="media-actions">
      <button className="btn share-btn" onClick={onShare}>🔗 Share</button>
      <button className="btn download-btn" onClick={onDownload}>⬇️ Download</button>
      <button className="btn details-btn" onClick={onOpenDetails}>📇 Details</button>
    </div>
  )
}