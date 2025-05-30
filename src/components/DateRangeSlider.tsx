import { useRef, useEffect, useState } from 'preact/hooks'
import { estimateBlockForTimestampSync, isValidArweaveDate } from '../utils/dateBlockUtils'

type DateRange = { start: Date; end: Date }

type Props = {
  tempRange: DateRange
  setTempRange: (r: DateRange) => void
  onBlockRangeEstimated?: (minBlock: number, maxBlock: number) => void
  isLoading?: boolean
  actualBlocks?: { min: number; max: number } // When syncing with known blocks, skip estimation
}

export function DateRangeSlider({ 
  tempRange, 
  setTempRange, 
  onBlockRangeEstimated,
  isLoading = false,
  actualBlocks
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
  
  // Update block display - intelligently update only the changed date's block
  useEffect(() => {
    const updateBlockDisplay = () => {
      if (!tempRange.start || !tempRange.end) return
      
      // If we have actual blocks (from syncing), use those instead of estimating
      if (actualBlocks) {
        console.log('🔥 USING ACTUAL BLOCKS:', actualBlocks)
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
        console.log('🔥 INITIAL BLOCK ESTIMATION for both dates')
        const estimatedMin = estimateBlockForTimestampSync(currentStartTime)
        const estimatedMax = estimateBlockForTimestampSync(currentEndTime)
        
        setEstimatedBlocks({ min: estimatedMin, max: estimatedMax })
        
        if (onBlockRangeEstimated) {
          onBlockRangeEstimated(estimatedMin, estimatedMax)
        }
      }
      // If only start date changed, update only min block
      else if (startChanged && !endChanged) {
        console.log('🔥 START DATE CHANGED - updating min block only')
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
        console.log('🔥 END DATE CHANGED - updating max block only')
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
        console.log('🔥 BOTH DATES CHANGED - updating both blocks')
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
        e.preventDefault()
        const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (delta === 0) return

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
    setValidationError(null)
    
    // Try to parse and validate the date if it looks like a valid format
    if (dateString.length >= 8 && dateString.includes('-')) {
      try {
        const newStart = parseInputDate(dateString)
        
        // Check if the parsed date is valid (not NaN)
        if (isNaN(newStart.getTime())) {
          return
        }
        
        // Validate constraints only for complete, valid dates
        if (dateString.length === 10) {
          if (!isValidArweaveDate(newStart)) {
            setValidationError('Date must be between June 2018 and today')
            return
          }
          
          if (newStart >= tempRange.end) {
            setValidationError('Start date must be before end date')
            return
          }
        }
        
        // Update the date if it's valid
        setTempRange({ ...tempRange, start: newStart })
      } catch (error) {
        // Silently ignore parsing errors for partial input
      }
    }
  }

  const handleStartBlur = (e: Event) => {
    const input = e.target as HTMLInputElement
    const dateString = input.value
    
    if (dateString.length === 10) {
      handleStartChange(dateString)
    }
  }

  const handleEndChange = (dateString: string) => {
    setValidationError(null)
    
    // Try to parse and validate the date if it looks like a valid format
    if (dateString.length >= 8 && dateString.includes('-')) {
      try {
        const newEnd = parseInputDate(dateString)
        
        // Check if the parsed date is valid (not NaN)
        if (isNaN(newEnd.getTime())) {
          return
        }
        
        // Validate constraints only for complete, valid dates
        if (dateString.length === 10) {
          if (!isValidArweaveDate(newEnd)) {
            setValidationError('Date must be between June 2018 and today')
            return
          }
          
          if (newEnd <= tempRange.start) {
            setValidationError('End date must be after start date')
            return
          }
        }
        
        // Update the date if it's valid
        setTempRange({ ...tempRange, end: newEnd })
      } catch (error) {
        // Silently ignore parsing errors for partial input
      }
    }
  }

  const handleEndBlur = (e: Event) => {
    const input = e.target as HTMLInputElement
    const dateString = input.value
    
    if (dateString.length === 10) {
      handleEndChange(dateString)
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
        </div>
        <div className="date-input-wrapper">
          <label className="date-input-label">To</label>
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
    </div>
  )
}