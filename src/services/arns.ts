import { ARIO } from "@ar.io/sdk";
import { logger } from "../utils/logger";
import { wayfinderService } from "./wayfinder";
import type {
  ArNSRecord,
  ArNSMetadata,
  ArNSFetchStrategy
} from "./arnsTypes";

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
  
  // Default ArNS resolver IDs that should be filtered out
  private readonly DEFAULT_IDS = new Set([
    'oork_YifB3-JQQZg8EgMPQJytua_QCHKmMqt5kmnCo', // ArNS resolver
    // Add other default IDs as needed
  ]);
  
  // Fetch strategies for variety
  private strategies: ArNSFetchStrategy[] = [
    { sortBy: 'startTimestamp', sortOrder: 'desc' }, // Newest names
    { sortBy: 'startTimestamp', sortOrder: 'asc' },  // Oldest names
    { sortBy: 'name', sortOrder: 'asc' },            // A-Z
    { sortBy: 'name', sortOrder: 'desc' },           // Z-A
  ];
  
  private readonly FETCH_COOLDOWN = 30000; // 30s between fetches
  private readonly PAGE_SIZE = 50; // Smaller pages for mobile
  private readonly VALIDATION_TIMEOUT = 5000; // 5s timeout for validation
  
  /**
   * Check if a transaction ID is a default ID
   */
  isDefaultId(txId: string): boolean {
    return this.DEFAULT_IDS.has(txId);
  }
  
  /**
   * Get next validated ArNS name
   */
  async getNextArNSName(): Promise<ArNSMetadata | null> {
    // Try to get from validated cache first
    const cached = this.getFromValidatedCache();
    if (cached) return cached;
    
    // Fetch and validate new names
    await this.ensureArNSNames();
    
    // Try again from cache
    return this.getFromValidatedCache();
  }
  
  /**
   * Get a validated name from cache
   */
  private getFromValidatedCache(): ArNSMetadata | null {
    const validNames = Array.from(this.validatedNames.values())
      .filter(meta => 
        !this.seenNames.has(meta.name) && 
        !meta.isDefaultId  // Filter out default IDs
      );
    
    if (validNames.length === 0) return null;
    
    // Pick a random validated name
    const randomIndex = Math.floor(Math.random() * validNames.length);
    const selected = validNames[randomIndex];
    
    // Mark as seen
    this.seenNames.add(selected.name);
    
    return selected;
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
      await this.validateBatch();
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
        sortBy: strategy.sortBy as any, // SDK types might not match exactly
        sortOrder: strategy.sortOrder as any,
        cursor: this.currentCursor
      });
      
      logger.info(`Fetched ${response.items.length} ArNS names`);
      
      // Convert AR.IO SDK response to our ArNSRecord format
      const records: ArNSRecord[] = response.items.map((item: any) => ({
        name: item.name,
        processId: item.processId || '',
        type: item.type || 'lease',
        startTimestamp: item.startTimestamp || 0,
        endTimestamp: item.endTimestamp,
        undernames: item.undernames || 0,
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
   * Validate a batch of ArNS names
   */
  private async validateBatch(): Promise<void> {
    const unvalidatedNames = this.getUnvalidatedNames();
    if (unvalidatedNames.length === 0) return;
    
    logger.info(`Validating ${unvalidatedNames.length} ArNS names...`);
    
    // Validate in parallel but limit concurrency
    const batchSize = 5;
    for (let i = 0; i < unvalidatedNames.length; i += batchSize) {
      const batch = unvalidatedNames.slice(i, i + batchSize);
      await Promise.all(batch.map(name => this.validateArNSName(name)));
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
   * Validate a single ArNS name
   */
  private async validateArNSName(name: string): Promise<string | null> {
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
      logger.debug(`ArNS validation failed for ${name}:`, error);
    }
    
    return null;
  }
  
  /**
   * Validate ArNS name with a specific URL
   */
  private async validateWithUrl(name: string, url: string, gatewayUrl: string): Promise<string | null> {
    logger.debug(`Validating ArNS name ${name} using URL: ${url}`);
    
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
        logger.debug(`Validated ArNS name: ${name} -> ${resolvedId}`);
        
        // Check if it's a default ID
        const isDefault = this.isDefaultId(resolvedId);
        if (isDefault) {
          logger.debug(`Skipping default ID: ${resolvedId} for ArNS name: ${name}`);
        }
        
        // Cache validation result (including default IDs for tracking)
        this.validatedNames.set(name, {
          name,
          resolvedTxId: resolvedId,
          gatewayUrl,
          validatedAt: Date.now(),
          isDefaultId: isDefault
        });
        
        return resolvedId;
      } else if (!response.ok) {
        logger.warn(`ArNS validation failed for ${name}: HTTP ${response.status}`);
      } else {
        logger.warn(`ArNS name ${name} did not return x-arns-resolved-id header`);
      }
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
    
    return null;
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