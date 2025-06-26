// --------------------------------------------------------------------------
// Constants, Types & Interfaces
// --------------------------------------------------------------------------
export type MediaType =
  | "images"
  | "videos"
  | "music"
  | "websites"
  | "text"
  | "everything"
  | "arfs"
  | "arns";
export type Recency = "new" | "old";
export interface Channel {
  media: MediaType;
  recency: Recency;
  ownerAddress?: string; // optional Arweave address filter
  appName?: string; // optional App-Name filter
}

export const MEDIA_TYPES: MediaType[] = [
  "images",
  "videos",
  "music",
  "websites",
  "text",
  "everything",
  "arfs",
  "arns",
];

/**
 * Internal structure of saved history
 */
export interface HistoryState {
  index: number;
  items: TxMeta[];
}

export interface TxMeta {
  id: string;
  bundledIn?: { id: string };
  owner: { address: string };
  fee: { ar: string };
  quantity: { ar: string };
  tags: { name: string; value: string }[];
  data: { size: number };
  block: { height: number; timestamp: number };
  arfsMeta?: {
    dataTxId: string;
    name: string;
    size: number;
    contentType: string;
    customTags: Record<string, string>;
  };
  arnsName?: string; // The ArNS name that resolved to this content
}

// --------------------------------------------------------------------------
// Content-Type mapping per media
// --------------------------------------------------------------------------
const BASE_CONTENT_TYPES: Record<Exclude<MediaType, "everything">, string[]> = {
  images: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/avif"],
  videos: ["video/mp4", "video/webm", "video/ogg"],
  music: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4", "audio/flac"],
  websites: ["application/x.arweave-manifest+json", "text/html", "application/xhtml+xml"],
  text: ["text/markdown", "application/pdf"],
  arfs: ["application/json"], // this ensures only public arfs files
  arns: [] // ArNS doesn't filter by content type, it resolves names to any content
};

// Build full map including "everything" as the union of all other arrays
export const CONTENT_TYPES: Record<MediaType, string[]> = {
  ...BASE_CONTENT_TYPES,
  everything: Object.values(BASE_CONTENT_TYPES).reduce<string[]>((acc, arr) => {
    arr.forEach((ct) => {
      if (!acc.includes(ct) && ct !== 'application/json') acc.push(ct);
    });
    return acc;
  }, []),
};

export const HISTORY_KEY = "roam-history";
export const ADVERTIZEMENT_TIMER = 5;
export const MIN_AD_CLICKS = 50;
export const MAX_AD_CLICKS = 50;
/** Minimum block for "old" windows */
export const MIN_OLD_BLOCK = 100_000;
export const MAX_RETRY_ATTEMPTS = 8;
/** Base window size (blocks) */
export const WINDOW_SIZE = 10_000;

// Media loading thresholds (in bytes)
export const IMAGE_LOAD_THRESHOLD = 25 * 1024 * 1024; // 25MB
export const VIDEO_LOAD_THRESHOLD = 200 * 1024 * 1024; // 200MB
export const AUDIO_LOAD_THRESHOLD = 50 * 1024 * 1024; // 50MB
export const TEXT_LOAD_THRESHOLD = 10 * 1024 * 1024; // 10MB

// Touch/swipe gesture constants
export const DEFAULT_SWIPE_THRESHOLD = 50; // px
export const DEFAULT_SWIPE_TIME_LIMIT = 500; // ms
export const APP_SWIPE_THRESHOLD = 75; // px - stricter for app navigation
export const APP_SWIPE_TIME_LIMIT = 300; // ms

// Date range defaults
export const DEFAULT_DATE_RANGE_DAYS = 30;

// UI timeout constants
export const IFRAME_LOAD_TIMEOUT = 4000; // ms
export const FADE_IN_DELAY = 100; // ms

// App-specific owner addresses for content curation
export const APP_OWNERS: Record<string, string> = {
  'Paragraph': 'w5AtiFsNvORfcRtikbdrp2tzqixb05vdPw-ZhgVkD70',
  'Manifold': 'NVkSolD-1AJcJ0BMfEASJjIuak3Y6CvDJZ4XOIUbU9g'
};
