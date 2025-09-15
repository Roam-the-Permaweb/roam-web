/**
 * Cross-platform timer type utilities
 * 
 * These types work in both Node.js and browser environments
 */

// Use number for browser compatibility, avoiding NodeJS.Timeout type issues
export type TimerId = number;

// Helper functions that return the correct type
export const setTimeoutSafe = (handler: () => void, timeout?: number): TimerId => {
  return setTimeout(handler, timeout) as unknown as number;
};

export const setIntervalSafe = (handler: () => void, timeout?: number): TimerId => {
  return setInterval(handler, timeout) as unknown as number;
};

export const clearTimeoutSafe = (id: TimerId | null | undefined): void => {
  if (id != null) {
    clearTimeout(id);
  }
};

export const clearIntervalSafe = (id: TimerId | null | undefined): void => {
  if (id != null) {
    clearInterval(id);
  }
};