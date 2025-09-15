import { ARIO } from "@ar.io/sdk";
import { logger } from "../utils/logger";
import { wayfinderService } from "./wayfinder";
import { GATEWAYS_GRAPHQL } from "../engine/query";
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
import type { TxMeta } from "../constants";

/**
 * ArNS Service - Manages ArNS name discovery and resolution
 * 
 * Features:
 * - Paginated fetching of ArNS names from AR.IO network
 * - Lightweight content type detection via HEAD requests
 * - Background metadata enhancement
 * - Caching to prevent network spam
 * - Multiple sort strategies for variety
 */
interface ResolvedTransaction {
  transaction: TxMeta;
  timestamp: number;
}

class ArNSService extends EventTarget {
  private cache: Map<string, ArNSRecord[]> = new Map();
  private validatedNames: Map<string, ArNSMetadata> = new Map();
  private resolvedTransactions: Map<string, ResolvedTransaction> = new Map();
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
  private readonly CACHE_TTL = 3600000; // 1 hour cache for resolved transactions
  
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
   * Get multiple ArNS records for batch resolution
   */
  async getMultipleArNSNames(count: number): Promise<ArNSRecord[]> {
    const records: ArNSRecord[] = [];
    
    for (let i = 0; i < count; i++) {
      const record = await this.getNextArNSName();
      if (!record) break;
      records.push(record);
    }
    
    return records;
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
    this.resolvedTransactions.clear(); // Also clear resolved cache
    logger.debug('Cleared seen ArNS names and resolution cache');
  }
  
  /**
   * Resolve ArNS record to a proper transaction
   * This is the main method for the new approach
   */
  async resolveArNSToTransaction(record: ArNSRecord): Promise<TxMeta | null> {
    // Check cache first
    const cached = this.resolvedTransactions.get(record.name);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.debug(`[ArNS] Using cached resolution for ${record.name}`);
      return cached.transaction;
    }
    
    try {
      // Resolve the ArNS name to get transaction ID
      logger.info(`[ArNS] Resolving ${record.name}...`);
      const resolvedId = await this.validateArNSName(record.name);
      
      if (!resolvedId) {
        logger.warn(`[ArNS] Failed to resolve ${record.name}`);
        return null;
      }
      
      // Get the gateway URL that was used for resolution
      const metadata = this.validatedNames.get(record.name);
      const gatewayUrl = metadata?.gatewayUrl || wayfinderService.getFallbackGateway();
      
      // Try to fetch real transaction metadata
      let transaction: TxMeta;
      
      try {
        // Use our configured GraphQL endpoint for transaction metadata
        // This is typically arweave-search.goldsky.com which has all transaction data
        const graphqlEndpoint = GATEWAYS_GRAPHQL[0];
        logger.debug(`[ArNS] Fetching metadata from ${graphqlEndpoint} for ${resolvedId}`);
        
        const response = await fetch(graphqlEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetTransaction($id: ID!) {
                transaction(id: $id) {
                  id
                  owner { address }
                  fee { ar }
                  quantity { ar }
                  tags { name value }
                  data { size }
                  block { height timestamp }
                  bundledIn { id }
                }
              }
            `,
            variables: { id: resolvedId }
          }),
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} from GraphQL endpoint`);
        }
        
        const result = await response.json();
        
        if (result.data?.transaction) {
          const txData = result.data.transaction;
          // Use real transaction data
          transaction = {
            id: txData.id,
            owner: txData.owner || { address: 'unknown' },
            fee: txData.fee || { ar: '0' },
            quantity: txData.quantity || { ar: '0' },
            tags: txData.tags || [],
            data: txData.data || { size: 0 },
            block: txData.block ? {
              height: txData.block.height,
              // Keep timestamp in seconds - UI expects seconds and will convert
              timestamp: txData.block.timestamp
            } : { height: 0, timestamp: Date.now() / 1000 },
            bundledIn: txData.bundledIn,
            arnsName: record.name,
            arnsProcessId: record.processId,
            arnsResolvedAt: Date.now(),
            arnsGateway: gatewayUrl
          };
          logger.info(`[ArNS] Fetched real transaction data for ${record.name} (owner: ${transaction.owner.address})`);
        } else {
          throw new Error('Transaction not found in GraphQL response');
        }
      } catch (metadataError) {
        logger.warn(`[ArNS] Could not fetch transaction metadata for ${resolvedId}, using fallback data`, metadataError);
        // Fallback: Create minimal transaction with just the ID
        // The owner will show as the transaction ID itself in the UI
        transaction = {
          id: resolvedId, // Real transaction ID!
          owner: { address: resolvedId }, // Use txID as owner so link still works
          fee: { ar: '0' },
          quantity: { ar: '0' },
          tags: [
            { name: 'ArNS-Name', value: record.name },
            { name: 'ArNS-Process-Id', value: record.processId }
          ],
          data: { size: 0 }, // Will be updated when content loads
          block: { 
            height: 0, 
            timestamp: Date.now() / 1000  // Keep in seconds for consistency
          },
          bundledIn: undefined,
          arnsName: record.name,
          arnsProcessId: record.processId,
          arnsResolvedAt: Date.now(),
          arnsGateway: gatewayUrl
        };
      }
      
      // Cache the resolved transaction
      this.resolvedTransactions.set(record.name, {
        transaction,
        timestamp: Date.now()
      });
      
      logger.info(`[ArNS] Successfully resolved ${record.name} to ${resolvedId}`);
      
      return transaction;
    } catch (error) {
      logger.error(`[ArNS] Failed to resolve ${record.name}:`, error);
      
      // Don't cache failures - might be temporary
      return null;
    }
  }
  
  /**
   * Lightweight content type detection for ArNS URLs using Wayfinder
   * Uses Wayfinder's routing strategy to find the right gateway
   */
  async detectContentType(arUrl: string): Promise<{ contentType: string | null; resolvedId: string | null; actualUrl?: string }> {
    try {
      // Extract ArNS name from ar:// URL
      const arnsName = arUrl.replace('ar://', '');
      
      // Use Wayfinder to resolve the ArNS name with selected routing strategy
      const resolvedUrl = await wayfinderService.resolveArUrl(arUrl);
      
      if (!resolvedUrl) {
        logger.warn(`[ArNS] Wayfinder could not resolve: ${arnsName}`);
        return { contentType: null, resolvedId: null };
      }
      
      const actualUrl = resolvedUrl.toString();
      logger.debug(`[ArNS] Wayfinder resolved ${arnsName} to: ${actualUrl}`);
      
      // Make HEAD request to the Wayfinder-resolved URL
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(actualUrl, {
        method: 'HEAD',
        headers: { 'Accept': '*/*' },
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        return { contentType: null, resolvedId: null, actualUrl };
      }
      
      const contentType = response.headers.get('content-type');
      const resolvedId = response.headers.get('x-arns-resolved-id');
      
      return { contentType, resolvedId, actualUrl };
    } catch (error) {
      logger.debug('Failed to detect content type for ArNS URL via Wayfinder:', error);
      return { contentType: null, resolvedId: null };
    }
  }
  
  /**
   * Fetch full metadata in background and emit event
   */
  async fetchMetadataInBackground(arnsName: string, resolvedId: string, gatewayUrl: string): Promise<void> {
    try {
      // Fetch transaction metadata
      const response = await fetch(`${gatewayUrl}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetTransaction($id: ID!) {
              transaction(id: $id) {
                id
                owner { address }
                fee { ar }
                quantity { ar }
                tags { name value }
                data { size }
                block { height timestamp }
                bundledIn { id }
              }
            }
          `,
          variables: { id: resolvedId }
        })
      });
      
      const result = await response.json();
      
      if (result.data?.transaction) {
        const tx = result.data.transaction;
        
        // Emit event with enhanced metadata
        this.dispatchEvent(new CustomEvent('arns-metadata-ready', {
          detail: {
            arnsName,
            resolvedId,
            transaction: tx,
            gatewayUrl // This is the gateway used for GraphQL query
          }
        }));
        
        logger.debug(`[ArNS] Background metadata fetched for ${arnsName}`);
      }
    } catch (error) {
      logger.warn(`[ArNS] Failed to fetch background metadata for ${arnsName}:`, error);
    }
  }
}

// Create singleton instance
export const arnsService = new ArNSService();