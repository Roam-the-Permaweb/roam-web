import { logger } from './logger'
import { GATEWAY_DATA_SOURCE } from '../engine/fetchQueue'
import { GATEWAYS_GRAPHQL } from '../engine/query'

// Average block time in milliseconds (2 minutes) - used for quick estimation
const AVERAGE_BLOCK_TIME_MS = 2 * 60 * 1000

// Arweave genesis block info (approximate)
const ARWEAVE_GENESIS_DATE = new Date('2018-06-01T00:00:00.000Z') // Arweave mainnet launch

// Simple fallback for when we can't fetch current block info
// This should be updated occasionally but doesn't need to be precise
const FALLBACK_CURRENT_BLOCK = 1680000 // Rough estimate as of late May 2025

// Current block info for bounds
let currentBlockAnchor: { block: number; timestamp: number } | null = null

// Fetch current block height and timestamp to use as anchor
async function getCurrentBlockAnchor(): Promise<{ block: number; timestamp: number }> {
  if (currentBlockAnchor) {
    return currentBlockAnchor
  }
  
  const gateway = GATEWAY_DATA_SOURCE[0] || 'https://arweave.net'
  
  try {
    // Get current network info
    const infoResponse = await fetch(`${gateway.trim()}/info`)
    if (!infoResponse.ok) throw new Error('Info fetch failed')
    
    const info = await infoResponse.json()
    const currentHeight = info.height
    
    // Get timestamp for current block
    const blockResponse = await fetch(`${gateway.trim()}/block/height/${currentHeight}`)
    if (!blockResponse.ok) throw new Error('Block fetch failed')
    
    const blockData = await blockResponse.json()
    
    currentBlockAnchor = {
      block: currentHeight,
      timestamp: blockData.timestamp * 1000 // Convert to milliseconds
    }
    
    logger.debug('Current block anchor:', currentBlockAnchor)
    return currentBlockAnchor
    
  } catch (error) {
    logger.warn('Failed to get current block anchor, using fallback:', error)
    // Fallback to reasonable current estimate
    currentBlockAnchor = {
      block: 1680319, // Your observed current block
      timestamp: Date.now()
    }
    return currentBlockAnchor
  }
}

// Cache for verified date-block mappings
interface DateBlockCache {
  [dateKey: string]: {
    minBlock: number
    maxBlock: number
    timestamp: number
  }
}

// Cache for block→timestamp mappings to avoid re-fetching
interface BlockTimestampCache {
  [blockHeight: string]: {
    timestamp: number
    fetched: number // When this was cached
  }
}

let cache: DateBlockCache = {}
let blockCache: BlockTimestampCache = {}

// Cache expiry (1 hour for block timestamps since they don't change)
const BLOCK_CACHE_EXPIRY_MS = 60 * 60 * 1000

// Get date key for caching (YYYY-MM-DD format)
function getDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

// Enhanced binary search using range queries for better accuracy and efficiency
async function binarySearchBlockForTimestamp(targetTimestamp: number, searchType: 'first_after' | 'last_before'): Promise<number> {
  try {
    // Get current block info
    const currentInfo = await getCurrentBlockInfo()
    const currentBlock = currentInfo.block
    
    let low = 1
    let high = currentBlock
    let result = searchType === 'first_after' ? high : low
  
  console.log(`🔥 BINARY SEARCH: Looking for ${searchType} block for ${new Date(targetTimestamp).toISOString()}`)
  console.log(`🔥 BINARY SEARCH: Search range ${low} - ${high}`)
  
  // Use range queries for more efficient searching
  const RANGE_SIZE = 100 // Fetch 100 blocks at a time for better accuracy
  const BLOCK_TOLERANCE = 500 // Within 500 blocks (~17 hours) is fine for date ranges
  const maxIterations = 10 // Allow more iterations for range queries
  let iterations = 0
  let bestMatch = result
  let bestTimeDiff = Infinity
  
  while (low <= high && iterations < maxIterations) {
    iterations++
    
    // Early termination if range is small enough
    if (high - low <= BLOCK_TOLERANCE) {
      console.log(`🔥 BINARY SEARCH: Early termination - range ${high - low} <= tolerance ${BLOCK_TOLERANCE}`)
      result = searchType === 'first_after' ? high : low
      break
    }
    
    const mid = Math.floor((low + high) / 2)
    const rangeStart = Math.max(low, mid - RANGE_SIZE / 2)
    const rangeEnd = Math.min(high, mid + RANGE_SIZE / 2)
    
    try {
      // Fetch a range of blocks around the midpoint
      const blocks = await fetchBlocksRange(rangeStart, rangeEnd)
      
      if (blocks.length === 0) {
        // Fallback to single block fetch
        const blockInfo = await fetchBlockInfo(mid)
        if (!blockInfo) {
          logger.warn(`Could not fetch block ${mid} during binary search`)
          break
        }
        blocks.push(blockInfo)
      }
      
      // Find the best match within the fetched range
      let rangeResult = result
      let rangeTimeDiff = Infinity
      
      for (const block of blocks) {
        const timeDiff = Math.abs(block.timestamp - targetTimestamp)
        
        // Track overall best match
        if (timeDiff < bestTimeDiff) {
          bestMatch = block.height
          bestTimeDiff = timeDiff
        }
        
        // Find best match for this range based on search type
        if (searchType === 'last_before' && block.timestamp <= targetTimestamp && timeDiff < rangeTimeDiff) {
          rangeResult = block.height
          rangeTimeDiff = timeDiff
        } else if (searchType === 'first_after' && block.timestamp >= targetTimestamp && timeDiff < rangeTimeDiff) {
          rangeResult = block.height
          rangeTimeDiff = timeDiff
        }
      }
      
      // Log the best block found in this range
      const bestInRange = blocks.reduce((best, block) => 
        Math.abs(block.timestamp - targetTimestamp) < Math.abs(best.timestamp - targetTimestamp) ? block : best
      )
      
      console.log(`🔥 BINARY SEARCH: Range ${rangeStart}-${rangeEnd} (${blocks.length} blocks), best: ${bestInRange.height} = ${new Date(bestInRange.timestamp).toISOString()} (diff: ${Math.round(Math.abs(bestInRange.timestamp - targetTimestamp) / 1000 / 60)} min)`)
      
      // Check if we found a good enough match
      const isEarlyDate = targetTimestamp < new Date('2020-01-01').getTime()
      const tolerance = isEarlyDate ? 24 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000 // 24 hours for early dates, 6 hours for recent
      
      if (rangeTimeDiff <= tolerance) {
        console.log(`🔥 BINARY SEARCH: Close enough match found in range`)
        result = rangeResult
        break
      }
      
      // Adjust search range based on the best match in the current range
      if (bestInRange.timestamp < targetTimestamp) {
        if (searchType === 'last_before') {
          result = rangeResult
        }
        low = rangeEnd + 1
      } else {
        if (searchType === 'first_after') {
          result = rangeResult
        }
        high = rangeStart - 1
      }
      
    } catch (error) {
      logger.warn(`Error fetching blocks range ${rangeStart}-${rangeEnd} during binary search:`, error)
      // Fallback to single block
      try {
        const blockInfo = await fetchBlockInfo(mid)
        if (blockInfo) {
          const timeDiff = Math.abs(blockInfo.timestamp - targetTimestamp)
          if (timeDiff < bestTimeDiff) {
            bestMatch = mid
            bestTimeDiff = timeDiff
          }
          
          if (blockInfo.timestamp < targetTimestamp) {
            if (searchType === 'last_before') {
              result = mid
            }
            low = mid + 1
          } else {
            if (searchType === 'first_after') {
              result = mid
            }
            high = mid - 1
          }
        } else {
          break
        }
      } catch (singleError) {
        logger.warn(`Single block fetch also failed for ${mid}:`, singleError)
        break
      }
    }
  }
  
  // Use best match if we didn't find exact
  const isEarlyDate = targetTimestamp < new Date('2020-01-01').getTime()
  const maxAcceptableDiff = isEarlyDate ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000 // 7 days for early, 24 hours for recent
  
  if (bestTimeDiff < Infinity && bestTimeDiff <= maxAcceptableDiff) {
    result = bestMatch
  }
  
  console.log(`🔥 BINARY SEARCH: Found block ${result} after ${iterations} iterations (best match with ${Math.round(bestTimeDiff / 1000 / 60)} min diff)`)
  return result
  
  } catch (error) {
    logger.error(`Binary search failed for ${new Date(targetTimestamp).toISOString()}:`, error)
    // Return estimation as fallback
    const fallback = estimateBlockForTimestampSync(targetTimestamp)
    logger.warn(`Binary search failed, using estimation fallback: ${fallback}`)
    return fallback
  }
}

// Get current block height
async function getCurrentBlockHeight(): Promise<number> {
  const info = await getCurrentBlockInfo()
  return info.block
}

// Find exact block for timestamp using binary search
export async function findBlockForTimestamp(timestamp: number): Promise<number> {
  return await binarySearchBlockForTimestamp(timestamp, 'last_before')
}

// Get current block info with caching
async function getCurrentBlockInfo(): Promise<{ block: number; timestamp: number }> {
  // Use cached value if it's less than 10 minutes old
  if (currentBlockAnchor && (Date.now() - currentBlockAnchor.timestamp < 10 * 60 * 1000)) {
    return currentBlockAnchor
  }
  
  try {
    const anchor = await getCurrentBlockAnchor()
    return anchor
  } catch (error) {
    logger.warn('Failed to get current block info, using fallback:', error)
    // Return fallback with current time
    return {
      block: FALLBACK_CURRENT_BLOCK,
      timestamp: Date.now()
    }
  }
}

// Initialize current block info cache
export async function initializeCurrentAnchor(): Promise<void> {
  try {
    await getCurrentBlockInfo()
    logger.debug('Initialized current block info cache')
  } catch (error) {
    logger.warn('Failed to initialize current block info, will use fallback:', error)
  }
}

// Simple estimation: work backwards from current block using average block time
async function estimateBlockFromCurrent(targetTimestamp: number): Promise<number> {
  const currentInfo = await getCurrentBlockInfo()
  
  // Calculate time difference
  const timeDiff = currentInfo.timestamp - targetTimestamp
  
  // Convert time difference to blocks (negative means future, positive means past)
  const blockDiff = Math.round(timeDiff / AVERAGE_BLOCK_TIME_MS)
  
  // Estimate target block
  const estimatedBlock = currentInfo.block - blockDiff
  
  // Ensure we don't go below block 1
  // For future dates, allow reasonable extrapolation above current block
  return Math.max(1, estimatedBlock)
}

// Simple synchronous estimation using fallback current block
export function estimateBlockForTimestampSync(timestamp: number): number {
  // Handle edge case: very old timestamps (before Arweave)
  if (timestamp < ARWEAVE_GENESIS_DATE.getTime()) {
    return 1
  }
  
  // Use cached current block info if available, otherwise use fallback
  const currentTime = Date.now()
  let currentBlock = FALLBACK_CURRENT_BLOCK
  let currentTimestamp = currentTime
  
  if (currentBlockAnchor && (currentTime - currentBlockAnchor.timestamp < 60 * 60 * 1000)) {
    currentBlock = currentBlockAnchor.block
    currentTimestamp = currentBlockAnchor.timestamp
  }
  
  // Calculate time difference
  const timeDiff = currentTimestamp - timestamp
  
  // Convert time difference to blocks
  const blockDiff = Math.round(timeDiff / AVERAGE_BLOCK_TIME_MS)
  
  // Estimate target block
  const estimatedBlock = currentBlock - blockDiff
  
  // Ensure bounds: not below 1
  // For future dates, allow going above current block (reasonable extrapolation)
  const result = Math.max(1, estimatedBlock)
  
  console.log('🔥 SIMPLE ESTIMATION:', {
    timestamp: new Date(timestamp).toISOString(),
    currentBlock,
    currentTime: new Date(currentTimestamp).toISOString(),
    timeDiff: Math.round(timeDiff / 1000 / 60) + ' minutes',
    blockDiff,
    estimatedBlock,
    result
  })
  
  return result
}

// Async estimation with real current block data
export async function estimateBlockForTimestamp(timestamp: number): Promise<number> {
  // For exact results, try binary search first
  try {
    const exactResult = await findBlockForTimestamp(timestamp)
    if (exactResult && exactResult > 0) {
      return exactResult
    }
  } catch (error) {
    logger.warn('Binary search failed, falling back to estimation:', error)
  }
  
  // Fallback to simple estimation with current block info
  try {
    return await estimateBlockFromCurrent(timestamp)
  } catch (error) {
    logger.warn('Failed to get current block, using sync estimation:', error)
    return estimateBlockForTimestampSync(timestamp)
  }
}

// Fetch multiple blocks using GraphQL range query for more efficient binary search
async function fetchBlocksRange(minHeight: number, maxHeight: number): Promise<{ height: number; timestamp: number }[]> {
  const query = `
    query GetBlocksRange($min: Int!, $max: Int!) {
      blocks(
        height: {
          min: $min,
          max: $max
        }
        first: 100
        sort: HEIGHT_ASC
      ) {
        edges {
          cursor
          node {
            id
            timestamp
            height
            previous
          }
        }
      }
    }
  `
  
  const variables = { min: minHeight, max: maxHeight }
  
  // Try each GraphQL gateway until one succeeds
  for (const rawGw of GATEWAYS_GRAPHQL) {
    const gw = rawGw.trim()
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout for range queries
      
      const response = await fetch(`${gw}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-roam-client': 'roam-mvp'
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        logger.warn(`GraphQL blocks range request failed from ${gw}: ${response.status}`)
        continue
      }
      
      const json = await response.json()
      
      // Check for GraphQL errors
      if (json.errors?.length) {
        logger.warn(`GraphQL errors for blocks range ${minHeight}-${maxHeight}:`, json.errors.map((e: any) => e.message).join('; '))
        continue
      }
      
      const edges = json.data?.blocks?.edges || []
      const blocks: { height: number; timestamp: number }[] = []
      const now = Date.now()
      
      for (const edge of edges) {
        const block = edge.node
        if (block && typeof block.height === 'number' && typeof block.timestamp === 'number') {
          const result = {
            height: block.height,
            timestamp: block.timestamp * 1000 // Convert to milliseconds
          }
          
          blocks.push(result)
          
          // Cache individual blocks
          const blockKey = block.height.toString()
          blockCache[blockKey] = {
            timestamp: result.timestamp,
            fetched: now
          }
        }
      }
      
      logger.debug(`Fetched ${blocks.length} blocks via GraphQL range query ${minHeight}-${maxHeight}`)
      return blocks
      
    } catch (error) {
      logger.warn(`Failed to fetch blocks range ${minHeight}-${maxHeight} from GraphQL gateway ${gw}:`, error)
    }
  }
  
  logger.warn(`All GraphQL gateways failed for blocks range ${minHeight}-${maxHeight}`)
  return []
}

// Fetch block by height using GraphQL for efficiency
async function fetchBlockInfo(height: number): Promise<{ height: number; timestamp: number } | null> {
  const blockKey = height.toString()
  const now = Date.now()
  
  // Check cache first
  if (blockCache[blockKey] && (now - blockCache[blockKey].fetched) < BLOCK_CACHE_EXPIRY_MS) {
    logger.debug(`Using cached block info for ${height}`)
    return {
      height: height,
      timestamp: blockCache[blockKey].timestamp
    }
  }
  
  // For single block, try range query with small window first (more efficient)
  const rangeSize = 50 // Small range for single block lookup
  const minRange = Math.max(1, height - rangeSize)
  const maxRange = height + rangeSize
  
  const blocks = await fetchBlocksRange(minRange, maxRange)
  const targetBlock = blocks.find(block => block.height === height)
  
  if (targetBlock) {
    return targetBlock
  }
  
  // Fallback to single block GraphQL query
  const query = `
    query GetBlockInfo($height: Int!) {
      block(height: $height) {
        height
        timestamp
      }
    }
  `
  
  const variables = { height }
  
  // Try each GraphQL gateway until one succeeds
  for (const rawGw of GATEWAYS_GRAPHQL) {
    const gw = rawGw.trim()
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)
      
      const response = await fetch(`${gw}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-roam-client': 'roam-mvp'
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        logger.warn(`GraphQL request failed for block ${height} from ${gw}: ${response.status}`)
        continue
      }
      
      const json = await response.json()
      
      if (json.errors?.length) {
        logger.warn(`GraphQL errors for block ${height}:`, json.errors.map((e: any) => e.message).join('; '))
        continue
      }
      
      const blockData = json.data?.block
      
      if (blockData && typeof blockData.timestamp === 'number') {
        const result = {
          height: height,
          timestamp: blockData.timestamp * 1000
        }
        
        blockCache[blockKey] = {
          timestamp: result.timestamp,
          fetched: now
        }
        
        logger.debug(`Cached block info for ${height} via single GraphQL query: ${new Date(result.timestamp).toISOString()}`)
        return result
      }
    } catch (error) {
      logger.warn(`Failed to fetch block ${height} from GraphQL gateway ${gw}:`, error)
    }
  }
  
  // Final fallback to HTTP API
  logger.warn(`All GraphQL approaches failed for block ${height}, falling back to HTTP API`)
  
  const gateway = GATEWAY_DATA_SOURCE[0] || 'https://arweave.net'
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    
    const response = await fetch(`${gateway.trim()}/block/height/${height}`, {
      method: 'GET',
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      logger.warn(`HTTP API block ${height} fetch failed from ${gateway}: ${response.status}`)
      return null
    }
    
    const blockData = await response.json()
    
    if (blockData.timestamp && typeof blockData.timestamp === 'number') {
      const result = {
        height: height,
        timestamp: blockData.timestamp * 1000
      }
      
      blockCache[blockKey] = {
        timestamp: result.timestamp,
        fetched: now
      }
      
      logger.debug(`Cached block info for ${height} via HTTP fallback: ${new Date(result.timestamp).toISOString()}`)
      return result
    }
  } catch (error) {
    logger.warn(`HTTP API fallback also failed for block ${height}:`, error)
  }
  
  return null
}


// Get block range for a specific date using binary search
export async function getBlockRangeForDate(date: Date, requireExact: boolean = true): Promise<{ minBlock: number; maxBlock: number } | null> {
  const dateKey = getDateKey(date)
  
  // Check cache first
  if (cache[dateKey]) {
    logger.debug(`Using cached block range for ${dateKey}:`, cache[dateKey])
    return { minBlock: cache[dateKey].minBlock, maxBlock: cache[dateKey].maxBlock }
  }
  
  try {
    // Clean date boundaries
    const startOfDay = new Date(date)
    startOfDay.setUTCHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setUTCHours(23, 59, 59, 999)
    
    console.log('🔥 BINARY SEARCH DATE RANGE:', {
      dateKey,
      startOfDay: startOfDay.toISOString(),
      endOfDay: endOfDay.toISOString(),
      startTimestamp: startOfDay.getTime(),
      endTimestamp: endOfDay.getTime()
    })
    
    // Handle future dates
    const now = Date.now()
    if (startOfDay.getTime() > now) {
      logger.warn(`Future date requested: ${dateKey}`)
      const currentBlock = await getCurrentBlockHeight()
      const safeEndBlock = currentBlock - 15
      const safeStartBlock = Math.max(1, safeEndBlock - 720)
      
      const result = { minBlock: safeStartBlock, maxBlock: safeEndBlock }
      cache[dateKey] = { minBlock: safeStartBlock, maxBlock: safeEndBlock, timestamp: startOfDay.getTime() }
      return result
    }
    
    // For very early dates (2018-2019), skip binary search as timestamps are unreliable
    const year = startOfDay.getFullYear()
    if (requireExact && year < 2020) {
      logger.warn(`Early date ${dateKey} (year ${year}) - using estimation instead of binary search due to unreliable early blockchain timestamps`)
      requireExact = false // Force estimation
    }
    
    if (requireExact) {
      try {
        // Use binary search to find exact blocks
        const minBlock = await binarySearchBlockForTimestamp(startOfDay.getTime(), 'first_after')
        const maxBlock = await binarySearchBlockForTimestamp(endOfDay.getTime(), 'last_before')
        
        // Validate binary search results
        if (!minBlock || !maxBlock || minBlock < 1 || maxBlock < 1) {
          logger.warn(`Binary search returned invalid results: minBlock=${minBlock}, maxBlock=${maxBlock}, falling back to estimation`)
          throw new Error('Binary search failed')
        }
        
        // Handle case where blocks are reversed (can happen with sparse early blockchain data)
        let finalMinBlock = minBlock
        let finalMaxBlock = maxBlock
        
        if (minBlock > maxBlock) {
          logger.warn(`Binary search returned reversed blocks (min=${minBlock} > max=${maxBlock}), likely due to inconsistent timestamps in early blockchain`)
          
          // For early dates (before 2020), this is common due to sparse/inconsistent timestamps
          // Use estimation as it's more reliable for this period
          const year = startOfDay.getFullYear()
          if (year < 2020) {
            logger.warn(`Early date detected (${year}), falling back to estimation due to unreliable timestamps`)
            throw new Error('Early blockchain timestamps unreliable')
          }
          
          // For later dates, swap the values
          finalMinBlock = Math.min(minBlock, maxBlock)
          finalMaxBlock = Math.max(minBlock, maxBlock)
        }
        
        const result = { minBlock: finalMinBlock, maxBlock: finalMaxBlock }
        
        // Cache the result with corrected values
        cache[dateKey] = {
          minBlock: finalMinBlock,
          maxBlock: finalMaxBlock,
          timestamp: startOfDay.getTime()
        }
        
        console.log(`🔥 BINARY SEARCH RESULT: ${dateKey} = blocks ${finalMinBlock}-${finalMaxBlock}`)
        return result
        
      } catch (binarySearchError) {
        logger.warn(`Binary search failed for ${dateKey}, falling back to improved estimation:`, binarySearchError)
        
        // Fallback to simple estimation when binary search fails
        const estimatedMin = estimateBlockForTimestampSync(startOfDay.getTime())
        const estimatedMax = estimateBlockForTimestampSync(endOfDay.getTime())
        
        const fallbackResult = { minBlock: estimatedMin, maxBlock: estimatedMax }
        
        // Cache the fallback result
        cache[dateKey] = {
          minBlock: estimatedMin,
          maxBlock: estimatedMax,
          timestamp: startOfDay.getTime()
        }
        
        console.log(`🔥 ESTIMATION FALLBACK: ${dateKey} = blocks ${estimatedMin}-${estimatedMax}`)
        return fallbackResult
      }
      
    } else {
      // Fast estimation for UI display
      const estimatedMin = estimateBlockForTimestampSync(startOfDay.getTime())
      const estimatedMax = estimateBlockForTimestampSync(endOfDay.getTime())
      
      const result = { minBlock: estimatedMin, maxBlock: estimatedMax }
      return result
    }
    
  } catch (error) {
    logger.error(`All methods failed to get block range for date ${dateKey}:`, error)
    
    // Last resort fallback to estimation
    try {
      const fallbackDate = new Date(date)
      const startOfDayFallback = new Date(fallbackDate)
      startOfDayFallback.setUTCHours(0, 0, 0, 0)
      const endOfDayFallback = new Date(fallbackDate)
      endOfDayFallback.setUTCHours(23, 59, 59, 999)
      
      const fallbackMin = estimateBlockForTimestampSync(startOfDayFallback.getTime())
      const fallbackMax = estimateBlockForTimestampSync(endOfDayFallback.getTime())
      console.log(`🔥 FINAL FALLBACK: ${dateKey} = blocks ${fallbackMin}-${fallbackMax}`)
      return { minBlock: fallbackMin, maxBlock: fallbackMax }
    } catch (fallbackError) {
      logger.error('Even estimation fallback failed:', fallbackError)
      return null
    }
  }
}

// Cache for date range search to avoid unnecessary re-computation
interface DateRangeCache {
  startDate?: { date: string; minBlock: number }
  endDate?: { date: string; maxBlock: number }
}

let dateRangeCache: DateRangeCache = {}

// Get block range for a date range with intelligent caching to avoid re-searching unchanged dates
export async function getBlockRangeForDateRange(startDate: Date, endDate: Date, requireExact: boolean = false): Promise<{ minBlock: number; maxBlock: number } | null> {
  try {
    const startDateKey = getDateKey(startDate)
    const endDateKey = getDateKey(endDate)
    
    console.log('🔥 DATE RANGE SEARCH: Checking cache for dates:', { startDateKey, endDateKey })
    console.log('🔥 DATE RANGE CACHE STATE:', dateRangeCache)
    
    let minBlock: number
    let maxBlock: number
    
    // Check if we can reuse cached start date block
    if (dateRangeCache.startDate && dateRangeCache.startDate.date === startDateKey) {
      console.log('🔥 REUSING CACHED START BLOCK:', dateRangeCache.startDate.minBlock)
      minBlock = dateRangeCache.startDate.minBlock
    } else {
      console.log('🔥 BINARY SEARCH FOR START DATE:', startDateKey)
      const startRange = await getBlockRangeForDate(startDate, requireExact)
      if (!startRange) {
        return null
      }
      minBlock = startRange.minBlock
      // Cache the start date result
      dateRangeCache.startDate = { date: startDateKey, minBlock }
    }
    
    // Check if we can reuse cached end date block
    if (dateRangeCache.endDate && dateRangeCache.endDate.date === endDateKey) {
      console.log('🔥 REUSING CACHED END BLOCK:', dateRangeCache.endDate.maxBlock)
      maxBlock = dateRangeCache.endDate.maxBlock
    } else {
      console.log('🔥 BINARY SEARCH FOR END DATE:', endDateKey)
      const endRange = await getBlockRangeForDate(endDate, requireExact)
      if (!endRange) {
        return null
      }
      maxBlock = endRange.maxBlock
      // Cache the end date result
      dateRangeCache.endDate = { date: endDateKey, maxBlock }
    }
    
    const result = { minBlock, maxBlock }
    console.log('🔥 FINAL DATE RANGE RESULT:', result)
    
    return result
  } catch (error) {
    logger.error('Failed to get block range for date range:', error)
    return null
  }
}

// Simple learning function for fetchQueue (optional)
export function learnFromBlockRange(minBlock: number, maxBlock: number, _confidence: number = 0.8) {
  // Just log for now - binary search doesn't need learning
  logger.debug(`FetchQueue used blocks ${minBlock}-${maxBlock}`)
}

// Clear cache (useful for testing or memory management)
export function clearDateBlockCache(): void {
  cache = {}
  blockCache = {}
  currentBlockAnchor = null
  dateRangeCache = {}
  logger.debug('All caches cleared')
}

// Get cache size for debugging
export function getCacheSize(): number {
  return Object.keys(cache).length
}

// Convert block range to actual date range using real block timestamps
export async function getDateRangeForBlockRange(minBlock: number, maxBlock: number): Promise<{ startDate: Date; endDate: Date } | null> {
  try {
    console.log('🔥 BLOCK→DATE CONVERSION - Fetching actual block info for:', { minBlock, maxBlock })
    
    const startBlockInfo = await fetchBlockInfo(minBlock)
    const endBlockInfo = await fetchBlockInfo(maxBlock)
    
    if (!startBlockInfo || !endBlockInfo) {
      logger.error(`Failed to fetch actual block info for ${minBlock} or ${maxBlock}`)
      return null
    }
    
    const result = {
      startDate: new Date(startBlockInfo.timestamp),
      endDate: new Date(endBlockInfo.timestamp)
    }
    
    console.log('🔥 BLOCK→DATE CONVERSION:', {
      blocks: { minBlock, maxBlock },
      actualBlockTimestamps: {
        startBlock: startBlockInfo.timestamp,
        endBlock: endBlockInfo.timestamp
      },
      dates: {
        start: result.startDate.toISOString(),
        end: result.endDate.toISOString()
      }
    })
    
    return result
  } catch (error) {
    logger.error('Failed to convert block range to dates:', error)
    return null
  }
}

// Validate date is within Arweave's operational timeframe
export function isValidArweaveDate(date: Date): boolean {
  const now = new Date()
  return date >= ARWEAVE_GENESIS_DATE && date <= now
}