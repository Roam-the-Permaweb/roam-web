import { Icons } from './Icons'

interface NoContentScreenProps {
  message?: string
  onRetry?: () => void
  onOpenFilters?: () => void
}

export function NoContentScreen({ 
  message = "No content found", 
  onRetry,
  onOpenFilters 
}: NoContentScreenProps) {
  return (
    <div className="no-content-screen">
      <div className="no-content-content">
        <div className="no-content-icon">
          <Icons.Package size={48} />
        </div>
        
        <h2 className="no-content-title">No Content Found</h2>
        
        <p className="no-content-message">
          {message}
        </p>
        
        <div className="no-content-suggestions">
          <div className="suggestion-item">
            <Icons.Menu size={16} />
            <span>Try different content types or date ranges</span>
          </div>
          <div className="suggestion-item">
            <Icons.Recent size={16} />
            <span>Switch between "New" and "Old" content</span>
          </div>
          <div className="suggestion-item">
            <Icons.Archive size={16} />
            <span>Clear any creator filters</span>
          </div>
        </div>
        
        <div className="no-content-actions">
          {onOpenFilters && (
            <button onClick={onOpenFilters} className="no-content-btn secondary">
              <Icons.Menu size={16} />
              Adjust Filters
            </button>
          )}
          {onRetry && (
            <button onClick={onRetry} className="no-content-btn primary">
              <Icons.Everything size={16} />
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}