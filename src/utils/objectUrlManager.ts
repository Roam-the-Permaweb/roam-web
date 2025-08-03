/**
 * Object URL Manager with reference counting for proper cleanup
 * Prevents memory leaks from accumulated Object URLs during rapid navigation
 */

interface URLEntry {
  url: string;
  refCount: number;
  blob: Blob;
  createdAt: number;
}

class ObjectURLManager {
  private urls = new Map<string, URLEntry>();
  private cleanupTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly CLEANUP_DELAY = 5000; // 5 seconds grace period

  /**
   * Acquire an Object URL for a blob
   * If URL already exists for this key, increment reference count
   */
  acquire(blob: Blob, key: string): string {
    const existing = this.urls.get(key);
    
    if (existing) {
      // Cancel any pending cleanup
      const timeout = this.cleanupTimeouts.get(key);
      if (timeout) {
        clearTimeout(timeout);
        this.cleanupTimeouts.delete(key);
      }
      
      existing.refCount++;
      return existing.url;
    }
    
    // Create new URL
    const url = URL.createObjectURL(blob);
    this.urls.set(key, {
      url,
      blob,
      refCount: 1,
      createdAt: Date.now()
    });
    
    return url;
  }

  /**
   * Release an Object URL
   * Decrements reference count and schedules cleanup if count reaches 0
   */
  release(key: string): void {
    const entry = this.urls.get(key);
    if (!entry) return;
    
    entry.refCount--;
    
    if (entry.refCount <= 0) {
      // Schedule cleanup with delay to handle rapid re-acquisitions
      const timeout = setTimeout(() => {
        this.cleanup(key);
      }, this.CLEANUP_DELAY);
      
      this.cleanupTimeouts.set(key, timeout);
    }
  }

  /**
   * Immediately release and cleanup a URL
   */
  releaseImmediate(key: string): void {
    const timeout = this.cleanupTimeouts.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.cleanupTimeouts.delete(key);
    }
    
    this.cleanup(key);
  }

  /**
   * Get URL if it exists
   */
  get(key: string): string | null {
    return this.urls.get(key)?.url || null;
  }

  /**
   * Check if URL exists and is active
   */
  has(key: string): boolean {
    return this.urls.has(key);
  }

  /**
   * Clean up a specific URL
   */
  private cleanup(key: string): void {
    const entry = this.urls.get(key);
    if (!entry) return;
    
    URL.revokeObjectURL(entry.url);
    this.urls.delete(key);
    this.cleanupTimeouts.delete(key);
  }

  /**
   * Clean up all URLs older than maxAge
   */
  cleanupOld(maxAgeMs: number = 60000): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    for (const [key, entry] of this.urls.entries()) {
      if (entry.refCount <= 0 && (now - entry.createdAt) > maxAgeMs) {
        toDelete.push(key);
      }
    }
    
    toDelete.forEach(key => this.cleanup(key));
  }

  /**
   * Force cleanup all URLs (for component unmount)
   */
  cleanupAll(): void {
    // Clear all timeouts first
    for (const timeout of this.cleanupTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.cleanupTimeouts.clear();
    
    // Revoke all URLs
    for (const entry of this.urls.values()) {
      URL.revokeObjectURL(entry.url);
    }
    
    this.urls.clear();
  }

  /**
   * Get statistics for debugging
   */
  getStats(): { totalUrls: number; totalRefCount: number; pendingCleanup: number } {
    let totalRefCount = 0;
    for (const entry of this.urls.values()) {
      totalRefCount += entry.refCount;
    }
    
    return {
      totalUrls: this.urls.size,
      totalRefCount,
      pendingCleanup: this.cleanupTimeouts.size
    };
  }
}

// Create singleton instance
export const objectUrlManager = new ObjectURLManager();

// Export for testing
export { ObjectURLManager };