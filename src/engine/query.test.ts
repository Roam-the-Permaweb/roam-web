import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCurrentBlockHeight, fetchTxMetaById } from './query'
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
})