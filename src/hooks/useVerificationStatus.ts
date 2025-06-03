import { useState, useEffect } from 'preact/hooks'
import { wayfinderService } from '../services/wayfinder'
import type { VerificationStatus, VerificationEvent } from '../services/wayfinderTypes'

/**
 * Hook for tracking verification status of a specific transaction
 */
export function useVerificationStatus(txId: string | null): VerificationStatus {
  const [status, setStatus] = useState<VerificationStatus>({
    txId: txId || '',
    status: 'pending',
    timestamp: Date.now()
  })

  useEffect(() => {
    if (!txId) {
      setStatus({
        txId: '',
        status: 'pending',
        timestamp: Date.now()
      })
      return
    }

    // Get initial status
    const initialStatus = wayfinderService.getVerificationStatus(txId)
    setStatus(initialStatus)

    // Listen for verification events
    const handleVerificationEvent = (event: VerificationEvent) => {
      if (event.txId === txId) {
        const updatedStatus = wayfinderService.getVerificationStatus(txId)
        setStatus(updatedStatus)
      }
    }

    wayfinderService.addEventListener(handleVerificationEvent)

    return () => {
      wayfinderService.removeEventListener(handleVerificationEvent)
    }
  }, [txId])

  return status
}

/**
 * Hook for tracking overall Wayfinder service statistics
 */
export function useWayfinderStats() {
  const [stats, setStats] = useState(() => wayfinderService.getStats())

  useEffect(() => {
    const updateStats = () => {
      setStats(wayfinderService.getStats())
    }

    // Update stats when verification events occur
    const handleVerificationEvent = () => {
      updateStats()
    }

    wayfinderService.addEventListener(handleVerificationEvent)

    // Update stats periodically
    const interval = setInterval(updateStats, 5000) // Every 5 seconds

    return () => {
      wayfinderService.removeEventListener(handleVerificationEvent)
      clearInterval(interval)
    }
  }, [])

  return stats
}