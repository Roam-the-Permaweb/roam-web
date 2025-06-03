// TypeScript interfaces for Wayfinder integration

export interface VerificationStatus {
  txId: string
  status: 'pending' | 'verifying' | 'verified' | 'failed' | 'not-verified'
  gateway?: string
  verificationMethod?: string
  error?: string
  timestamp: number
}

export interface WayfinderConfig {
  enableVerification: boolean
  enableWayfinder: boolean
  gatewayLimit: number
  cacheTimeoutMinutes: number
  verificationTimeoutMs: number
  fallbackGateways: string[]
}

export interface ContentRequest {
  txId: string
  path?: string
  headers?: Record<string, string>
  contentType?: string  // For size-aware loading decisions
  size?: number        // File size for threshold checking
}

export interface ContentResponse {
  url: string
  gateway: string
  data: Blob | null
  contentType: string | null,
  verified: boolean
  verificationStatus: VerificationStatus
  fromCache?: boolean
}

export interface CachedContent {
  data: Blob
  contentType: string
  url: string
  gateway: string
  verified: boolean
  verificationStatus: VerificationStatus
  timestamp: number
  size: number
}

export type VerificationEventType = 
  | 'verification-started'
  | 'verification-progress' 
  | 'verification-completed'
  | 'verification-failed'
  | 'routing-succeeded'
  | 'routing-failed'

export interface VerificationEvent {
  type: VerificationEventType
  txId: string
  gateway?: string
  progress?: number
  error?: string
  timestamp: number
}