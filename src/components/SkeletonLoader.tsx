// src/components/SkeletonLoader.tsx
import './skeleton.css'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'rectangular' | 'circular'
  width?: string | number
  height?: string | number
  lines?: number
}

export const Skeleton = ({ 
  className = '', 
  variant = 'rectangular', 
  width, 
  height, 
  lines = 1 
}: SkeletonProps) => {
  const baseClass = `skeleton skeleton-${variant}`
  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  }

  if (variant === 'text' && lines > 1) {
    return (
      <div className={`skeleton-text-container ${className}`}>
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={baseClass}
            style={{
              ...style,
              width: i === lines - 1 ? '70%' : '100%',
            }}
          />
        ))}
      </div>
    )
  }

  return <div className={`${baseClass} ${className}`} style={style} />
}

// Skeleton components for specific use cases
export const MediaSkeleton = () => (
  <div className="media-skeleton">
    <Skeleton variant="rectangular" height={400} className="media-frame-skeleton" />
    <div className="metadata-skeleton">
      <Skeleton variant="text" width="60%" height={24} className="title-skeleton" />
      <div className="metadata-row-skeleton">
        <Skeleton variant="text" width="80px" height={16} />
        <Skeleton variant="text" width="60px" height={16} />
        <Skeleton variant="text" width="100px" height={16} />
      </div>
      <div className="metadata-row-skeleton secondary">
        <Skeleton variant="text" width="120px" height={14} />
        <Skeleton variant="text" width="140px" height={14} />
      </div>
    </div>
    <div className="actions-skeleton">
      <Skeleton variant="rectangular" width={80} height={48} className="action-skeleton" />
      <Skeleton variant="rectangular" width={80} height={48} className="action-skeleton" />
      <Skeleton variant="rectangular" width={80} height={48} className="action-skeleton" />
      <Skeleton variant="rectangular" width={80} height={48} className="action-skeleton" />
    </div>
  </div>
)

export const NavigationSkeleton = () => (
  <div className="nav-skeleton">
    <Skeleton variant="rectangular" width={80} height={48} className="nav-btn-skeleton" />
    <Skeleton variant="rectangular" width={80} height={48} className="nav-btn-skeleton" />
    <Skeleton variant="rectangular" width={48} height={48} className="nav-btn-skeleton" />
    <Skeleton variant="rectangular" width={80} height={48} className="nav-btn-skeleton" />
    <Skeleton variant="rectangular" width={80} height={48} className="nav-btn-skeleton" />
  </div>
)