import {AudioBuffer} from 'react-native-audio-api';

/**
 * LRU Cache for audio buffers with memory management
 */
export class AudioBufferCache {
  private cache: Map<string, {buffer: AudioBuffer; lastUsed: number; size: number}> = new Map();
  private maxSize: number;
  private currentSize: number = 0;
  private maxAge: number = 5 * 60 * 1000; // 5 minutes in milliseconds
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(maxSizeMB: number = 50) {
    this.maxSize = maxSizeMB * 1024 * 1024; // Convert MB to bytes

    // Set up periodic cleanup every minute
    // In test environment, skip timer setup
    if (typeof setInterval !== 'undefined' && !(__DEV__ && (global as any).process?.env?.NODE_ENV === 'test')) {
      this.cleanupTimer = setInterval(() => this.cleanupStale(), 60 * 1000);
    }
  }

  /**
   * Get buffer from cache
   */
  get(key: string): AudioBuffer | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastUsed = Date.now();

      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, entry);

      return entry.buffer;
    }
    return undefined;
  }

  /**
   * Add buffer to cache
   */
  set(key: string, buffer: AudioBuffer): void {
    // Calculate approximate buffer size
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const sampleSize = 4; // 32-bit float per sample
    const bufferSize = channels * length * sampleSize;

    // If buffer is larger than max cache size, skip caching
    // (these should be handled by dedicated storage like loopBuffers)
    if (bufferSize > this.maxSize) {
      console.warn(`Buffer ${key} (${(bufferSize / (1024 * 1024)).toFixed(1)}MB) exceeds cache size - skipping cache`);
      return;
    }

    // Remove existing entry if present
    if (this.cache.has(key)) {
      const existing = this.cache.get(key);
      if (existing) {
        this.currentSize -= existing.size;
      }
      this.cache.delete(key);
    }

    // Check if we need to evict entries to make space
    while (this.currentSize + bufferSize > this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }

    // Add new entry
    this.cache.set(key, {
      buffer,
      lastUsed: Date.now(),
      size: bufferSize
    });
    this.currentSize += bufferSize;
  }

  /**
   * Remove buffer from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }

  /**
   * Clear all buffers
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    // Map maintains insertion order, so first entry is least recently used
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.delete(firstKey);
      console.log(`Evicted audio buffer: ${firstKey}`);
    }
  }

  /**
   * Remove stale entries older than maxAge
   */
  private cleanupStale(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.lastUsed > this.maxAge) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.delete(key);
      console.log(`Removed stale audio buffer: ${key}`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    entries: number;
    sizeMB: number;
    maxSizeMB: number;
  } {
    return {
      entries: this.cache.size,
      sizeMB: this.currentSize / (1024 * 1024),
      maxSizeMB: this.maxSize / (1024 * 1024)
    };
  }

  /**
   * Handle low memory warning
   */
  onLowMemory(): void {
    console.warn('Low memory warning - clearing 50% of audio cache');

    // Remove half of the least recently used entries
    const entriesToRemove = Math.floor(this.cache.size / 2);
    for (let i = 0; i < entriesToRemove; i++) {
      this.evictLRU();
    }
  }

  /**
   * Destroy the cache and clean up timers
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.clear();
  }
}

export default AudioBufferCache;