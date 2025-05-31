import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCurrentBlockHeight, fetchTxMetaById, fetchTxsRange } from './query'
import { mockFetchResponse, resetMocks } from '../test/utils'

describe('Query Engine', () => {
  beforeEach(() => {
    resetMocks()
  })

  describe('getCurrentBlockHeight', () => {
    it('should return block height from gateway info', async () => {
      const mockResponse = { height: 1500000 }
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(mockResponse))

      const height = await getCurrentBlockHeight('https://arweave.net')
      
      expect(height).toBe(1500000)
      expect(global.fetch).toHaveBeenCalledWith('https://arweave.net/info')
    })

    it('should return default height when gateway fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const height = await getCurrentBlockHeight('https://arweave.net')
      
      expect(height).toBe(1666042) // DEFAULT_HEIGHT from query.ts
    })

    it('should return default height when response is invalid', async () => {
      const mockResponse = { invalid: 'response' }
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(mockResponse))

      const height = await getCurrentBlockHeight('https://arweave.net')
      
      expect(height).toBe(1666042)
    })
  })

  describe('fetchTxMetaById', () => {
    it('should fetch transaction metadata by ID', async () => {
      const mockTx = {
        id: 'test-tx-id',
        owner: { address: 'test-address' },
        tags: [{ name: 'Content-Type', value: 'image/png' }],
        block: { height: 1000000, timestamp: 1640995200 }
      }

      const mockGraphQLResponse = {
        data: {
          transactions: {
            edges: [{ node: mockTx }]
          }
        }
      }

      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(mockGraphQLResponse))

      const result = await fetchTxMetaById('test-tx-id')
      
      expect(result).toEqual(mockTx)
    })

    it('should throw error when transaction not found', async () => {
      const mockGraphQLResponse = {
        data: {
          transactions: {
            edges: []
          }
        }
      }

      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(mockGraphQLResponse))

      await expect(fetchTxMetaById('nonexistent-tx')).rejects.toThrow('All gateways failed – unable to fetch tx by ID')
    })

    it('should handle GraphQL errors', async () => {
      const mockErrorResponse = {
        errors: [{ message: 'Invalid query' }]
      }

      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(mockErrorResponse))

      await expect(fetchTxMetaById('test-tx-id')).rejects.toThrow('All gateways failed – unable to fetch tx by ID')
    }, { timeout: 10000 })
  })

  describe('fetchTxsRange', () => {
    it('should fetch transactions with progressive pagination', async () => {
      const mockTx1 = {
        id: 'tx-1',
        owner: { address: 'test-address' },
        tags: [{ name: 'Content-Type', value: 'image/png' }],
        block: { height: 1000000, timestamp: 1640995200 }
      }
      const mockTx2 = {
        id: 'tx-2',
        owner: { address: 'test-address' },
        tags: [{ name: 'Content-Type', value: 'image/png' }],
        block: { height: 1000001, timestamp: 1640995300 }
      }

      const mockGraphQLResponse = {
        data: {
          transactions: {
            edges: [
              { node: mockTx1, cursor: 'cursor-1' },
              { node: mockTx2, cursor: 'cursor-2' }
            ],
            pageInfo: {
              hasNextPage: false
            }
          }
        }
      }

      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(mockGraphQLResponse))

      const result = await fetchTxsRange('images', 1000000, 1000010, undefined, undefined, 1, false)
      
      expect(result.txs).toHaveLength(2)
      expect(result.txs[0].id).toBe('tx-1')
      expect(result.txs[1].id).toBe('tx-2')
      expect(result.hasMore).toBe(false)
    })

    it('should respect page limits', async () => {
      const mockTx = {
        id: 'tx-1',
        owner: { address: 'test-address' },
        tags: [{ name: 'Content-Type', value: 'image/png' }],
        block: { height: 1000000, timestamp: 1640995200 }
      }

      const mockGraphQLResponse = {
        data: {
          transactions: {
            edges: [{ node: mockTx, cursor: 'cursor-1' }],
            pageInfo: {
              hasNextPage: true
            }
          }
        }
      }

      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(mockGraphQLResponse))

      const result = await fetchTxsRange('images', 1000000, 1000010, undefined, undefined, 1, false)
      
      expect(result.txs).toHaveLength(1)
      expect(result.hasMore).toBe(true)
      expect(global.fetch).toHaveBeenCalledTimes(1) // Should only call once due to page limit
    })

    it('should handle refill operations with stored cursors', async () => {
      const mockTx = {
        id: 'tx-refill',
        owner: { address: 'test-address' },
        tags: [{ name: 'Content-Type', value: 'image/png' }],
        block: { height: 1000000, timestamp: 1640995200 }
      }

      const mockGraphQLResponse = {
        data: {
          transactions: {
            edges: [{ node: mockTx, cursor: 'cursor-refill' }],
            pageInfo: {
              hasNextPage: false
            }
          }
        }
      }

      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(mockGraphQLResponse))

      // First call to store a cursor
      await fetchTxsRange('images', 1000000, 1000010, undefined, undefined, 1, false)
      
      // Reset fetch mock to verify refill behavior
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(mockGraphQLResponse))
      
      // Second call as refill should use stored cursor (though we can't easily test the cursor usage without mocking the storage)
      const result = await fetchTxsRange('images', 1000000, 1000010, undefined, undefined, 1, true)
      
      expect(result.txs).toHaveLength(1)
      expect(result.txs[0].id).toBe('tx-refill')
    })
  })
})