/**
 * useSwipeGesture Hook
 * 
 * Detects horizontal swipe gestures on touch devices
 * Supports left and right swipe detection with configurable thresholds
 */
import { useRef, useEffect } from 'preact/hooks';
import { DEFAULT_SWIPE_THRESHOLD, DEFAULT_SWIPE_TIME_LIMIT } from '../constants';

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

interface SwipeOptions {
  threshold?: number; // Minimum distance for swipe (default: 50px)
  allowedTime?: number; // Maximum time for swipe (default: 500ms)
}

export function useSwipeGesture(
  elementRef: { current: HTMLElement | null },
  { onSwipeLeft, onSwipeRight }: SwipeHandlers,
  options: SwipeOptions = {}
) {
  const { threshold = DEFAULT_SWIPE_THRESHOLD, allowedTime = DEFAULT_SWIPE_TIME_LIMIT } = options;
  
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
      touchStartTime.current = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (
        touchStartX.current === null || 
        touchStartY.current === null || 
        touchStartTime.current === null
      ) {
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = touch.clientY - touchStartY.current;
      const deltaTime = Date.now() - touchStartTime.current;

      // Check if this is a valid swipe (not too slow, more horizontal than vertical)
      if (deltaTime < allowedTime && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > threshold && onSwipeRight) {
          // Swipe right (back)
          onSwipeRight();
        } else if (deltaX < -threshold && onSwipeLeft) {
          // Swipe left (next)
          onSwipeLeft();
        }
      }

      // Reset
      touchStartX.current = null;
      touchStartY.current = null;
      touchStartTime.current = null;
    };

    // Add event listeners
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Cleanup
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onSwipeLeft, onSwipeRight, threshold, allowedTime]);
}