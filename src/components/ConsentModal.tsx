interface ConsentModalProps {
  onAccept: () => void
  onReject: () => void
}

export function ConsentModal({ onAccept, onReject }: ConsentModalProps) {
  return (
    <div className="consent-backdrop">
      <div className="consent-modal">
        <div className="consent-icon">⚠️</div>
        <h2>Content Warning</h2>
        <p>
          This app will show anything posted to Arweave - some content may be 
          sensitive or NSFW. You must be 18+ to continue.
        </p>
        <div className="consent-actions">
          <button className="consent-btn primary" onClick={onAccept}>
            I Accept & Continue
          </button>
          <button className="consent-btn secondary" onClick={onReject}>
            Close App
          </button>
        </div>
      </div>
    </div>
  )
}