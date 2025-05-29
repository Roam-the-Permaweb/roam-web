import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addHistory, goBack, goForward, peekForward, resetHistory } from './history'
import { mockTxMeta, resetMocks } from '../test/utils'

// Mock idb-keyval
vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
}))

import { get, set } from 'idb-keyval'

describe('History Engine', () => {
  beforeEach(() => {
    resetMocks()
    vi.clearAllMocks()
  })

  describe('resetHistory', () => {
    it('should reset history to empty state', async () => {
      await resetHistory()
      
      expect(set).toHaveBeenCalledWith('roam-history', { index: -1, items: [] })
    })
  })

  describe('addHistory', () => {
    it('should add transaction to history', async () => {
      const mockHistory = { index: -1, items: [] }
      ;(get as any).mockResolvedValue(mockHistory)

      await addHistory(mockTxMeta)

      expect(set).toHaveBeenCalledWith('roam-history', {
        index: 0,
        items: [mockTxMeta]
      })
    })

    it('should truncate forward history when adding new item', async () => {
      const existingTx = { ...mockTxMeta, id: 'existing-tx' }
      const mockHistory = { 
        index: 0, 
        items: [existingTx, { ...mockTxMeta, id: 'forward-tx' }] 
      }
      ;(get as any).mockResolvedValue(mockHistory)

      await addHistory(mockTxMeta)

      expect(set).toHaveBeenCalledWith('roam-history', {
        index: 1,
        items: [existingTx, mockTxMeta]
      })
    })
  })

  describe('goBack', () => {
    it('should return previous transaction', async () => {
      const prevTx = { ...mockTxMeta, id: 'prev-tx' }
      const mockHistory = { 
        index: 1, 
        items: [prevTx, mockTxMeta] 
      }
      ;(get as any).mockResolvedValue(mockHistory)

      const result = await goBack()

      expect(result).toEqual(prevTx)
      expect(set).toHaveBeenCalledWith('roam-history', {
        index: 0,
        items: [prevTx, mockTxMeta]
      })
    })

    it('should return undefined when at beginning of history', async () => {
      const mockHistory = { index: 0, items: [mockTxMeta] }
      ;(get as any).mockResolvedValue(mockHistory)

      const result = await goBack()

      expect(result).toBeUndefined()
    })
  })

  describe('goForward', () => {
    it('should return next transaction', async () => {
      const nextTx = { ...mockTxMeta, id: 'next-tx' }
      const mockHistory = { 
        index: 0, 
        items: [mockTxMeta, nextTx] 
      }
      ;(get as any).mockResolvedValue(mockHistory)

      const result = await goForward()

      expect(result).toEqual(nextTx)
      expect(set).toHaveBeenCalledWith('roam-history', {
        index: 1,
        items: [mockTxMeta, nextTx]
      })
    })

    it('should return undefined when at end of history', async () => {
      const mockHistory = { index: 0, items: [mockTxMeta] }
      ;(get as any).mockResolvedValue(mockHistory)

      const result = await goForward()

      expect(result).toBeUndefined()
    })
  })

  describe('peekForward', () => {
    it('should return next transaction without changing index', async () => {
      const nextTx = { ...mockTxMeta, id: 'next-tx' }
      const mockHistory = { 
        index: 0, 
        items: [mockTxMeta, nextTx] 
      }
      ;(get as any).mockResolvedValue(mockHistory)

      const result = await peekForward()

      expect(result).toEqual(nextTx)
      expect(set).not.toHaveBeenCalled()
    })

    it('should return undefined when no forward history', async () => {
      const mockHistory = { index: 0, items: [mockTxMeta] }
      ;(get as any).mockResolvedValue(mockHistory)

      const result = await peekForward()

      expect(result).toBeUndefined()
    })
  })
})