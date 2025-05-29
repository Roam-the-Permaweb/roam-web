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
        <h2>Ready to Roam?</h2>
        <p>
          This playful app lets you randomly explore Arweave content:
          images, music, videos, websites, and even text documents.
          <br></br>
          <br></br>
          Just pick a channel, choose New or Old, and click Next to
          roam around the permaweb. Filter by creator, dive deep into
          history, or share those hidden gems!
        </p>
        <button className="modal-close-btn" onClick={onClose}>
          ✖️
        </button>
      </div>
    </div>
  )
}