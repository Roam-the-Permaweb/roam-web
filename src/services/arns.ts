import { ARIO } from "@ar.io/sdk";
import { logger } from "../utils/logger";
import { wayfinderService } from "./wayfinder";
import type {
  ArNSRecord,
  ArNSMetadata,
  ArNSFetchStrategy
} from "./arnsTypes";
import { 
  ArNSResolutionError, 
  ArNSTimeoutError, 
  ArNSNetworkError,
  ArNSInvalidResponseError 
} from "./arns/errors";

/**
 * ArNS Service - Manages ArNS name discovery and resolution
 * 
 * Features:
 * - Paginated fetching of ArNS names from AR.IO network
 * - Validation of ArNS names via HEAD requests
 * - Caching to prevent network spam
 * - Multiple sort strategies for variety
 */
class ArNSService {
  private cache: Map<string, ArNSRecord[]> = new Map();
  private validatedNames: Map<string, ArNSMetadata> = new Map();
  private lastFetchTime = 0;
  private currentStrategyIndex = 0;
  private seenNames = new Set<string>();
  private currentCursor: string | undefined;
  private hasMorePages = true;
  
  // Fetch strategies for variety
  private strategies: ArNSFetchStrategy[] = [
    { sortBy: 'startTimestamp', sortOrder: 'desc' }, // Newest names
    { sortBy: 'startTimestamp', sortOrder: 'asc' },  // Oldest names
    { sortBy: 'name', sortOrder: 'asc' },            // A-Z
    { sortBy: 'name', sortOrder: 'desc' },           // Z-A
  ];
  
  private readonly FETCH_COOLDOWN = 30000; // 30s between fetches
  private readonly PAGE_SIZE = 100; // Smaller pages for mobile
  private readonly VALIDATION_TIMEOUT = 5000; // 5s timeout for validation
  
  /**
   * Get next ArNS name (unvalidated)
   * Validation will happen lazily when actually needed
   */
  async getNextArNSName(): Promise<ArNSRecord | null> {
    // Ensure we have names available
    await this.ensureArNSNames();
    
    // Get an unvalidated name that hasn't been seen
    const unvalidatedNames = this.getUnvalidatedNames()
      .filter(name => !this.seenNames.has(name));
    
    if (unvalidatedNames.length === 0) {
      logger.debug('No unvalidated ArNS names available');
      return null;
    }
    
    // Pick a random unvalidated name
    const randomIndex = Math.floor(Math.random() * unvalidatedNames.length);
    const selectedName = unvalidatedNames[randomIndex];
    
    // Mark as seen to avoid re-selecting
    this.seenNames.add(selectedName);
    
    // Find the full record
    for (const records of this.cache.values()) {
      const record = records.find(r => r.name === selectedName);
      if (record) {
        return record;
      }
    }
    
    return null;
  }
  
  
  /**
   * Ensure we have ArNS names available
   */
  private async ensureArNSNames(): Promise<void> {
    // Check cooldown
    if (Date.now() - this.lastFetchTime < this.FETCH_COOLDOWN) {
      logger.debug('ArNS fetch on cooldown');
      return;
    }
    
    try {
      await this.fetchArNSPage();
      // Removed validateBatch() - validation now happens lazily
    } catch (error) {
      logger.error('Failed to fetch ArNS names:', error);
    }
  }
  
  /**
   * Fetch a page of ArNS names
   */
  private async fetchArNSPage(): Promise<void> {
    logger.info('Fetching ArNS page...');
    
    const io = ARIO.mainnet();
    const strategy = this.getCurrentStrategy();
    
    try {
      const response = await io.getArNSRecords({
        limit: this.PAGE_SIZE,
        sortBy: strategy.sortBy,
        sortOrder: strategy.sortOrder,
        cursor: this.currentCursor
      });
      
      logger.info(`Fetched ${response.items.length} ArNS names`);
      
      // Convert AR.IO SDK response to our ArNSRecord format
      const records: ArNSRecord[] = response.items.map((item) => ({
        name: item.name,
        processId: item.processId || '',
        type: item.type || 'lease',
        startTimestamp: item.startTimestamp || 0,
        endTimestamp: item.type === 'lease' ? item.endTimestamp : undefined,
        undernames: item.undernameLimit || 0,
        purchasePrice: item.purchasePrice
      }));
      
      // Cache the results
      const cacheKey = `${strategy.sortBy}-${strategy.sortOrder}`;
      this.cache.set(cacheKey, records);
      
      // Update pagination state
      this.hasMorePages = response.hasMore;
      this.currentCursor = response.nextCursor;
      
      // If no more pages, switch strategy
      if (!this.hasMorePages) {
        this.switchStrategy();
      }
      
      this.lastFetchTime = Date.now();
    } catch (error) {
      logger.error('Failed to fetch ArNS records:', error);
      // Switch strategy on error
      this.switchStrategy();
    }
  }
  
  
  /**
   * Get unvalidated names from cache
   */
  private getUnvalidatedNames(): string[] {
    const allNames = new Set<string>();
    
    // Collect all names from cache
    for (const records of this.cache.values()) {
      for (const record of records) {
        if (!this.validatedNames.has(record.name)) {
          allNames.add(record.name);
        }
      }
    }
    
    return Array.from(allNames);
  }
  
  /**
   * Validate a single ArNS name (now public for lazy validation)
   */
  async validateArNSName(name: string): Promise<string | null> {
    try {
      // Use Wayfinder to resolve the ArNS name to a gateway URL
      // This will handle the routing logic and return a resolved URL
      const resolvedUrl = await wayfinderService.resolveArUrl(`ar://${name}`);
      
      if (!resolvedUrl) {
        logger.warn('Failed to resolve ArNS name via Wayfinder, using fallback');
        // Fallback to direct gateway if Wayfinder is not available
        const fallbackGateway = wayfinderService.getFallbackGateway();
        const fallbackDomain = new URL(fallbackGateway).hostname;
        const fallbackUrl = `https://${name}.${fallbackDomain}`;
        return this.validateWithUrl(name, fallbackUrl, fallbackGateway);
      }
      
      // Extract gateway URL from resolved URL
      const gatewayUrl = new URL(resolvedUrl.toString()).origin;
      return this.validateWithUrl(name, resolvedUrl.toString(), gatewayUrl);
    } catch (error) {
      logger.debug(`[ArNS Resolution] Failed to resolve ${name}:`, error);
      
      // Re-throw with ArNS-specific error for better handling
      if (error instanceof Error) {
        throw new ArNSNetworkError(name, error);
      }
      throw error;
    }
  }
  
  /**
   * Validate ArNS name with a specific URL
   */
  private async validateWithUrl(name: string, url: string, gatewayUrl: string): Promise<string | null> {
    logger.debug(`[ArNS Resolution] Making HEAD request to resolve transaction ID for: ${name}`);
    
    // Make HEAD request with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.VALIDATION_TIMEOUT);
    
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 
          'Accept': '*/*'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      // Extract resolved transaction ID
      const resolvedId = response.headers.get('x-arns-resolved-id');
      
      if (resolvedId && response.ok) {
        logger.debug(`[ArNS Resolution] Resolved transaction ID: ${name} -> ${resolvedId}`);
        
        // Cache validation result
        this.validatedNames.set(name, {
          name,
          resolvedTxId: resolvedId,
          gatewayUrl,
          validatedAt: Date.now()
        });
        
        return resolvedId;
      } else if (!response.ok) {
        logger.warn(`[ArNS Resolution] Failed to resolve ${name}: HTTP ${response.status}`);
        throw new ArNSResolutionError(
          name, 
          `HTTP ${response.status} ${response.statusText}`,
          response.status
        );
      } else {
        logger.warn(`[ArNS Resolution] ${name} did not return x-arns-resolved-id header`);
        throw new ArNSInvalidResponseError(
          name,
          'Missing x-arns-resolved-id header in response'
        );
      }
    } catch (error) {
      clearTimeout(timeout);
      
      // Re-throw ArNS errors as-is
      if (error instanceof ArNSResolutionError || 
          error instanceof ArNSInvalidResponseError) {
        throw error;
      }
      
      // Wrap other errors
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ArNSTimeoutError(name, this.VALIDATION_TIMEOUT);
        }
        throw new ArNSNetworkError(name, error);
      }
      
      throw error;
    }
  }
  
  /**
   * Get current fetch strategy
   */
  private getCurrentStrategy(): ArNSFetchStrategy {
    return this.strategies[this.currentStrategyIndex];
  }
  
  /**
   * Switch to next strategy
   */
  private switchStrategy(): void {
    this.currentStrategyIndex = (this.currentStrategyIndex + 1) % this.strategies.length;
    this.currentCursor = undefined;
    this.hasMorePages = true;
    logger.info(`Switched to ArNS strategy: ${JSON.stringify(this.getCurrentStrategy())}`);
  }
  
  /**
   * Clear seen names (for reset)
   */
  clearSeenNames(): void {
    this.seenNames.clear();
    logger.debug('Cleared seen ArNS names');
  }
  
  /**
   * Get validated metadata for a name
   */
  getValidatedMetadata(name: string): ArNSMetadata | null {
    return this.validatedNames.get(name) || null;
  }
  
  /**
   * Get stats for debugging
   */
  getStats() {
    return {
      cachedRecords: Array.from(this.cache.values()).flat().length,
      validatedNames: this.validatedNames.size,
      seenNames: this.seenNames.size,
      currentStrategy: this.getCurrentStrategy(),
      hasMorePages: this.hasMorePages
    };
  }
}

// Create singleton instance
export const arnsService = new ArNSService();