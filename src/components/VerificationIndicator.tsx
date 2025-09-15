import { Icons } from './Icons'
import { ProgressRing } from './ProgressRing'
import type { VerificationStatus } from '../services/wayfinderTypes'

interface VerificationIndicatorProps {
  status: VerificationStatus
  className?: string
  showProgressText?: boolean
}

export function VerificationIndicator({ 
  status, 
  className = '',
  showProgressText = false 
}: VerificationIndicatorProps) {
  // Don't show indicator for pending or not-verified states
  if (status.status === 'pending' || status.status === 'not-verified') {
    return null
  }

  // Always show progress text when verifying for better mobile UX
  const shouldShowText = showProgressText || status.status === 'verifying'

  const getStatusMessage = () => {
    if (status.status === 'verifying' && status.progress) {
      const { stage, percentage } = status.progress
      
      switch (stage) {
        case 'routing':
          return 'Finding gateway...'
        case 'downloading':
          return 'Loading content...' // No percentage - we don't have real download progress
        case 'verifying':
          return `Verifying ${Math.round(percentage)}%` // Real verification progress
        default:
          return 'Loading...'
      }
    }
    
    switch (status.status) {
      case 'verified':
        return 'Verified ✓'
      case 'verifying':
        return 'Verifying...'
      case 'failed':
        return 'Verification failed'
      default:
        return ''
    }
  }

  const getIndicatorProps = () => {
    switch (status.status) {
      case 'verified':
        return {
          icon: Icons.CheckCircle,
          color: '#22c55e', // green-500
          title: `Content verified via AR.IO network ${status.gateway ? ` (${status.gateway})` : ''}`,
          className: 'verification-verified'
        }
      case 'verifying':
        return {
          icon: null, // Use progress ring instead
          color: '#f59e0b', // amber-500
          title: getStatusMessage(),
          className: 'verification-verifying'
        }
      case 'failed':
        return {
          icon: Icons.AlertTriangle,
          color: '#ef4444', // red-500
          title: getStatusMessage(),
          className: 'verification-failed'
        }
      default:
        return null
    }
  }

  const indicatorProps = getIndicatorProps()
  if (!indicatorProps) return null

  const { icon: IconComponent, color, title, className: statusClass } = indicatorProps

  return (
    <div 
      className={`verification-indicator ${statusClass} ${className}`}
      title={title}
      style={{ '--verification-color': color } as any}
    >
      {status.status === 'verifying' && status.progress ? (
        <ProgressRing 
          progress={status.progress.percentage} 
          size={16} 
          strokeWidth={2}
        />
      ) : IconComponent ? (
        <IconComponent size={12} />
      ) : null}
      
      {shouldShowText && (
        <span className="verification-status-text">
          {getStatusMessage()}
        </span>
      )}
    </div>
  )
}