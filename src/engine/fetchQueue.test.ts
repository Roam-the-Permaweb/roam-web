import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initFetchQueue, clearSeenIds } from './fetchQueue'
import { mockTxMeta, resetMocks } from '../test/utils'
import type { Channel } from '../constants'

// Mock the query module
vi.mock('./query', () => ({
  getCurrentBlockHeight: vi.fn().mockResolvedValue(1500000),
  fetchTxsRange: vi.fn(),
  INITIAL_PAGE_LIMIT: 2,
  REFILL_PAGE_LIMIT: 1,
}))

import { fetchTxsRange } from './query'

describe('FetchQueue Engine', () => {
  beforeEach(() => {
    resetMocks()
    vi.clearAllMocks()
  })

  describe('initFetchQueue', () => {
    const mockChannel: Channel = {
      media: 'images',
      recency: 'new',
      ownerAddress: undefined,
      appName: undefined
    }

    it('should initialize queue with transactions', async () => {
      const mockResult = { txs: [mockTxMeta], hasMore: false }
      ;(fetchTxsRange as any).mockResolvedValue(mockResult)

      const result = await initFetchQueue(mockChannel)

      expect(result).toHaveProperty('min')
      expect(result).toHaveProperty('max')
      expect(fetchTxsRange).toHaveBeenCalled()
    })

    it('should handle deep link with initialTx and block range', async () => {
      const options = {
        initialTx: mockTxMeta,
        minBlock: 1000000,
        maxBlock: 1005000 // smaller range that fits in WINDOW_SIZE
      }

      ;(fetchTxsRange as any).mockResolvedValue({ txs: [mockTxMeta], hasMore: false })

      const result = await initFetchQueue(mockChannel, options)

      expect(result.min).toBe(1000000)
      expect(result.max).toBe(1005000)
    })

    it('should handle owner address filtering', async () => {
      const channelWithOwner: Channel = {
        ...mockChannel,
        ownerAddress: 'test-owner-address'
      }

      ;(fetchTxsRange as any).mockResolvedValue({ txs: [mockTxMeta], hasMore: false })

      await initFetchQueue(channelWithOwner)

      expect(fetchTxsRange).toHaveBeenCalledWith(
        'images',
        1,
        1500000,
        'test-owner-address',
        undefined,
        2, // INITIAL_PAGE_LIMIT
        false // isRefill
      )
    })

    it('should handle appName filtering', async () => {
      const options = {
        appName: 'TestApp'
      }

      ;(fetchTxsRange as any).mockResolvedValue({ txs: [mockTxMeta], hasMore: false })

      await initFetchQueue(mockChannel, options)

      // Check that fetchTxsRange was called with the app name
      expect(fetchTxsRange).toHaveBeenCalledWith(
        'images',
        expect.any(Number),
        expect.any(Number),
        undefined,
        'TestApp',
        2, // INITIAL_PAGE_LIMIT
        false // isRefill
      )
    })
  })

  describe('clearSeenIds', () => {
    it('should clear the seen IDs set', () => {
      // This is a simple function that clears internal state
      // We can't easily test the internal state, but we can verify it doesn't throw
      expect(() => clearSeenIds()).not.toThrow()
    })
  })
})