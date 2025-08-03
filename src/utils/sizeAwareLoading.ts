/**
 * Size-aware loading utilities
 * Handles bandwidth-conscious content loading decisions
 */

import {
  IMAGE_LOAD_THRESHOLD,
  VIDEO_LOAD_THRESHOLD,
  AUDIO_LOAD_THRESHOLD,
  TEXT_LOAD_THRESHOLD,
} from '../constants';

export interface LoadingDecision {
  shouldAutoLoad: boolean;
  thresholdExceeded: boolean;
  threshold: number;
  contentCategory: 'image' | 'video' | 'audio' | 'text' | 'other';
}

/**
 * Determines if content should be automatically loaded based on type and size
 */
export function getLoadingDecision(
  contentType: string,
  size: number
): LoadingDecision {
  // Determine content category and threshold
  if (contentType.startsWith('image/')) {
    return {
      shouldAutoLoad: size <= IMAGE_LOAD_THRESHOLD,
      thresholdExceeded: size > IMAGE_LOAD_THRESHOLD,
      threshold: IMAGE_LOAD_THRESHOLD,
      contentCategory: 'image',
    };
  }

  if (contentType.startsWith('video/')) {
    return {
      shouldAutoLoad: size <= VIDEO_LOAD_THRESHOLD,
      thresholdExceeded: size > VIDEO_LOAD_THRESHOLD,
      threshold: VIDEO_LOAD_THRESHOLD,
      contentCategory: 'video',
    };
  }

  if (contentType.startsWith('audio/')) {
    return {
      shouldAutoLoad: size <= AUDIO_LOAD_THRESHOLD,
      thresholdExceeded: size > AUDIO_LOAD_THRESHOLD,
      threshold: AUDIO_LOAD_THRESHOLD,
      contentCategory: 'audio',
    };
  }

  if (
    contentType.startsWith('text/') ||
    ['text/plain', 'text/markdown'].includes(contentType)
  ) {
    return {
      shouldAutoLoad: size <= TEXT_LOAD_THRESHOLD,
      thresholdExceeded: size > TEXT_LOAD_THRESHOLD,
      threshold: TEXT_LOAD_THRESHOLD,
      contentCategory: 'text',
    };
  }

  // Default for other content types - always auto-load
  return {
    shouldAutoLoad: true,
    thresholdExceeded: false,
    threshold: Infinity,
    contentCategory: 'other',
  };
}

/**
 * Formats file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Gets a user-friendly message for manual load scenarios
 */
export function getManualLoadMessage(
  contentCategory: string,
  size: number
): string {
  const formattedSize = formatFileSize(size);
  
  switch (contentCategory) {
    case 'image':
      return `Large image (${formattedSize}). Click to load.`;
    case 'video':
      return `Large video (${formattedSize}). Click to load.`;
    case 'audio':
      return `Large audio file (${formattedSize}). Click to load.`;
    case 'text':
      return `Large text file (${formattedSize}). Click to load.`;
    default:
      return `Large file (${formattedSize}). Click to load.`;
  }
}