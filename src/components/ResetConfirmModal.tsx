import { Icons } from './Icons'

interface ResetConfirmModalProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ResetConfirmModal({ open, onConfirm, onCancel }: ResetConfirmModalProps) {
  if (!open) return null

  return (
    <div className="reset-confirm-overlay" onClick={onCancel}>
      <div className="reset-confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="reset-confirm-header">
          <div className="reset-confirm-icon">
            <Icons.Archive size={32} />
          </div>
          <h2>Reset Everything?</h2>
        </div>

        <div className="reset-confirm-content">
          <p>This will permanently clear:</p>
          
          <div className="reset-items">
            <div className="reset-item">
              <Icons.Clock size={16} />
              <span>Your viewing history</span>
            </div>
            <div className="reset-item">
              <Icons.BarChart size={16} />
              <span>Session statistics</span>
            </div>
            <div className="reset-item">
              <Icons.Eye size={16} />
              <span>Previously seen content</span>
            </div>
          </div>
          
          <p className="reset-warning">
            You'll get a fresh start with completely new content discovery.
          </p>
        </div>

        <div className="reset-confirm-actions">
          <button 
            className="reset-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button 
            className="reset-btn-confirm"
            onClick={onConfirm}
          >
            <Icons.Archive size={16} />
            Reset Everything
          </button>
        </div>
      </div>
    </div>
  )
}