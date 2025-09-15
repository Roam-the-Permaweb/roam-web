import { useState, useEffect } from 'preact/hooks'
import { estimateDateFromBlock, getDateRangeForBlockRange, getCurrentBlockInfo } from '../utils/dateBlockUtils'
import '../styles/block-height-picker.css'

interface BlockHeightPickerProps {
  tempRange: { from: number; to: number }
  setTempRange: (range: { from: number; to: number }) => void
  onBlockRangeEstimated: (range: { from: number; to: number }) => void
  isLoading: boolean
  actualBlocks?: { from: number; to: number }
  rangeError: string | null
  queueLoading: boolean
  onResetRange: () => void
  onApplyRange: () => void
}

export function BlockHeightPicker({
  tempRange,
  setTempRange,
  onBlockRangeEstimated,
  isLoading,
  actualBlocks,
  rangeError,
  queueLoading,
  onResetRange,
  onApplyRange
}: BlockHeightPickerProps) {
  const [fromInput, setFromInput] = useState(tempRange.from.toLocaleString())
  const [toInput, setToInput] = useState(tempRange.to.toLocaleString())
  const [fromDate, setFromDate] = useState<Date | null>(null)
  const [toDate, setToDate] = useState<Date | null>(null)
  const [estimatedFromDate, setEstimatedFromDate] = useState<Date | null>(null)
  const [estimatedToDate, setEstimatedToDate] = useState<Date | null>(null)
  const [currentBlock, setCurrentBlock] = useState<number | null>(null)
  const [inputError, setInputError] = useState<string | null>(null)

  // Update input fields when tempRange changes externally (e.g., from range expansion)
  useEffect(() => {
    setFromInput(tempRange.from.toLocaleString())
    setToInput(tempRange.to.toLocaleString())
  }, [tempRange.from, tempRange.to])

  // Fetch current block height on mount and set initial estimates
  useEffect(() => {
    getCurrentBlockInfo().then((info: { block: number; timestamp: number }) => {
      setCurrentBlock(info.block)
    }).catch(() => {
      // Fallback handled internally
    })
    
    // Set initial estimated dates immediately
    const setInitialEstimates = async () => {
      try {
        const fromEst = await estimateDateFromBlock(tempRange.from)
        const toEst = await estimateDateFromBlock(tempRange.to)
        setEstimatedFromDate(fromEst)
        setEstimatedToDate(toEst)
      } catch (_error) {
        // Silent fail
      }
    }
    setInitialEstimates()
  }, [])

  // Fetch actual dates for the current block range with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      try {
        const fromBlockNum = parseInt(fromInput.replace(/,/g, ''))
        const toBlockNum = parseInt(toInput.replace(/,/g, ''))
        
        if (!isNaN(fromBlockNum) && !isNaN(toBlockNum) && fromBlockNum > 0 && toBlockNum > 0) {
          // Fetch actual dates from blockchain
          const dateRange = await getDateRangeForBlockRange(fromBlockNum, toBlockNum)
          
          if (dateRange) {
            // Use exact dates from block data
            setFromDate(dateRange.startDate)
            setToDate(dateRange.endDate)
          } else {
            // Only estimate if GraphQL fetch fails (network issues, etc)
            const [fromEst, toEst] = await Promise.all([
              estimateDateFromBlock(fromBlockNum),
              estimateDateFromBlock(toBlockNum)
            ])
            setFromDate(fromEst)
            setToDate(toEst)
          }
        }
      } catch (_error) {
        // Try fallback estimation on error
        try {
          const fromBlockNum = parseInt(fromInput.replace(/,/g, ''))
          const toBlockNum = parseInt(toInput.replace(/,/g, ''))
          
          if (!isNaN(fromBlockNum) && !isNaN(toBlockNum)) {
            const [fromEst, toEst] = await Promise.all([
              estimateDateFromBlock(fromBlockNum),
              estimateDateFromBlock(toBlockNum)
            ])
            setFromDate(fromEst)
            setToDate(toEst)
          }
        } catch (_error) {
          // Silent fail, dates just won't show
        }
      } finally {
        // Cleanup handled by effect
      }
    }, 200) // 200ms debounce - reduced since we show estimates immediately
    
    return () => clearTimeout(timeoutId)
  }, [fromInput, toInput])

  const handleFromChange = (value: string) => {
    setFromInput(value)
    setInputError(null)
    
    // Parse and validate
    const num = parseInt(value.replace(/,/g, ''))
    if (!isNaN(num) && num >= 0) {
      const newRange = { from: num, to: tempRange.to }
      setTempRange(newRange)
      onBlockRangeEstimated(newRange)
      
      // Immediate estimation for quick feedback
      estimateDateFromBlock(num).then(setEstimatedFromDate).catch(() => {})
    }
  }

  const handleToChange = (value: string) => {
    setToInput(value)
    setInputError(null)
    
    // Parse and validate
    const num = parseInt(value.replace(/,/g, ''))
    if (!isNaN(num) && num >= 0) {
      const newRange = { from: tempRange.from, to: num }
      setTempRange(newRange)
      onBlockRangeEstimated(newRange)
      
      // Immediate estimation for quick feedback
      estimateDateFromBlock(num).then(setEstimatedToDate).catch(() => {})
    }
  }

  const handleApply = () => {
    // Validate range
    const fromNum = parseInt(fromInput.replace(/,/g, ''))
    const toNum = parseInt(toInput.replace(/,/g, ''))
    
    if (isNaN(fromNum) || isNaN(toNum)) {
      setInputError('Please enter valid block numbers')
      return
    }
    
    if (fromNum < 0 || toNum < 0) {
      setInputError('Block numbers must be positive')
      return
    }
    
    if (fromNum > toNum) {
      setInputError('From block must be less than or equal to To block')
      return
    }
    
    if (currentBlock && toNum > currentBlock) {
      setInputError(`To block cannot exceed current block (${currentBlock.toLocaleString()})`)
      return
    }
    
    setInputError(null)
    onApplyRange()
  }

  const formatBlockInput = (value: string): string => {
    // Remove non-numeric characters
    const cleaned = value.replace(/[^0-9]/g, '')
    // Add commas for thousands
    return cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const handleInputBlur = (type: 'from' | 'to') => {
    if (type === 'from') {
      setFromInput(formatBlockInput(fromInput))
    } else {
      setToInput(formatBlockInput(toInput))
    }
  }

  // Use actual blocks if syncing
  useEffect(() => {
    if (actualBlocks) {
      setFromInput(actualBlocks.from.toLocaleString())
      setToInput(actualBlocks.to.toLocaleString())
    }
  }, [actualBlocks])

  return (
    <div className="block-height-picker">
      <div className="block-inputs">
        <div className="block-input-wrapper horizontal">
          <label htmlFor="from-block" className="block-input-label">From</label>
          <input
            id="from-block"
            type="text"
            className="block-input"
            value={fromInput}
            onChange={(e) => handleFromChange(e.currentTarget.value)}
            onBlur={() => handleInputBlur('from')}
            placeholder="0"
            disabled={isLoading}
          />
        </div>
        
        <div className="block-input-wrapper horizontal">
          <label htmlFor="to-block" className="block-input-label">To</label>
          <input
            id="to-block"
            type="text"
            className="block-input"
            value={toInput}
            onChange={(e) => handleToChange(e.currentTarget.value)}
            onBlur={() => handleInputBlur('to')}
            placeholder={currentBlock?.toLocaleString() || 'Current'}
            disabled={isLoading}
          />
        </div>
      </div>

      {((fromDate && toDate) || (estimatedFromDate && estimatedToDate)) && (
        <div className="block-range-info">
          <div className="block-range-label">
            {fromDate && toDate ? 'Date Range' : 'Estimated Date Range'}
          </div>
          <div className="block-range-value">
            {(fromDate || estimatedFromDate)?.toLocaleDateString(undefined, { 
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })} – {(toDate || estimatedToDate)?.toLocaleDateString(undefined, { 
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })}
          </div>
        </div>
      )}

      {(rangeError || inputError) && (
        <div className="error-message">{rangeError || inputError}</div>
      )}

      {isLoading && (
        <div className="loading-message">⏳ Validating block range...</div>
      )}

      <div className="date-range-actions">
        <button 
          className="date-action-btn secondary" 
          onClick={onResetRange}
          disabled={isLoading || queueLoading}
        >
          Cancel
        </button>
        <button
          className="date-action-btn primary"
          onClick={handleApply}
          disabled={isLoading || queueLoading || !!(rangeError || inputError)}
        >
          {queueLoading ? 'Loading…' : isLoading ? 'Resolving…' : 'Apply'}
        </button>
      </div>
    </div>
  )
}