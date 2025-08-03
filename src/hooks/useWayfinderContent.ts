import { useState, useEffect, useRef } from 'preact/hooks'
import { wayfinderService } from '../services/wayfinder'
import type { ContentRequest, ContentResponse, VerificationStatus } from '../services/wayfinderTypes'
import { logger } from '../utils/logger'

interface UseWayfinderContentResult {
  url: string | null
  gateway: string | null
  loading: boolean
  error: string | null
  errorDetails?: { message: string; attemptedGateways?: string[] }
  verified: boolean
  verificationStatus: VerificationStatus
  isWayfinderEnabled: boolean
  data: Blob | null
  contentType: string | null
}

/**
 * Hook for fetching content URLs via Wayfinder with verification
 * Now supports size-aware loading and forced fetching
 * Supports both transaction IDs and full URLs (for ArNS content)
 */
export function useWayfinderContent(
  contentId: string | null, // Can be txId or full URL for ArNS
  path?: string,
  forceLoad?: boolean,
  contentType?: string,
  size?: number,
  preferredGateway?: string,
  retryCount?: number
): UseWayfinderContentResult {
  const [result, setResult] = useState<UseWayfinderContentResult>({
    url: null,
    gateway: null,
    loading: false,
    error: null,
    verified: false,
    verificationStatus: {
      txId: contentId || '',
      status: 'pending',
      timestamp: Date.now()
    },
    isWayfinderEnabled: false,
    data: null,
    contentType: null,
  })

  // Use ref to track current contentId for event handler
  const contentIdRef = useRef(contentId)
  contentIdRef.current = contentId

  useEffect(() => {
    if (!contentId) {
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
    let pollInterval: number | null = null

    // Register event listener BEFORE making the request to avoid race conditions
    const handleVerificationEvent = (event: { txId: string; type: string; status?: string }) => {
      // Use ref to get current contentId, not the one from closure
      if (event.txId === contentIdRef.current && !cancelled) {
        setResult(prev => ({
          ...prev,
          verified: event.type === 'verification-completed',
          verificationStatus: wayfinderService.getVerificationStatus(contentIdRef.current || '')
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

        // Check cache first for immediate response
        const cached = wayfinderService.getCachedContent(contentId, path)
        if (cached) {
          logger.info('[Content Loading] Using cached content', { 
            contentId: contentId.startsWith('http') ? contentId : `txId: ${contentId}`,
            fromCache: true 
          })
          setResult(prev => ({
            ...prev,
            url: cached.url,
            gateway: cached.gateway,
            loading: false,
            verified: cached.verified,
            verificationStatus: cached.verificationStatus,
            isWayfinderEnabled: true,
            data: cached.data,
            contentType: cached.contentType,
          }))
          return
        }

        // Check if Wayfinder is available
        const isWayfinderEnabled = await wayfinderService.isAvailable()

        // Prepare request with content type and size for size-aware loading
        const request: ContentRequest = {
          txId: contentId, // This can now be a URL or txId
          path,
          contentType,
          size,
          preferredGateway
        }

        // Get content URL - pass forceLoad flag for size-aware loading
        const startTime = Date.now()
        const response: ContentResponse = await wayfinderService.getContentUrl(request, forceLoad)
        const duration = Date.now() - startTime
        
        logger.info('[Content Loading] Successfully loaded content', {
          contentId: contentId.startsWith('http') ? contentId : `txId: ${contentId}`,
          duration: `${duration}ms`,
          gateway: response.gateway,
          verified: response.verified,
          fromCache: response.fromCache,
          contentType: response.contentType
        })

        if (cancelled) return

        // Get the most current verification status after the request
        const currentVerificationStatus = wayfinderService.getVerificationStatus(contentId)
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

        // Hybrid approach: Single fallback check after 5 seconds for missed events
        if (currentVerificationStatus.status === 'verifying' || currentVerificationStatus.status === 'pending') {
          pollInterval = window.setTimeout(() => {
            if (cancelled) return
            
            const latestStatus = wayfinderService.getVerificationStatus(contentId)
            
            // Update only if status changed from verifying/pending
            if (latestStatus.status !== 'verifying' && latestStatus.status !== 'pending') {
              setResult(prev => ({
                ...prev,
                verified: latestStatus.status === 'verified',
                verificationStatus: latestStatus
              }))
            }
          }, 5000) // Single check after 5 seconds
        }

      } catch (error) {
        if (cancelled) return

        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const errorDetails = (error as any)?.attemptedGateways ? {
          message: errorMessage,
          attemptedGateways: (error as any).attemptedGateways
        } : undefined
        
        logger.error('content.fetch.error', {
          contentId,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          attemptedGateways: errorDetails?.attemptedGateways
        })

        setResult(prev => ({
          ...prev,
          loading: false,
          error: errorMessage,
          errorDetails,
          verificationStatus: {
            txId: contentId,
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
        clearTimeout(pollInterval)
        pollInterval = null
      }
    }
  }, [contentId, path, forceLoad, preferredGateway, retryCount]) // Include retryCount to force refetch

  return result
}