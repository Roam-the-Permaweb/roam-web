/**
 * Fetch Queue - Core Content Discovery Engine
 * 
 * Implements a sliding window algorithm for efficiently discovering Arweave content:
 * 
 * Algorithm Overview:
 * - "New" content: Slides from recent blocks downward (most recent first)  
 * - "Old" content: Random windows in blocks 100K-1.6M range
 * - Window size: 10K blocks per fetch for optimal GraphQL performance
 * - Auto-refills queue when <3 items remain to prevent loading delays
 * 
 * Content Discovery Strategy:
 * - Maintains background transaction queue with smart prefetching
 * - Filters by content type using GraphQL tag queries
 * - Handles ArFS metadata fetching for file references
 * - 404-resistant design with automatic content skipping
 * 
 * Performance Features:
 * - Sliding window prevents revisiting same content
 * - Background refilling maintains smooth UX
 * - Efficient GraphQL queries with proper pagination
 * - Gateway failover for reliable content delivery
 */
import { fetchTxsRange, getCurrentBlockHeight, INITIAL_PAGE_LIMIT, REFILL_PAGE_LIMIT } from "./query";
import { logger } from "../utils/logger";
import { learnFromBlockRange } from "../utils/dateBlockUtils";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { arnsService } from "../services/arns";
import { wayfinderService } from "../services/wayfinder";
import {
  type TxMeta,
  type Channel,
  MIN_OLD_BLOCK,
  MAX_RETRY_ATTEMPTS,
  WINDOW_SIZE,
} from "../constants";

// Read and trim configured gateways (handle both singular and plural env var names)
const rawGateways =
  (import.meta.env.VITE_GATEWAYS_DATA_SOURCE || import.meta.env.VITE_GATEWAY_DATA_SOURCE || "self")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

// Remove unused fallbackGateway variable

// Build GATEWAY_DATA_SOURCE array with 'self' mapping logic
export const GATEWAY_DATA_SOURCE: string[] = rawGateways
  .map((gw: string) => {
    if (gw !== "self") {
      return gw;
    }

    // “self” → derive from window.location
    const { protocol, hostname, port } = window.location;
    // e.g. hostname = "roam_vilenarios.ardrive.net"
    // split into [ "roam_vilenarios", "ardrive", "net" ]
    const parts = hostname.toLowerCase().split(".");

    // if localhost or .ar.io domain, use arweave.net
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".ar.io") ||
      hostname === "ar.io"
    ) {
      return "https://arweave.net";
    }

    // drop exactly the first segment if there are >2 parts
    let gatewayHost: string;
    if (parts.length > 2) {
      // ["ardrive","net"]  or ["ar","permagate","io"]
      gatewayHost = parts.slice(1).join(".");
    } else {
      // e.g. ["ardrive","net"]
      gatewayHost = hostname;
    }

    // re-build the origin, preserving port if present
    const portSuffix = port ? `:${port}` : "";
    return `${protocol}//${gatewayHost}${portSuffix}`;
  })
  .filter(Boolean);

// Ensure we have at least one gateway
if (GATEWAY_DATA_SOURCE.length === 0) {
  GATEWAY_DATA_SOURCE.push("https://arweave.net");
}

/** How many items left in the queue before triggering a background refill */
const REFILL_THRESHOLD = 3;

/** In-memory queue of upcoming transactions for the current channel */
let queue: TxMeta[] = [];

/** Prevent concurrent background refills */
let isRefilling = false;


/** Simple mutex for queue operations to prevent race conditions */
class Mutex {
  private locked = false;
  private waitQueue: (() => void)[] = [];

  async acquire(): Promise<void> {
    while (this.locked) {
      await new Promise<void>(resolve => this.waitQueue.push(resolve));
    }
    this.locked = true;
  }

  release(): void {
    this.locked = false;
    const resolve = this.waitQueue.shift();
    if (resolve) resolve();
  }
}

const queueMutex = new Mutex();

/** Track seen IDs to avoid repeats across sessions */
const seenIds = new Set<string>();
const SEEN_IDS_KEY = 'roam_seen_ids_v1';
const MAX_SEEN_IDS = 10000; // Limit storage size

/** Load seen IDs from IndexedDB */
async function loadSeenIds(): Promise<void> {
  try {
    const stored = await idbGet(SEEN_IDS_KEY);
    if (stored && Array.isArray(stored)) {
      stored.forEach(id => seenIds.add(id));
      logger.debug(`Loaded ${stored.length} seen IDs from storage`);
    }
  } catch (err) {
    logger.warn('Failed to load seen IDs from storage', err);
  }
}

/** Save seen IDs to IndexedDB (limited to prevent infinite growth) */
async function saveSeenIds(): Promise<void> {
  try {
    const idsArray = Array.from(seenIds);
    // Keep only the most recent IDs if we exceed the limit
    const toSave = idsArray.slice(-MAX_SEEN_IDS);
    await idbSet(SEEN_IDS_KEY, toSave);
    logger.debug(`Saved ${toSave.length} seen IDs to storage`);
  } catch (err) {
    logger.warn('Failed to save seen IDs to storage', err);
  }
}

/** Sliding-window "max" per Channel key (media+recency) */
const newMaxMap: Record<string, number> = {};

function channelKey(c: Channel): string {
  return `${c.media}::${c.recency}`;
}

/**
 * Slide a WINDOW_SIZE-block window backwards for "new" channel
 */
async function slideNewWindow(
  channel: Channel
): Promise<{ min: number; max: number }> {
  const key = channelKey(channel);
  if (!(key in newMaxMap)) {
    // Seed a bit behind the tip
    const height = await getCurrentBlockHeight(GATEWAY_DATA_SOURCE[0]);
    newMaxMap[key] = Math.max(1, height - 15);
  }
  const max = newMaxMap[key];
  const min = Math.max(1, max - WINDOW_SIZE + 1);
  newMaxMap[key] = min - 1;
  return { min, max };
}

/**
 * Pick a random WINDOW_SIZE-block window for "old" channel
 * Enhanced with better randomization to reduce duplicate chances
 */
async function pickOldWindow(): Promise<{ min: number; max: number }> {
  const current = await getCurrentBlockHeight(GATEWAY_DATA_SOURCE[0]);
  const rawCutoff = current - WINDOW_SIZE;
  if (rawCutoff <= MIN_OLD_BLOCK) {
    return { min: 1, max: current };
  }
  const startFloor = MIN_OLD_BLOCK;
  const startCeil = rawCutoff;
  
  // Use crypto.getRandomValues for better randomness
  const randomArray = new Uint32Array(1);
  crypto.getRandomValues(randomArray);
  const randomValue = randomArray[0] / (0xffffffff + 1); // Convert to 0-1 range
  
  const min = Math.floor(randomValue * (startCeil - startFloor + 1)) + startFloor;
  const max = min + WINDOW_SIZE - 1;
  return { min, max };
}

/**
 * Fetch transactions in a given block window with progressive pagination
 * @param isRefill - Whether this is a background refill (uses smaller page limit)
 */
async function fetchWindow(
  media: Channel["media"],
  min: number,
  max: number,
  owner?: string,
  appName?: string,
  isRefill: boolean = false
): Promise<TxMeta[]> {
  // Special handling for ArNS channel
  if (media === 'arns') {
    return fetchArNSWindow();
  }
  
  const pageLimit = isRefill ? REFILL_PAGE_LIMIT : INITIAL_PAGE_LIMIT;
  const result = await fetchTxsRange(media, min, max, owner, appName, pageLimit, isRefill);
  
  if (result.hasMore && !isRefill) {
    logger.debug(`Fetched ${result.txs.length} transactions, more available for future refills`);
  }
  
  return result.txs;
}

/**
 * Fetch ArNS names without validation (validation happens on-demand)
 */
async function fetchArNSWindow(): Promise<TxMeta[]> {
  const transactions: TxMeta[] = [];
  const targetCount = INITIAL_PAGE_LIMIT;
  
  logger.info('Fetching ArNS names (no background validation)...');
  
  // Fetch ArNS names without validation - they'll be validated on-demand
  while (transactions.length < targetCount) {
    const arnsRecord = await arnsService.getNextArNSName();
    
    if (!arnsRecord) {
      logger.warn('No more ArNS names available');
      break;
    }
    
    // Create a placeholder transaction for the ArNS name
    // This will be validated and resolved when the user navigates to it
    const placeholderTx: TxMeta = {
      id: `arns:${arnsRecord.name}`, // Use a placeholder ID
      owner: { address: 'arns-placeholder' },
      fee: { ar: '0' },
      quantity: { ar: '0' },
      tags: [
        { name: 'Content-Type', value: 'text/html' },
        { name: 'ArNS-Name', value: arnsRecord.name }
      ],
      data: { size: 0 },
      block: { height: 0, timestamp: Date.now() },
      bundledIn: undefined,
      arnsName: arnsRecord.name,
      arnsGateway: undefined, // Will be resolved on-demand
      needsValidation: true // Flag to indicate this needs validation
    };
    
    transactions.push(placeholderTx);
    logger.debug(`Added ArNS placeholder: ${arnsRecord.name}`);
  }
  
  logger.info(`Fetched ${transactions.length} ArNS names (validation on-demand)`);
  return transactions;
}

/**
 * Get next transaction or trigger background refill
 */
export async function getNextTx(channel: Channel, recursionDepth: number = 0): Promise<TxMeta | null> {
  // Prevent infinite recursion for ArFS failures
  if (recursionDepth > 10) {
    logger.error(`ArFS recursion limit reached (${recursionDepth}), aborting to prevent infinite loop`);
    return null;
  }
  
  // Use mutex to prevent race conditions
  await queueMutex.acquire();
  
  try {
    // synchronous refill if empty
    if (queue.length === 0) {
      logger.debug("Queue empty — blocking refill");
      queueMutex.release(); // Release before async operation
      await initFetchQueue(channel);
      await queueMutex.acquire(); // Re-acquire after
    }

    // background refill if below threshold
    if (queue.length < REFILL_THRESHOLD && !isRefilling) {
      isRefilling = true;
      logger.debug("Queue low — background refill");
      // Don't await - let it run in background
      initFetchQueue(channel, {}, true) // true = isRefill
        .catch((e) => logger.warn("Background refill failed", e))
        .finally(() => {
          isRefilling = false;
        });
    }

    const tx = queue.shift();
    
    // Mark transaction as seen when consumed
    if (tx) {
      seenIds.add(tx.id);
      saveSeenIds().catch(err => logger.warn('Failed to persist seen IDs', err));
    }
    
    // Process ArFS transactions
    if (tx && channel.media === 'arfs') {
      const entityType = getTagValue(tx.tags, "Entity-Type");
      if (entityType !== "file") {
        logger.debug("Skipping non-ArFS file transaction");
        // Don't release mutex here - let finally block handle it
        return getNextTx(channel, recursionDepth + 1); // recursively try next
      }

      try {
        // Keep mutex locked during ArFS processing to prevent race conditions
        
        logger.debug(`Fetching ArFS metadata for transaction: ${tx.id}`);
        
        // Use Wayfinder for ArFS metadata fetching to ensure proper routing and verification
        const contentResponse = await wayfinderService.getContentUrl({
          txId: tx.id,
          contentType: 'application/json',
          size: tx.data.size
        });
        
        logger.debug(`ArFS content response:`, contentResponse);
        
        // For ArFS, we need to fetch the metadata JSON, not use the blob data
        if (!contentResponse.url) {
          throw new Error(`No URL returned from Wayfinder for ArFS metadata ${tx.id}`);
        }
        
        logger.debug(`Fetching ArFS metadata from URL: ${contentResponse.url}`);
        const response = await fetch(contentResponse.url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const responseText = await response.text();
        
        logger.debug(`ArFS content preview: ${responseText.substring(0, 200)}`);
        
        // Check if response looks like JSON
        if (!responseText.trim().startsWith('{') && !responseText.trim().startsWith('[')) {
          throw new Error(`Expected JSON but got: ${responseText.substring(0, 100)}`);
        }
        
        const metadata = JSON.parse(responseText);

        const {
          dataTxId,
          name,
          size,
          dataContentType,
          ...rest
        } = metadata;

        if (!dataTxId || !dataContentType) {
          throw new Error(`Invalid ArFS metadata: missing dataTxId or dataContentType`);
        }

        tx.arfsMeta = {
          dataTxId,
          name,
          size,
          contentType: dataContentType,
          customTags: rest,
        };

        logger.debug(`Successfully parsed ArFS metadata for ${tx.id}: ${name} (${dataContentType})`);

        // Filter out octet-stream content types that can't be rendered
        if (dataContentType === 'application/octet-stream') {
          logger.debug(`Skipping ArFS file with octet-stream content type: ${tx.id}`);
          return getNextTx(channel, recursionDepth + 1); // Skip to next transaction
        }

      } catch (err) {
        logger.error(`Failed to load ArFS metadata for ${tx.id}:`, err);
        
        // If we're hitting too many errors, return null to prevent infinite loop
        if (recursionDepth >= 3) {
          logger.error(`Too many consecutive ArFS failures (depth: ${recursionDepth}), stopping`);
          return null;
        }
        
        return getNextTx(channel, recursionDepth + 1); // try next tx
      }
    }

    if (!tx) {
      logger.warn("No transactions available after refill");
      return null;
    }
    return tx;
  } finally {
    queueMutex.release();
  }
}

/**
 * Clear the seen IDs set to allow re-exploring content
 */
export function clearSeenIds(): void {
  seenIds.clear();
  arnsService.clearSeenNames();
  logger.debug("Cleared seen IDs set and ArNS seen names");
}


export async function initFetchQueue(
  channel: Channel,
  options: {
    initialTx?: TxMeta;
    minBlock?: number;
    maxBlock?: number;
    ownerAddress?: string;
    appName?: string;
  } = {},
  isRefill: boolean = false
): Promise<{ min: number; max: number }> {
  logger.info("Initializing fetch queue", { channel, options });
  
  // Load seen IDs on first init (not on refills)
  if (!isRefill && seenIds.size === 0) {
    await loadSeenIds();
  }

  let txs: TxMeta[] = [];
  let min = 0;
  let max = 0;

  // —— 1a) Deep-link by txId + explicit range ——
  if (
    options.initialTx &&
    options.minBlock != null &&
    options.maxBlock != null
  ) {
    // Don't mark initialTx as seen - let user view it first
    const { minBlock: rangeMin, maxBlock: rangeMax, ownerAddress, appName } = options;
    const owner = ownerAddress ?? channel.ownerAddress;
    const appNameToUse = appName ?? channel.appName;

    logger.info(`Deep-link by ID+range; subset within ${rangeMin}-${rangeMax}`);
    for (let i = 0; i < MAX_RETRY_ATTEMPTS && txs.length === 0; i++) {
      if (rangeMax - rangeMin + 1 <= WINDOW_SIZE) {
        min = rangeMin;
        max = rangeMax;
      } else {
        const start =
          Math.floor(Math.random() * (rangeMax - rangeMin - WINDOW_SIZE + 2)) +
          rangeMin;
        min = start;
        max = start + WINDOW_SIZE - 1;
      }
      logger.debug(`Attempt ${i + 1}/${MAX_RETRY_ATTEMPTS} → ${min}-${max}`);
      txs = await fetchWindow(channel.media, min, max, owner, appNameToUse, isRefill);
    }

    // —— 1b) Deep-link by txId only ——
  } else if (options.initialTx) {
    // Don't mark initialTx as seen - let user view it first
    const owner = options.ownerAddress ?? options.initialTx.owner.address;
    const appNameToUse = options.appName;
    logger.info(`Deep-link by ID only; bucket-mode fallback`);
    for (let i = 0; i < MAX_RETRY_ATTEMPTS && txs.length === 0; i++) {
      if (channel.recency === "new") {
        const w = await slideNewWindow(channel);
        min = w.min;
        max = w.max;
      } else {
        const w = await pickOldWindow();
        min = w.min;
        max = w.max;
      }
      logger.debug(`Attempt ${i + 1}/${MAX_RETRY_ATTEMPTS} → ${min}-${max}`);
      txs = await fetchWindow(channel.media, min, max, owner, appNameToUse, isRefill);
    }

    // —— 2) Deep-link by explicit range only ——
  } else if (options.minBlock != null && options.maxBlock != null) {
    const { minBlock: rangeMin, maxBlock: rangeMax, ownerAddress, appName } = options;
    const owner = ownerAddress ?? channel.ownerAddress;
    const appNameToUse = appName ?? channel.appName;

    logger.info(`Deep-link by range only ${rangeMin}-${rangeMax}`);
    for (let i = 0; i < MAX_RETRY_ATTEMPTS && txs.length === 0; i++) {
      if (rangeMax - rangeMin + 1 <= WINDOW_SIZE) {
        min = rangeMin;
        max = rangeMax;
      } else {
        const start =
          Math.floor(Math.random() * (rangeMax - rangeMin - WINDOW_SIZE + 2)) +
          rangeMin;
        min = start;
        max = start + (WINDOW_SIZE * i) - 1; // increase window size for each attempt
      }
      logger.info(`Attempt ${i + 1}/${MAX_RETRY_ATTEMPTS} → ${min}-${max}`);
      txs = await fetchWindow(channel.media, min, max, owner, appNameToUse, isRefill);
    }

    // —— 3) Deep-link by owner only (no TX, no range) ——
  } else if (options.ownerAddress) {
    min = 1;
    max = await getCurrentBlockHeight(GATEWAY_DATA_SOURCE[0]);
    logger.info(`Deep-link by owner only; full range ${min}-${max}`);
    txs = await fetchWindow(channel.media, min, max, options.ownerAddress, options.appName, isRefill);

    // —— 4) No deep-link params: normal bucket mode ——
  } else if (channel.ownerAddress && !options.ownerAddress) {
    // only apply this when user manually toggles owner, not on deep-link owner
    min = 1;
    max = await getCurrentBlockHeight(GATEWAY_DATA_SOURCE[0]);
    logger.info(
      `Getting full history for owner ${channel.ownerAddress}: ${min}-${max}`
    );
    txs = await fetchWindow(channel.media, min, max, channel.ownerAddress, channel.appName, isRefill);
  } else {
    logger.info(
      `Bucket-mode (“${channel.recency}”) with up to ${MAX_RETRY_ATTEMPTS} attempts`
    );
    for (let i = 0; i < MAX_RETRY_ATTEMPTS && txs.length === 0; i++) {
      if (channel.recency === "new") {
        const w = await slideNewWindow(channel);
        min = w.min;
        max = w.max;
      } else {
        const w = await pickOldWindow();
        min = w.min;
        max = w.max;
      }
      logger.debug(`Attempt ${i + 1}/${MAX_RETRY_ATTEMPTS} → ${min}-${max}`);
      txs = await fetchWindow(channel.media, min, max, channel.ownerAddress, options.appName, isRefill);
    }
  }

  // —— 6) Dedupe & enqueue ——
  const newTxs = txs.filter((tx) => !seenIds.has(tx.id));
  // Don't mark as seen until actually viewed by user
  
  // Shuffle the transactions for better randomness
  const shuffled = [...newTxs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    const j = Math.floor((randomArray[0] / (0xffffffff + 1)) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  // Update queue with mutex protection
  await queueMutex.acquire();
  try {
    queue = shuffled;
    logger.info(`Queue loaded with ${queue.length} txs (shuffled)`);
  } finally {
    queueMutex.release();
  }

  // Learn from this block range for future estimation accuracy
  if (min > 0 && max > min) {
    learnFromBlockRange(min, max, 0.8);
  }


  // —— 7) Return the actual window ——
  return { min, max };
}

function getTagValue(tags: { name: string; value: string }[], name: string): string | undefined {
  const tag = tags.find(t => t.name === name);
  return tag?.value;
}
