/**
 * Verification management for Wayfinder
 */

import type { VerificationStatus, VerificationEvent } from '../wayfinderTypes'
import { logger } from '../../utils/logger'

export class VerificationManager {
  private verificationStatuses = new Map<string, VerificationStatus>()
  private eventListeners = new Set<(event: VerificationEvent) => void>()

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
      case 'verification-started':
        this.setStatus(event.txId, {
          ...currentStatus,
          status: 'verifying',
        })
        break
        
      case 'verification-completed':
        logger.info(`Verification completed for ${event.txId}`)
        this.setStatus(event.txId, {
          ...currentStatus,
          status: 'verified',
          gateway: event.gateway,
          verificationMethod: 'hash',
        })
        break
        
      case 'verification-failed':
        this.setStatus(event.txId, {
          ...currentStatus,
          status: 'failed',
          error: event.error,
        })
        break
        
      case 'routing-succeeded':
        this.setStatus(event.txId, {
          ...currentStatus,
          gateway: event.gateway,
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
   * Clear all verification statuses
   */
  clear(): void {
    this.verificationStatuses.clear()
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