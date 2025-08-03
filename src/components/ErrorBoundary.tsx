import { Component } from 'preact'
import type { ComponentChildren } from 'preact'
import { logger } from '../utils/logger'

interface ErrorBoundaryProps {
  children: ComponentChildren
  fallback?: (error: Error, resetError: () => void) => ComponentChildren
  onError?: (error: Error, errorInfo: { componentStack: string }) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    // Log the error to console and any error reporting service
    logger.error('ErrorBoundary caught an error:', error)
    
    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // You can render any custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError)
      }

      // Default fallback UI
      return (
        <div class="error-boundary-fallback">
          <div class="error-container">
            <h2>Oops! Something went wrong</h2>
            <p>We're sorry for the inconvenience. Please try refreshing the page.</p>
            <details class="error-details">
              <summary>Error details</summary>
              <pre>{this.state.error.message}</pre>
            </details>
            <button 
              class="error-reset-button"
              onClick={this.resetError}
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Convenience component for MediaView-specific error handling
export function MediaViewErrorBoundary({ 
  children, 
  onError 
}: { 
  children: ComponentChildren
  onError?: () => void 
}) {
  return (
    <ErrorBoundary
      onError={onError}
      fallback={(_error, resetError) => (
        <div class="media-error-fallback">
          <div class="media-error-content">
            <p>Failed to load content</p>
            <button 
              class="media-error-retry"
              onClick={resetError}
            >
              Retry
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}