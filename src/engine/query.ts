import { logger } from "../utils/logger";
import { CONTENT_TYPES, APP_OWNERS, type MediaType, type TxMeta } from "../constants";

// --------------------------------------------------------------------------
// Configuration & Constants
// --------------------------------------------------------------------------
export const GATEWAYS_GRAPHQL =
  import.meta.env.VITE_GATEWAYS_GRAPHQL?.split(",") ?? [];
const PAGE_SIZE = 100;
export const DEFAULT_HEIGHT = 1666042;

// Progressive pagination constants - optimized for faster initial loads
export const INITIAL_PAGE_LIMIT = 1; // Fetch 1 page initially (100 transactions) for faster startup
export const REFILL_PAGE_LIMIT = 1;  // Fetch 1 page for refills (100 transactions)

// Rate limiting to prevent GraphQL overload - optimized for better UX
class RateLimiter {
  private requestTimes: number[] = [];
  private readonly maxRequests: number = 15; // 15 requests per minute per gateway (more reasonable)
  private readonly windowMs: number = 60000;

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(t => t > now - this.windowMs);
    
    if (this.requestTimes.length >= this.maxRequests) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = oldestRequest + this.windowMs - now + 500; // Add 0.5s buffer
      logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.requestTimes.push(now);
  }
}

const rateLimiter = new RateLimiter();

// Cursor storage for continuing pagination
interface StoredCursor {
  cursor: string;
  media: string;
  minHeight: number;
  maxHeight: number;
  owner?: string;
  appName?: string;
  timestamp: number;
}

const cursorStorage = new Map<string, StoredCursor>();
let cursorCleanupInterval: ReturnType<typeof setInterval> | null = null;

// Start cursor cleanup interval
function startCursorCleanup() {
  if (!cursorCleanupInterval) {
    cursorCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, cursor] of cursorStorage.entries()) {
        if (now - cursor.timestamp > 300000) { // 5 minute expiry
          cursorStorage.delete(key);
          logger.debug(`Cleaned up expired cursor for ${key}`);
        }
      }
    }, 60000); // Check every minute
  }
}

startCursorCleanup();

function getCursorKey(media: string, minHeight: number, maxHeight: number, owner?: string, appName?: string): string {
  return `${media}:${minHeight}-${maxHeight}:${owner || 'none'}:${appName || 'none'}`;
}

if (GATEWAYS_GRAPHQL.length === 0) {
  logger.error(
    "No GraphQL gateways defined – set VITE_GATEWAYS_GRAPHQL in .env"
  );
  throw new Error("Missing GraphQL gateways");
}

// --------------------------------------------------------------------------
// Fetch current block height from /info; fallback to a default if it fails
// --------------------------------------------------------------------------
export async function getCurrentBlockHeight(gateway: string): Promise<number> {
  try {
    const res = await fetch(`${gateway}/info`);
    if (!res.ok) throw new Error(`Info fetch failed: ${res.status}`);
    const json = await res.json();
    const height = json.height;
    if (typeof height !== "number") throw new Error("Invalid /info response");
    return height;
  } catch (err) {
    logger.warn("Failed to fetch current block height", err);
    return DEFAULT_HEIGHT;
  }
}

// --------------------------------------------------------------------------
// Public API: fetchTxsRange with pagination
// --------------------------------------------------------------------------
/**
 * Fetches all TxMeta for `media` between [minHeight, maxHeight], optionally filtering by owner.
 * Paginates through all pages using cursors until completion.
 */

async function fetchWithRetry(
  gw: string,
  payload: any,
  attempts = 3
): Promise<any> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < attempts; i++) {
    try {
      // Apply rate limiting
      await rateLimiter.waitIfNeeded();
      
      const res = await fetch(`${gw}/graphql`, payload);
      
      // Don't retry on client errors (4xx)
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`Client error: ${res.status} ${res.statusText}`);
      }
      
      const json = await res.json();
      if (json.errors?.length) {
        // Check if errors are retryable
        const errorMessages = json.errors.map((e: any) => e.message).join("; ");
        const isRetryable = errorMessages.includes('timeout') || 
                           errorMessages.includes('rate limit') ||
                           errorMessages.includes('server error');
        
        if (!isRetryable || i === attempts - 1) {
          throw new Error(errorMessages);
        }
        lastError = new Error(errorMessages);
      } else {
        return json.data;
      }
    } catch (err) {
      lastError = err as Error;
      
      // Don't retry on non-retryable errors
      if (err instanceof Error && err.message.startsWith('Client error:')) {
        throw err;
      }
      
      if (i < attempts - 1) {
        // Reduced exponential backoff with jitter for better UX
        const baseDelay = Math.min(500 * Math.pow(1.5, i), 3000); // Max 3s, gentler progression
        const jitter = Math.random() * baseDelay * 0.2; // ±20% jitter
        const totalDelay = Math.floor(baseDelay + jitter);
        
        logger.debug(`Retry ${i + 1}/${attempts} after ${totalDelay}ms delay`);
        await new Promise(r => setTimeout(r, totalDelay));
      }
    }
  }
  
  throw lastError || new Error('Unknown error in fetchWithRetry');
}

/**
 * Progressive pagination GraphQL fetching with cursor storage
 * @param pageLimit - Max number of pages to fetch (null = fetch all)
 * @param isRefill - Whether this is a background refill operation
 */
export async function fetchTxsRange(
  media: MediaType,
  minHeight: number,
  maxHeight: number,
  owner?: string,
  appName?: string,
  pageLimit: number | null = null,
  isRefill: boolean = false
): Promise<{ txs: TxMeta[], hasMore: boolean, cursor?: string }> {
  const ct = CONTENT_TYPES[media];

  // Set app-specific owner addresses for content curation
  if (appName && APP_OWNERS[appName]) {
    owner = APP_OWNERS[appName];
  }
  const ownersArg = owner ? `owners: ["${owner}"],` : "";
  const appNameArg = appName ? `{ name: "App-Name", values: "${appName}" }` : ""
  const entityTypeArg = media === 'arfs' ? `{ name: "Entity-Type", values: "file" }` : ""

  const query = `
    query FetchTxsRange(
      $ct: [String!]!,
      $min: Int!,
      $max: Int!,
      $first: Int!,
      $after: String
    ) {
      transactions(
        ${ownersArg}
        block: { min: $min, max: $max }
        tags: [
          { name: "Content-Type", values: $ct }
          ${entityTypeArg}
          ${appNameArg}
        ]
        sort: HEIGHT_DESC
        first: $first
        after: $after
      ) {
        edges {
          cursor
          node {
            id
            bundledIn { id }
            owner { address }
            fee { ar }
            quantity { ar }
            tags { name value }
            data { size }
            block { height timestamp }
          }
        }
        pageInfo {
          hasNextPage
        }
      }
  }`;

  // Check for stored cursor if this is a refill
  const cursorKey = getCursorKey(media, minHeight, maxHeight, owner, appName);
  let startCursor: string | null = null;
  
  if (isRefill) {
    const stored = cursorStorage.get(cursorKey);
    if (stored && Date.now() - stored.timestamp < 300000) { // 5 minute expiry
      startCursor = stored.cursor;
      logger.debug(`Using stored cursor for refill: ${startCursor.substring(0, 20)}...`);
    }
  }

  for (const rawGw of GATEWAYS_GRAPHQL) {
    const gw = rawGw.trim();
    try {
      let allTxs: TxMeta[] = [];
      let after: string | null = startCursor;
      let pageCount = 0;
      let hasNext = true;
      let lastCursor: string | undefined;

      while (hasNext && (pageLimit === null || pageCount < pageLimit)) {
        const variables = {
          ct,
          min: minHeight,
          max: maxHeight,
          first: PAGE_SIZE,
          after,
        };
        const payload = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-roam-client": "roam-mvp",
          },
          body: JSON.stringify({ query, variables }),
        };
        
        const data = await fetchWithRetry(gw, payload);
        const edges = data.transactions.edges;
        
        for (const edge of edges) {
          const tx: TxMeta = edge.node;
          if (!allTxs.find((t) => t.id === tx.id)) {
            allTxs.push(tx);
          }
        }
        
        hasNext = data.transactions.pageInfo.hasNextPage;
        // Get cursor from the last edge
        const lastEdge = edges[edges.length - 1];
        after = lastEdge ? lastEdge.cursor : null;
        lastCursor = after || undefined;
        pageCount++;
        
        logger.debug(`Fetched page ${pageCount}/${pageLimit || '∞'}, got ${edges.length} transactions, hasNext: ${hasNext}`);
      }

      // Store cursor for future continuation if there are more pages
      if (hasNext && lastCursor) {
        cursorStorage.set(cursorKey, {
          cursor: lastCursor,
          media,
          minHeight,
          maxHeight,
          owner,
          appName,
          timestamp: Date.now()
        });
        logger.debug(`Stored cursor for future pagination: ${lastCursor.substring(0, 20)}...`);
      } else {
        // No more pages, remove stored cursor
        cursorStorage.delete(cursorKey);
      }

      return {
        txs: allTxs,
        hasMore: hasNext,
        cursor: lastCursor
      };
    } catch (err) {
      logger.warn(`Gateway ${gw} failed after retries:`, err);
    }
  }

  throw new Error("All gateways failed – unable to fetchTxsRange");
}

export async function fetchTxMetaById(txid: string): Promise<TxMeta> {
  const query = `
    query FetchTxById($id: [ID!]!) {
      transactions(ids: $id) {
        edges {
          node {
            id
            bundledIn { id }
            owner { address }
            fee { ar }
            quantity { ar }
            tags { name value }
            data { size }
            block { height timestamp }
          }
        }
      }
    }
  `;

  const variables = { id: [txid] };

  for (const rawGw of GATEWAYS_GRAPHQL) {
    const gw = rawGw.trim();
    const payload = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-roam-client": "roam-mvp",
      },
      body: JSON.stringify({ query, variables }),
    };

    try {
      const data = await fetchWithRetry(gw, payload);
      const edges = data?.transactions?.edges;
      if (!edges || !edges.length) throw new Error("No transaction found");

      return edges[0].node as TxMeta;
    } catch (err) {
      logger.warn(`Gateway ${gw} failed for tx ${txid}:`, err);
    }
  }

  throw new Error("All gateways failed – unable to fetch tx by ID");
}
