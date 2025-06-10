import { useSessionStats } from '../hooks/useSessionStats'
import { Icons } from './Icons'
import type { TxMeta } from '../constants'

interface SessionStatsProps {
  currentTx: TxMeta | null
  open: boolean
  onClose: () => void
}

export function SessionStats({ currentTx, open, onClose }: SessionStatsProps) {
  const stats = useSessionStats(currentTx)

  if (!open) return null

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
  }

  const formatSize = (sizeKB: number) => {
    if (sizeKB < 1024) return `${sizeKB.toFixed(0)}KB`
    const sizeMB = sizeKB / 1024
    if (sizeMB < 1024) return `${sizeMB.toFixed(1)}MB`
    const sizeGB = sizeMB / 1024
    return `${sizeGB.toFixed(2)}GB`
  }

  return (
    <div className="session-stats-overlay" onClick={onClose}>
      <div className="session-stats-panel" onClick={e => e.stopPropagation()}>
        <div className="session-stats-header">
          <h2>Session Statistics</h2>
          <button
            className="close-btn"
            onClick={onClose}
            aria-label="Close session statistics"
          >
            <Icons.X size={20} />
          </button>
        </div>

        <div className="session-stats-content">
          <div className="stats-grid">
            {/* Overview Stats */}
            <div className="stat-card">
              <div className="stat-icon">
                <Icons.Eye size={24} />
              </div>
              <div className="stat-info">
                <div className="stat-value">{stats.contentViewed}</div>
                <div className="stat-label">Content Viewed</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <Icons.Clock size={24} />
              </div>
              <div className="stat-info">
                <div className="stat-value">{formatDuration(stats.sessionDurationMinutes)}</div>
                <div className="stat-label">Session Time</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <Icons.User size={24} />
              </div>
              <div className="stat-info">
                <div className="stat-value">{stats.uniqueCreatorCount}</div>
                <div className="stat-label">Unique Creators</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <Icons.Download size={24} />
              </div>
              <div className="stat-info">
                <div className="stat-value">{formatSize(stats.dataTransferred)}</div>
                <div className="stat-label">Data Browsed</div>
              </div>
            </div>

            {/* Content Type Distribution */}
            <div className="stat-card wide">
              <div className="stat-header">
                <Icons.BarChart size={20} />
                <span>Content Types</span>
              </div>
              <div className="content-types">
                {Object.entries(stats.contentTypes).map(([type, count]) => (
                  <div key={type} className="content-type-item">
                    <span className="content-type-name">{type}</span>
                    <span className="content-type-count">{count}</span>
                  </div>
                ))}
                {Object.keys(stats.contentTypes).length === 0 && (
                  <div className="no-data">No content viewed yet</div>
                )}
              </div>
            </div>

            {/* Favorite Content Type */}
            {stats.favoriteContentType !== 'Unknown' && (
              <div className="stat-card">
                <div className="stat-icon">
                  <Icons.Heart size={24} />
                </div>
                <div className="stat-info">
                  <div className="stat-value">{stats.favoriteContentType}</div>
                  <div className="stat-label">Favorite Type</div>
                </div>
              </div>
            )}

            {/* Content Diversity */}
            <div className="stat-card">
              <div className="stat-icon">
                <Icons.Layers size={24} />
              </div>
              <div className="stat-info">
                <div className="stat-value">{stats.contentDiversityPercent}%</div>
                <div className="stat-label">Content Diversity</div>
              </div>
            </div>

            {/* Time Range */}
            {stats.oldestContent && stats.newestContent && (
              <div className="stat-card wide">
                <div className="stat-header">
                  <Icons.Calendar size={20} />
                  <span>Content Time Range</span>
                </div>
                <div className="time-range">
                  <div className="time-range-item">
                    <span className="time-label">Oldest:</span>
                    <span className="time-value">
                      {formatDate(stats.oldestContent.date)}
                      <small> (Block {stats.oldestContent.blockHeight.toLocaleString()})</small>
                    </span>
                  </div>
                  <div className="time-range-item">
                    <span className="time-label">Newest:</span>
                    <span className="time-value">
                      {formatDate(stats.newestContent.date)}
                      <small> (Block {stats.newestContent.blockHeight.toLocaleString()})</small>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}