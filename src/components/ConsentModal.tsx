interface ConsentModalProps {
  onAccept: () => void
  onReject: () => void
}

export function ConsentModal({ onAccept, onReject }: ConsentModalProps) {
  return (
    <div className="consent-backdrop">
      <div className="consent-modal">
        <h2>⚠️ Content Warning</h2>
        <p>This app will show anything posted to Arweave - some of it may be sensitive or NSFW. Click at your own risk! You must be 18+ to continue.</p>
        <div className="consent-actions">
          <button className="consent-btn accept" onClick={onAccept}>I accept</button>
          <button className="consent-btn reject" onClick={onReject}>Close app</button>
        </div>
      </div>
    </div>
  )
}