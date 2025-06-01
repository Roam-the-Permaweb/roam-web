interface LoadingScreenProps {
  message?: string
}

export function LoadingScreen({ message = "Loading…" }: LoadingScreenProps) {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        <div className="loading-text">{message}</div>
        <div className="loading-subtitle">Discovering content from the Permaweb</div>
      </div>
    </div>
  )
}