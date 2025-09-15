import { vi } from 'vitest'
import type { TxMeta } from '../constants'

// Mock transaction data for tests
export const mockTxMeta: TxMeta = {
  id: 'test-tx-id-123',
  owner: { address: 'test-owner-address' },
  fee: { ar: '0.001' },
  quantity: { ar: '0' },
  tags: [
    { name: 'Content-Type', value: 'image/png' },
    { name: 'App-Name', value: 'TestApp' }
  ],
  data: { size: 1024 },
  block: { height: 1000000, timestamp: 1640995200 },
}

export const mockArfsTxMeta: TxMeta = {
  ...mockTxMeta,
  id: 'arfs-tx-id-456',
  tags: [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'Entity-Type', value: 'file' }
  ],
  arfsMeta: {
    dataTxId: 'data-tx-id-789',
    name: 'test-file.jpg',
    size: 2048,
    contentType: 'image/jpeg',
    customTags: {}
  }
}

// Mock fetch responses
export const mockFetchResponse = (data: any, ok = true, status = 200) => {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    blob: () => Promise.resolve(new Blob([JSON.stringify(data)])),
  } as Response)
}

// Mock GraphQL response
export const mockGraphQLResponse = (transactions: TxMeta[] = [mockTxMeta]) => {
  return {
    transactions: {
      edges: transactions.map(tx => ({ node: tx })),
      pageInfo: {
        hasNextPage: false,
        endCursor: null
      }
    }
  }
}

// Reset all mocks between tests
export const resetMocks = () => {
  vi.clearAllMocks()
  
  // Reset localStorage mock
  const localStorage = window.localStorage as any
  localStorage.getItem.mockReturnValue(null)
  localStorage.setItem.mockImplementation(() => {})
  localStorage.removeItem.mockImplementation(() => {})
  localStorage.clear.mockImplementation(() => {})
  
  // Reset fetch mock
  const fetch = global.fetch as any
  if (fetch && typeof fetch.mockResolvedValue === 'function') {
    fetch.mockResolvedValue(mockFetchResponse({}))
  }
  
  // Reset window.location
  window.location.search = ''
  window.location.pathname = '/'
  window.location.hash = ''
}