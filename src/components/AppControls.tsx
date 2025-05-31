import { RotateCcw, ArrowLeft, Settings, ArrowRight, Shuffle } from 'lucide-preact'

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
      <button className="nav-btn secondary" onClick={onReset} disabled={loading} title="Reset to start" aria-label="Reset to start">
        <RotateCcw size={20} />
      </button>
      
      <button className="nav-btn secondary" onClick={onBack} disabled={!hasCurrentTx || loading} title="Go back" aria-label="Go back to previous content">
        <ArrowLeft size={20} />
      </button>
      
      <button className="nav-btn settings" onClick={onOpenChannels} title="Open filters" aria-label="Open content filters and settings">
        <Settings size={20} />
      </button>
      
      <button className="nav-btn primary" onClick={onNext} disabled={loading || queueLoading} title="Next content" aria-label="Go to next content">
        <ArrowRight size={20} />
      </button>
      
      <button className="nav-btn roam" onClick={onRoam} disabled={loading || queueLoading} title="Random explore" aria-label="Start random exploration">
        <Shuffle size={20} />
      </button>
    </div>
  )
}