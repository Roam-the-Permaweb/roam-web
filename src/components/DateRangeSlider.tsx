/**
 * DateRangeSlider - Advanced Date-Based Content Filtering
 * 
 * Allows users to filter Arweave content by date ranges with intelligent block conversion:
 * 
 * Core Functionality:
 * - Visual date range selection with calendar inputs
 * - Real-time block height estimation and conversion
 * - Binary search integration for precise date-to-block mapping
 * - Validation against Arweave blockchain history (Genesis: June 2018)
 * 
 * Smart Features:
 * - Prevents invalid date ranges (future dates, pre-Arweave dates)
 * - Real-time block estimation with sync indicators
 * - Graceful error handling and user feedback
 * - Integration with main content discovery queue
 * 
 * Technical Implementation:
 * - Uses dateBlockUtils for high-precision block/timestamp conversion
 * - Caches binary search results for performance
 * - Supports both estimation (fast) and exact search (precise) modes
 * - Handles edge cases like network failures and invalid ranges
 * 
 * User Experience:
 * - Clean Apple-inspired interface with smooth transitions  
 * - Loading states and progress indicators
 * - Clear validation messages and helpful constraints
 * - Reset and apply actions with proper state management
 */
import { useRef, useEffect, useState } from 'preact/hooks'
import { estimateBlockForTimestampSync, isValidArweaveDate } from '../utils/dateBlockUtils'
import { Icons } from './Icons'

type DateRange = { start: Date; end: Date }

type Props = {
  tempRange: DateRange
  setTempRange: (r: DateRange) => void
  onBlockRangeEstimated?: (minBlock: number, maxBlock: number) => void
  isLoading?: boolean
  actualBlocks?: { min: number; max: number } // When syncing with known blocks, skip estimation
  rangeError?: string | null
  queueLoading?: boolean
  onResetRange?: () => void
  onApplyRange?: () => void
}

export function DateRangeSlider({ 
  tempRange, 
  setTempRange, 
  onBlockRangeEstimated,
  isLoading = false,
  actualBlocks,
  rangeError,
  queueLoading = false,
  onResetRange,
  onApplyRange
}: Props) {
  const startInput = useRef<HTMLInputElement>(null)
  const endInput = useRef<HTMLInputElement>(null)
  const [estimatedBlocks, setEstimatedBlocks] = useState<{ min: number; max: number } | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  
  // Track previous dates to detect which one changed
  const prevStartTime = useRef<number | null>(null)
  const prevEndTime = useRef<number | null>(null)
  
  // Convert Date to YYYY-MM-DD string for input
  const formatDateForInput = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }
  
  // Convert YYYY-MM-DD string to Date
  const parseInputDate = (dateString: string): Date => {
    return new Date(dateString + 'T12:00:00.000Z') // Use noon UTC to avoid timezone issues
  }
  
  // Clear validation errors when dates become valid
  useEffect(() => {
    if (validationError && tempRange.start && tempRange.end) {
      // Check if the current range is now valid
      const isStartValid = isValidArweaveDate(tempRange.start)
      const isEndValid = isValidArweaveDate(tempRange.end)
      const isRangeValid = tempRange.start < tempRange.end
      
      if (isStartValid && isEndValid && isRangeValid) {
        setValidationError(null)
      }
    }
  }, [tempRange.start?.getTime(), tempRange.end?.getTime(), validationError])

  // Update block display - intelligently update only the changed date's block
  useEffect(() => {
    const updateBlockDisplay = () => {
      if (!tempRange.start || !tempRange.end) return
      
      // If we have actual blocks (from syncing), use those instead of estimating
      if (actualBlocks) {
        // Using actual blocks from syncing process
        setEstimatedBlocks(actualBlocks)
        
        // Update refs to track current times
        prevStartTime.current = tempRange.start.getTime()
        prevEndTime.current = tempRange.end.getTime()
        
        // Notify parent of actual blocks
        if (onBlockRangeEstimated) {
          onBlockRangeEstimated(actualBlocks.min, actualBlocks.max)
        }
        return
      }
      
      // Get current timestamps
      const currentStartTime = tempRange.start.getTime()
      const currentEndTime = tempRange.end.getTime()
      
      // Determine which date(s) changed
      const startChanged = prevStartTime.current !== currentStartTime
      const endChanged = prevEndTime.current !== currentEndTime
      
      // If this is the first run (no previous values), estimate both
      if (prevStartTime.current === null || prevEndTime.current === null) {
        // Initial block estimation for both dates
        const estimatedMin = estimateBlockForTimestampSync(currentStartTime)
        const estimatedMax = estimateBlockForTimestampSync(currentEndTime)
        
        setEstimatedBlocks({ min: estimatedMin, max: estimatedMax })
        
        if (onBlockRangeEstimated) {
          onBlockRangeEstimated(estimatedMin, estimatedMax)
        }
      }
      // If only start date changed, update only min block
      else if (startChanged && !endChanged) {
        // Start date changed - updating min block only
        const newMinBlock = estimateBlockForTimestampSync(currentStartTime)
        
        setEstimatedBlocks(prev => {
          const newBlocks = prev ? { min: newMinBlock, max: prev.max } : { min: newMinBlock, max: newMinBlock }
          
          // Notify parent with updated blocks
          if (onBlockRangeEstimated) {
            onBlockRangeEstimated(newBlocks.min, newBlocks.max)
          }
          
          return newBlocks
        })
      }
      // If only end date changed, update only max block
      else if (endChanged && !startChanged) {
        // End date changed - updating max block only
        const newMaxBlock = estimateBlockForTimestampSync(currentEndTime)
        
        setEstimatedBlocks(prev => {
          const newBlocks = prev ? { min: prev.min, max: newMaxBlock } : { min: newMaxBlock, max: newMaxBlock }
          
          // Notify parent with updated blocks
          if (onBlockRangeEstimated) {
            onBlockRangeEstimated(newBlocks.min, newBlocks.max)
          }
          
          return newBlocks
        })
      }
      // If both changed (unlikely but possible), update both
      else if (startChanged && endChanged) {
        // Both dates changed - updating both blocks
        const estimatedMin = estimateBlockForTimestampSync(currentStartTime)
        const estimatedMax = estimateBlockForTimestampSync(currentEndTime)
        
        setEstimatedBlocks({ min: estimatedMin, max: estimatedMax })
        
        if (onBlockRangeEstimated) {
          onBlockRangeEstimated(estimatedMin, estimatedMax)
        }
      }
      
      // Update refs to track current state
      prevStartTime.current = currentStartTime
      prevEndTime.current = currentEndTime
    }
    
    updateBlockDisplay()
  }, [tempRange.start?.getTime(), tempRange.end?.getTime(), actualBlocks])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!startInput.current || !endInput.current) return

      const active = document.activeElement
      const isStart = active === startInput.current
      const isEnd = active === endInput.current

      if (isStart || isEnd) {
        // Only handle arrow keys, allow all other keys for manual typing
        const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (delta === 0) return

        e.preventDefault() // Only prevent default for arrow keys

        if (isStart) {
          const newStart = new Date(tempRange.start)
          newStart.setDate(newStart.getDate() + delta)
          if (newStart < tempRange.end) {
            setTempRange({ ...tempRange, start: newStart })
          }
        }

        if (isEnd) {
          const newEnd = new Date(tempRange.end)
          newEnd.setDate(newEnd.getDate() + delta)
          if (newEnd > tempRange.start) {
            setTempRange({ ...tempRange, end: newEnd })
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [tempRange])

  const handleStartChange = (dateString: string) => {
    // Clear any existing validation errors when user types
    setValidationError(null)
    
    // Allow empty string for clearing the input
    if (!dateString) {
      return
    }
    
    try {
      const newStart = parseInputDate(dateString)
      
      // Check if the parsed date is valid (not NaN)
      if (!isNaN(newStart.getTime())) {
        // Update the date without validation - let user type freely
        setTempRange({ ...tempRange, start: newStart })
      }
    } catch (error) {
      // Silently ignore parsing errors while typing
    }
  }

  const handleStartBlur = (e: Event) => {
    const input = e.target as HTMLInputElement
    const dateString = input.value
    
    // Native date inputs handle validation themselves
    if (dateString) {
      handleStartChange(dateString)
    }
  }

  const handleEndChange = (dateString: string) => {
    // Clear any existing validation errors when user types
    setValidationError(null)
    
    // Allow empty string for clearing the input
    if (!dateString) {
      return
    }
    
    try {
      const newEnd = parseInputDate(dateString)
      
      // Check if the parsed date is valid (not NaN)
      if (!isNaN(newEnd.getTime())) {
        // Update the date without validation - let user type freely
        setTempRange({ ...tempRange, end: newEnd })
      }
    } catch (error) {
      // Silently ignore parsing errors while typing
    }
  }

  const handleEndBlur = (e: Event) => {
    const input = e.target as HTMLInputElement
    const dateString = input.value
    
    // Native date inputs handle validation themselves
    if (dateString) {
      handleEndChange(dateString)
    }
  }

  // Validate date range when Apply is clicked
  const validateDateRange = (): boolean => {
    if (!tempRange.start || !tempRange.end) {
      setValidationError('Please select both start and end dates')
      return false
    }
    
    if (!isValidArweaveDate(tempRange.start)) {
      setValidationError('Start date must be between June 2018 and today')
      return false
    }
    
    if (!isValidArweaveDate(tempRange.end)) {
      setValidationError('End date must be between June 2018 and today')
      return false
    }
    
    if (tempRange.start >= tempRange.end) {
      setValidationError('Start date must be before end date')
      return false
    }
    
    setValidationError(null)
    return true
  }
  
  // Handle Apply button click with validation
  const handleApply = () => {
    if (validateDateRange() && onApplyRange) {
      onApplyRange()
    }
  }

  // Current date for input constraints
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0) // Set to start of today for consistency

  return (
    <div className="date-range-picker">
      <h3 className="date-range-title">Custom Date Range</h3>
      
      <div className="date-inputs">
        <div className="date-input-wrapper">
          <label className="date-input-label">From</label>
          <div className="date-input-with-icon">
            <input
              type="date"
              ref={startInput}
              className="date-input"
              value={formatDateForInput(tempRange.start)}
              onChange={(e) => handleStartChange((e.target as HTMLInputElement).value)}
              onBlur={handleStartBlur}
              min="2018-06-01"
              max={formatDateForInput(now)}
              aria-label="Start date"
              disabled={isLoading}
              placeholder="YYYY-MM-DD"
            />
            <Icons.Calendar 
              className="date-input-icon" 
              onClick={() => startInput.current?.showPicker()}
            />
          </div>
        </div>
        <div className="date-input-wrapper">
          <label className="date-input-label">To</label>
          <div className="date-input-with-icon">
            <input
              type="date"
              ref={endInput}
              className="date-input"
              value={formatDateForInput(tempRange.end)}
              onChange={(e) => handleEndChange((e.target as HTMLInputElement).value)}
              onBlur={handleEndBlur}
              min={formatDateForInput(tempRange.start)}
              max={formatDateForInput(now)}
              aria-label="End date"
              disabled={isLoading}
              placeholder="YYYY-MM-DD"
            />
            <Icons.Calendar 
              className="date-input-icon" 
              onClick={() => endInput.current?.showPicker()}
            />
          </div>
        </div>
      </div>

      {estimatedBlocks && (
        <div className="block-range-info">
          <div className="block-range-label">Estimated Block Range</div>
          <div className="block-range-value">
            {estimatedBlocks.min.toLocaleString()} – {estimatedBlocks.max.toLocaleString()}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="date-range-status loading">
          <span className="status-icon">⏳</span>
          <span>Resolving exact blocks...</span>
        </div>
      )}
      
      {validationError && (
        <div className="date-range-status error">
          <span className="status-icon">⚠️</span>
          <span>{validationError}</span>
        </div>
      )}

      {rangeError && (
        <div className="date-range-status error">
          <span className="status-icon">⚠️</span>
          <span>{rangeError}</span>
        </div>
      )}

      {(onResetRange && onApplyRange) && (
        <div className="date-range-actions">
          <button
            className="date-action-btn secondary"
            onClick={onResetRange}
          >
            Cancel
          </button>
          <button
            className="date-action-btn primary"
            onClick={handleApply}
            disabled={queueLoading}
          >
            {queueLoading ? "Loading…" : isLoading ? "Resolving…" : "Apply"}
          </button>
        </div>
      )}
    </div>
  )
}