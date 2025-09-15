/**
 * Verification management for Wayfinder
 */

import type { VerificationStatus, VerificationEvent } from '../wayfinderTypes'
import { logger } from '../../utils/logger'

export class VerificationManager {
  private verificationStatuses = new Map<string, VerificationStatus>()
  private eventListeners = new Set<(event: VerificationEvent) => void>()
  private verificationAttempts = new Map<string, number>()

  /**
   * Get verification status for a transaction
   */
  getStatus(txId: string): VerificationStatus {
    return (
      this.verificationStatuses.get(txId) || {
        txId,
        status: 'pending',
        timestamp: Date.now(),
      }
    )
  }

  /**
   * Set verification status for a transaction
   */
  setStatus(txId: string, status: VerificationStatus): void {
    const currentStatus = this.verificationStatuses.get(txId)
    
    // Only prevent changing from verified state (not failed, as we may want to retry)
    // Allow failed -> verifying transitions for retries
    if (currentStatus && 
        currentStatus.status === 'verified' &&
        status.status !== 'pending') {
      logger.debug(`Ignoring status change for ${txId}: ${currentStatus.status} -> ${status.status} (already verified)`)
      return
    }
    
    this.verificationStatuses.set(txId, status)
  }

  /**
   * Add event listener for verification events
   */
  addEventListener(listener: (event: VerificationEvent) => void): void {
    this.eventListeners.add(listener)
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: (event: VerificationEvent) => void): void {
    this.eventListeners.delete(listener)
  }

  /**
   * Handle verification events and notify listeners
   */
  handleEvent(event: VerificationEvent): void {
    const currentStatus = this.getStatus(event.txId)

    switch (event.type) {
      case 'routing-started':
        this.setStatus(event.txId, {
          ...currentStatus,
          status: 'verifying',
          progress: {
            processedBytes: 0,
            totalBytes: 0,
            percentage: 0,
            stage: 'routing'
          }
        })
        break
        
      case 'verification-started':
        this.setStatus(event.txId, {
          ...currentStatus,
          status: 'verifying',
          progress: currentStatus.progress || {
            processedBytes: 0,
            totalBytes: 0,
            percentage: 0,
            stage: 'downloading' // Keep in downloading until we get real progress
          }
        })
        break
        
      case 'verification-progress':
        if (event.progress) {
          logger.debug(`Verification progress: ${event.progress.percentage}% for ${event.txId}`)
          
          // Simply update the progress, no auto-completion
          // Wait for explicit verification-completed event from SDK
          this.setStatus(event.txId, {
            ...currentStatus,
            status: 'verifying',
            progress: event.progress
          })
        }
        break
        
      case 'verification-completed': {
        logger.info(`Verification completed for ${event.txId}`)
        this.setStatus(event.txId, {
          ...currentStatus,
          status: 'verified',
          gateway: event.gateway,
          verificationMethod: 'hash',
          progress: undefined // Clear progress on completion
        })
        break
      }
        
      case 'verification-failed':
        this.setStatus(event.txId, {
          ...currentStatus,
          status: 'failed',
          error: event.error,
          progress: undefined // Clear progress on failure
        })
        break
        
      case 'routing-succeeded':
        this.setStatus(event.txId, {
          ...currentStatus,
          gateway: event.gateway,
          progress: {
            processedBytes: 0,
            totalBytes: 0,
            percentage: 0, // Don't show fake progress
            stage: 'downloading'
          }
        })
        break
    }

    // Notify all listeners
    this.notifyListeners(event)
  }

  /**
   * Notify all registered listeners
   */
  private notifyListeners(event: VerificationEvent): void {
    this.eventListeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        logger.warn('Error in verification event listener:', error)
      }
    })
  }

  /**
   * Track verification attempt
   */
  incrementAttempts(txId: string): number {
    const current = this.verificationAttempts.get(txId) || 0
    const newCount = current + 1
    this.verificationAttempts.set(txId, newCount)
    return newCount
  }

  /**
   * Get verification attempts for a transaction
   */
  getAttempts(txId: string): number {
    return this.verificationAttempts.get(txId) || 0
  }

  /**
   * Reset verification attempts for a transaction
   */
  resetAttempts(txId: string): void {
    this.verificationAttempts.delete(txId)
  }

  /**
   * Clear all verification statuses
   */
  clear(): void {
    this.verificationStatuses.clear()
    this.verificationAttempts.clear()
  }

  /**
   * Get statistics
   */
  getStats() {
    const statuses = Array.from(this.verificationStatuses.values())
    const verified = statuses.filter((s) => s.status === 'verified').length
    const failed = statuses.filter((s) => s.status === 'failed').length
    const pending = statuses.filter((s) => s.status === 'pending').length
    const verifying = statuses.filter((s) => s.status === 'verifying').length

    return {
      total: statuses.length,
      verified,
      failed,
      pending,
      verifying,
      verificationRate: statuses.length > 0 ? (verified / statuses.length) * 100 : 0,
    }
  }
}