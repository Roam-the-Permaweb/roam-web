interface AboutModalProps {
  open: boolean
  onClose: () => void
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  if (!open) return null

  return (
    <div className="about-modal">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-content">
        <button className="modal-close-btn" onClick={onClose}>
          ✖️
        </button>
        
        <h2>Ready to Roam?</h2>
        <p>
          This playful app lets you randomly explore Arweave content:
          images, music, videos, websites, and even text documents.
        </p>
        <p>
          Just pick a channel and click Next to
          roam around the permaweb. Filter by creator, dive deep into
          history and share those hidden gems!
        </p>
        
        <div className="modal-footer">
          <div className="footer-links">
            <a 
              href="https://github.com/roam-the-permaweb/roam-web" 
              target="_blank" 
              rel="noopener noreferrer"
              className="footer-link"
            >
              GitHub
            </a>
            <span className="footer-separator">•</span>
            <span className="version-info">v0.1.3</span>
          </div>
        </div>
      </div>
    </div>
  )
}