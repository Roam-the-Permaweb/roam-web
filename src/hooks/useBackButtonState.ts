import { useState, useEffect } from 'preact/hooks';
import { canGoBack } from '../engine/history';
import type { TxMeta } from '../constants';

/**
 * Hook to track whether the back button should be enabled
 * Updates whenever the current transaction changes
 */
export function useBackButtonState(currentTx: TxMeta | null) {
  const [canNavigateBack, setCanNavigateBack] = useState(false);
  
  useEffect(() => {
    const checkBackState = async () => {
      const hasHistory = await canGoBack();
      setCanNavigateBack(hasHistory);
    };
    
    // Check back button state whenever current transaction changes
    checkBackState();
  }, [currentTx]);
  
  return canNavigateBack;
}