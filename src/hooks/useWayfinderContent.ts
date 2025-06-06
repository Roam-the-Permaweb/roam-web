import { useState, useEffect } from 'preact/hooks'
import { wayfinderService } from '../services/wayfinder'
import type { ContentRequest, ContentResponse, VerificationStatus } from '../services/wayfinderTypes'
import { logger } from '../utils/logger'

interface UseWayfinderContentResult {
  url: string | null
  gateway: string | null
  loading: boolean
  error: string | null
  verified: boolean
  verificationStatus: VerificationStatus
  isWayfinderEnabled: boolean
  data: Blob | null
  contentType: string | null
}

/**
 * Hook for fetching content URLs via Wayfinder with verification
 * Now supports size-aware loading and forced fetching
 */
export function useWayfinderContent(
  txId: string | null,
  path?: string,
  forceLoad?: boolean,
  contentType?: string,
  size?: number
): UseWayfinderContentResult {
  const [result, setResult] = useState<UseWayfinderContentResult>({
    url: null,
    gateway: null,
    loading: false,
    error: null,
    verified: false,
    verificationStatus: {
      txId: txId || '',
      status: 'pending',
      timestamp: Date.now()
    },
    isWayfinderEnabled: false,
    data: null,
    contentType: null,
  })

  useEffect(() => {
    if (!txId) {
      setResult(prev => ({
        ...prev,
        url: null,
        gateway: null,
        loading: false,
        error: null
      }))
      return
    }

    let cancelled = false
    let pollInterval: any = null

    // Register event listener BEFORE making the request to avoid race conditions
    const handleVerificationEvent = (event: any) => {
      if (event.txId === txId && !cancelled) {
        setResult(prev => ({
          ...prev,
          verified: event.type === 'verification-completed',
          verificationStatus: wayfinderService.getVerificationStatus(txId)
        }))
      }
    }

    // Add listener before starting fetch to catch all verification events
    wayfinderService.addEventListener(handleVerificationEvent)

    const fetchContent = async () => {
      try {
        setResult(prev => ({
          ...prev,
          loading: true,
          error: null
        }))

        // Check if Wayfinder is available
        const isWayfinderEnabled = await wayfinderService.isAvailable()

        // Prepare request with content type and size for size-aware loading
        const request: ContentRequest = {
          txId,
          path,
          contentType,
          size
        }

        // Get content URL - pass forceLoad flag for size-aware loading
        const response: ContentResponse = await wayfinderService.getContentUrl(request, forceLoad)

        if (cancelled) return

        // Get the most current verification status after the request
        const currentVerificationStatus = wayfinderService.getVerificationStatus(txId)
        const isCurrentlyVerified = currentVerificationStatus.status === 'verified'

        setResult(prev => ({
          ...prev,
          url: response.url,
          gateway: response.gateway,
          loading: false,
          verified: isCurrentlyVerified, // Use current status instead of response.verified
          verificationStatus: currentVerificationStatus, // Use current status
          isWayfinderEnabled,
          data: response.data,
          contentType: response.contentType
        }))

        // Add verification status polling for missed events
        if (currentVerificationStatus.status === 'verifying' || currentVerificationStatus.status === 'pending') {
          let pollCount = 0
          const maxPolls = 10 // Poll up to 10 times
          
          pollInterval = setInterval(() => {
            if (cancelled) {
              clearInterval(pollInterval)
              return
            }
            
            pollCount++
            const latestStatus = wayfinderService.getVerificationStatus(txId)
            
            // Update if status changed
            setResult(prev => {
              if (latestStatus.status !== prev.verificationStatus.status || 
                  (latestStatus.status === 'verified' && !prev.verified)) {
                return {
                  ...prev,
                  verified: latestStatus.status === 'verified',
                  verificationStatus: latestStatus
                }
              }
              return prev
            })
            
            // Stop polling if verified, failed, or max polls reached
            if (latestStatus.status === 'verified' || 
                latestStatus.status === 'failed' || 
                pollCount >= maxPolls) {
              clearInterval(pollInterval)
              pollInterval = null
            }
          }, 1000) // Poll every second
        }

      } catch (error) {
        if (cancelled) return

        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error('useWayfinderContent error:', error)

        setResult(prev => ({
          ...prev,
          loading: false,
          error: errorMessage,
          verificationStatus: {
            txId,
            status: 'failed',
            error: errorMessage,
            timestamp: Date.now()
          }
        }))
      }
    }

    fetchContent()

    return () => {
      cancelled = true
      wayfinderService.removeEventListener(handleVerificationEvent)
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
      }
    }
  }, [txId, path, forceLoad]) // Removed contentType and size to prevent unnecessary re-requests

  return result
}