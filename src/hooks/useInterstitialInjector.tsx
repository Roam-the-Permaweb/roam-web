// src/hooks/useAdInjector.ts
import { useState, useCallback, useEffect } from 'preact/hooks';
import { logger } from '../utils/logger';

const CLICK_COUNT_KEY = 'roam_ad_click_count';
const THRESHOLD_KEY = 'roam_ad_threshold';

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper functions for localStorage
function loadFromStorage(key: string, defaultValue: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      const value = parseInt(stored, 10);
      if (!isNaN(value)) {
        return value;
      }
    }
  } catch (error) {
    logger.warn(`Failed to load ${key} from localStorage:`, error);
  }
  return defaultValue;
}

function saveToStorage(key: string, value: number): void {
  try {
    localStorage.setItem(key, value.toString());
  } catch (error) {
    logger.warn(`Failed to save ${key} to localStorage:`, error);
  }
}

export function useInterstitialInjector(minClicks = 25, maxClicks = 30) {
  // Initialize from localStorage if available
  const [count, setCount] = useState(() => {
    const storedCount = loadFromStorage(CLICK_COUNT_KEY, 0);
    logger.info(`Ad click count loaded from storage: ${storedCount}`);
    return storedCount;
  });
  
  const [threshold, setThreshold] = useState(() => {
    // First check if we have a stored threshold
    const storedThreshold = loadFromStorage(THRESHOLD_KEY, 0);
    if (storedThreshold > 0) {
      logger.info(`Ad threshold loaded from storage: ${storedThreshold} clicks`);
      return storedThreshold;
    }
    // Otherwise generate a new one
    const initialThreshold = randomBetween(minClicks, maxClicks);
    saveToStorage(THRESHOLD_KEY, initialThreshold);
    logger.info(`Ad threshold initialized: ${initialThreshold} clicks (range: ${minClicks}-${maxClicks})`);
    return initialThreshold;
  });

  // Persist count changes to localStorage
  useEffect(() => {
    saveToStorage(CLICK_COUNT_KEY, count);
  }, [count]);

  // Persist threshold changes to localStorage
  useEffect(() => {
    saveToStorage(THRESHOLD_KEY, threshold);
  }, [threshold]);

  const recordClick = useCallback(() => {
    setCount(c => {
      const newCount = c + 1;
      logger.info(`Click recorded: ${newCount}/${threshold} clicks until ad`);
      return newCount;
    });
  }, [threshold]);

  const shouldShowInterstitial = count >= threshold;

  const reset = useCallback(() => {
    logger.info(`Ad cycle reset - previous count: ${count}/${threshold}`);
    setCount(0);
    // **re‐randomize** for the next cycle
    const newThreshold = randomBetween(minClicks, maxClicks);
    setThreshold(newThreshold);
    logger.info(`New ad threshold: ${newThreshold} clicks`);
    // Storage will be updated by useEffect hooks
  }, [minClicks, maxClicks, count, threshold]);

  // Clear all persisted ad data (for full app reset)
  const clearPersistedData = useCallback(() => {
    logger.info('Clearing persisted ad click data');
    try {
      localStorage.removeItem(CLICK_COUNT_KEY);
      localStorage.removeItem(THRESHOLD_KEY);
    } catch (error) {
      logger.warn('Failed to clear ad click data from localStorage:', error);
    }
    // Reset to initial state
    setCount(0);
    const newThreshold = randomBetween(minClicks, maxClicks);
    setThreshold(newThreshold);
  }, [minClicks, maxClicks]);

  return { recordClick, shouldShowInterstitial, reset, clearPersistedData, currentCount: count, threshold };
}
