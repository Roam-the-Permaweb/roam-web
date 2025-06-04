import { Icons } from './Icons'
import type { VerificationStatus } from '../services/wayfinderTypes'

interface VerificationIndicatorProps {
  status: VerificationStatus
  className?: string
}

export function VerificationIndicator({ status, className = '' }: VerificationIndicatorProps) {
  // Don't show indicator for pending or not-verified states
  if (status.status === 'pending' || status.status === 'not-verified') {
    return null
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
          icon: Icons.Loading,
          color: '#f59e0b', // amber-500
          title: 'Verifying content integrity...',
          className: 'verification-verifying'
        }
      case 'failed':
        return {
          icon: Icons.AlertTriangle,
          color: '#ef4444', // red-500
          title: `Content verification failed${status.error ? `: ${status.error}` : ''}`,
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
      <IconComponent size={12} />
    </div>
  )
}