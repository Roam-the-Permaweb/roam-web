/**
 * ArNS (Arweave Name System) types and interfaces
 */

export interface ArNSRecord {
  name: string;
  processId: string;
  type: 'lease' | 'permabuy';
  startTimestamp: number;
  endTimestamp?: number;
  undernames: number;
  purchasePrice?: number;
}

export interface ArNSMetadata {
  name: string;
  resolvedTxId: string;
  gatewayUrl: string;      // Gateway that resolved this name
  ttl?: number;
  validatedAt: number;
  isDefaultId?: boolean;   // Flag for default IDs
}

export interface ArNSPaginatedResponse {
  items: ArNSRecord[];
  hasMore: boolean;
  nextCursor?: string;
  totalItems: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export type ArNSSortBy = 'name' | 'processId' | 'endTimestamp' | 'startTimestamp' | 'type' | 'undernames';

export interface ArNSFetchStrategy {
  sortBy: ArNSSortBy;
  sortOrder: 'asc' | 'desc';
}