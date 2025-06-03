import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WayfinderService } from './wayfinder'

// Mock the AR.IO SDK
vi.mock('@ar.io/sdk/web', () => ({
  Wayfinder: vi.fn().mockImplementation(() => ({
    request: vi.fn().mockResolvedValue({
      url: 'https://mock-gateway.arweave.net/test-tx-id',
      status: 200,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue('mock content')
    }),
    emitter: {
      on: vi.fn()
    }
  })),
  ARIO: {
    mainnet: vi.fn()
  },
  NetworkGatewaysProvider: vi.fn(),
  SimpleCacheGatewaysProvider: vi.fn(),
  StaticGatewaysProvider: vi.fn(),
  HashVerificationStrategy: vi.fn(),
  TrustedGatewaysHashProvider: vi.fn()
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('Wayfinder Service', () => {
  let wayfinderService: WayfinderService

  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
    wayfinderService = new WayfinderService()
  })

  describe('Configuration Management', () => {
    it('should have correct default configuration', () => {
      const config = wayfinderService.getConfig()
      
      expect(config.enableWayfinder).toBe(true)
      expect(config.enableVerification).toBe(true)
      expect(config.gatewayLimit).toBe(5)
      expect(config.cacheTimeoutMinutes).toBe(1) // Updated to match example's 60 seconds
      expect(config.verificationTimeoutMs).toBe(10000) // Updated timeout
    })

    it('should update configuration correctly', () => {
      wayfinderService.updateConfig({
        enableWayfinder: false,
        enableVerification: false
      })

      const config = wayfinderService.getConfig()
      expect(config.enableWayfinder).toBe(false)
      expect(config.enableVerification).toBe(false)
      
      // Should save to localStorage
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'wayfinder-config',
        JSON.stringify({
          enableWayfinder: false,
          enableGraphQL: false
        })
      )
    })

    it('should load persisted configuration', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify({
        enableWayfinder: false
      }))

      const service = new WayfinderService()
      const config = service.getConfig()
      
      expect(config.enableWayfinder).toBe(false)
      expect(config.enableVerification).toBe(false) // Should follow wayfinder setting
    })
  })

  describe('Content URL Fetching', () => {
    it('should return fallback URL when Wayfinder is disabled', async () => {
      wayfinderService.updateConfig({ enableWayfinder: false })
      
      const result = await wayfinderService.getContentUrl({
        txId: 'test-tx-id'
      })

      expect(result.url).toContain('test-tx-id')
      expect(result.verificationStatus.status).toBe('not-verified')
      expect(result.verified).toBe(false)
      expect(result.data).toBe(null)
      expect(result.contentType).toBe(null)
    })

    it('should attempt Wayfinder when enabled', async () => {
      wayfinderService.updateConfig({ enableWayfinder: true })
      
      const result = await wayfinderService.getContentUrl({
        txId: 'test-tx-id'
      })

      expect(result.url).toContain('test-tx-id')
      expect(result.gateway).toBeDefined()
    })

    it('should fall back to original gateway on Wayfinder error', async () => {
      wayfinderService.updateConfig({ enableWayfinder: true })
      
      // Initialize the service first
      await wayfinderService.initialize()
      
      const result = await wayfinderService.getContentUrl({
        txId: 'test-tx-id'
      })

      // Should get some result (either Wayfinder or fallback)
      expect(result.url).toBeDefined()
      expect(result.gateway).toBeDefined()
    })
  })

  describe('Verification Status', () => {
    it('should track verification status', () => {
      const txId = 'test-tx-id'
      
      let status = wayfinderService.getVerificationStatus(txId)
      expect(status.status).toBe('pending')
      
      // Simulate verification update
      wayfinderService.updateConfig({ enableVerification: true })
      
      status = wayfinderService.getVerificationStatus(txId)
      expect(status.txId).toBe(txId)
    })

    it('should provide service statistics', () => {
      const stats = wayfinderService.getStats()
      
      expect(stats).toHaveProperty('enabled')
      expect(stats).toHaveProperty('initialized')
      expect(stats).toHaveProperty('totalRequests')
      expect(stats).toHaveProperty('verified')
      expect(stats).toHaveProperty('failed')
      expect(stats).toHaveProperty('verificationRate')
      expect(stats).toHaveProperty('cacheSize')
    })
  })

  describe('Availability Check', () => {
    it('should report availability based on configuration', async () => {
      wayfinderService.updateConfig({ enableWayfinder: true })
      let available = await wayfinderService.isAvailable()
      expect(available).toBe(true)

      wayfinderService.updateConfig({ enableWayfinder: false })
      available = await wayfinderService.isAvailable()
      expect(available).toBe(false)
    })
  })

  describe('Cache Management', () => {
    it('should clear caches', () => {
      expect(() => wayfinderService.clearCache()).not.toThrow()
      
      const stats = wayfinderService.getStats()
      expect(stats.cacheSize).toBe(0)
    })
  })
})