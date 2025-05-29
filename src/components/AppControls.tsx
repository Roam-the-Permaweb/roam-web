interface AppControlsProps {
  onReset: () => Promise<void>
  onBack: () => Promise<void>
  onNext: () => void
  onRoam: () => void
  onOpenChannels: () => void
  hasCurrentTx: boolean
  loading: boolean
  queueLoading: boolean
}

export function AppControls({ 
  onReset, 
  onBack, 
  onNext, 
  onRoam, 
  onOpenChannels,
  hasCurrentTx, 
  loading, 
  queueLoading 
}: AppControlsProps) {
  return (
    <div className="controls">
      <button className="btn reset-btn" onClick={onReset} disabled={loading}>
        🔄 Reset
      </button>
      <button className="btn back-btn" onClick={onBack} disabled={!hasCurrentTx || loading}>
        ← Back
      </button>
      <button className="btn channels-btn" onClick={onOpenChannels} title="Channels">
        ⚙️
      </button>
      <button className="btn next-btn" onClick={onNext} disabled={loading || queueLoading}>
        Next →
      </button>
      <button className="btn roam-btn" onClick={onRoam} disabled={loading || queueLoading}>
        Roam 🎲
      </button>
    </div>
  )
}