interface WelcomeScreenProps {
  onAccept: () => void
  onReject: () => void
}

export function WelcomeScreen({ onAccept, onReject }: WelcomeScreenProps) {
  return (
    <div className="welcome-backdrop">
      <div className="welcome-modal">
        <div className="welcome-header">
          <div className="welcome-icon">🎲</div>
          <h1>Welcome to Roam</h1>
          <p className="welcome-subtitle">Discover the Permaweb</p>
        </div>
        
        <div className="welcome-content">
          <p className="welcome-description">
            Explore random content from Arweave's permanent storage. 
            Tap through images, videos, music, websites, and more from the decentralized web.
          </p>
          
          <div className="content-warning">
            <div className="warning-icon">⚠️</div>
            <div className="warning-text">
              <strong>Content Notice:</strong> This app shows all public content from Arweave, 
              which may include sensitive or NSFW material. You must be 18+ to continue.
            </div>
          </div>
        </div>
        
        <div className="welcome-actions">
          <button className="welcome-btn primary" onClick={onAccept}>
            I Accept & Start Exploring
          </button>
          <button className="welcome-btn secondary" onClick={onReject}>
            Close App
          </button>
        </div>
      </div>
    </div>
  )
}