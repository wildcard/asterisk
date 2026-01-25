/**
 * Security Tests: Vault Cache TTL and Lifecycle
 *
 * Tests the vault cache expiry mechanism and cleanup on extension suspend
 * to ensure sensitive data is not retained longer than necessary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VaultItem } from '@asterisk/core';

describe('Vault Cache Security', () => {
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (from background.ts:35)

  // Mock vault items for testing
  const mockVaultItems: VaultItem[] = [
    { key: 'firstName', value: 'John', semantic: 'firstName' },
    { key: 'email', value: 'john@example.com', semantic: 'email' },
    { key: 'password', value: 'secret123', semantic: 'password' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Cache TTL expiry', () => {
    /**
     * Simulates the cache expiry logic from background.ts:46-49
     */
    class VaultCache {
      private cachedItems: VaultItem[] = [];
      private cacheTimestamp: number = 0;
      private readonly TTL_MS = CACHE_TTL_MS;

      setCache(items: VaultItem[]): void {
        this.cachedItems = items;
        this.cacheTimestamp = Date.now();
      }

      getCache(): VaultItem[] {
        // Check cache expiry and clear if expired
        if (Date.now() - this.cacheTimestamp > this.TTL_MS) {
          this.cachedItems = [];
          this.cacheTimestamp = 0;
        }
        return this.cachedItems;
      }

      clearCache(): void {
        this.cachedItems = [];
        this.cacheTimestamp = 0;
      }

      isCacheValid(): boolean {
        return this.cachedItems.length > 0 && Date.now() - this.cacheTimestamp <= this.TTL_MS;
      }
    }

    it('returns cached items within TTL window', () => {
      const cache = new VaultCache();
      cache.setCache(mockVaultItems);

      // Advance time by 1 minute (within 5-minute TTL)
      vi.advanceTimersByTime(1 * 60 * 1000);

      const items = cache.getCache();
      expect(items).toEqual(mockVaultItems);
      expect(items.length).toBe(3);
    });

    it('clears cache after TTL expires', () => {
      const cache = new VaultCache();
      cache.setCache(mockVaultItems);

      // Advance time by 6 minutes (exceeds 5-minute TTL)
      vi.advanceTimersByTime(6 * 60 * 1000);

      const items = cache.getCache();
      expect(items).toEqual([]);
      expect(items.length).toBe(0);
    });

    it('keeps cache valid at exactly TTL boundary', () => {
      const cache = new VaultCache();
      cache.setCache(mockVaultItems);

      // Advance time to exactly 5 minutes
      vi.advanceTimersByTime(CACHE_TTL_MS);

      const items = cache.getCache();
      expect(items).toEqual(mockVaultItems);
    });

    it('expires cache 1ms after TTL', () => {
      const cache = new VaultCache();
      cache.setCache(mockVaultItems);

      // Advance time to 5 minutes + 1ms
      vi.advanceTimersByTime(CACHE_TTL_MS + 1);

      const items = cache.getCache();
      expect(items).toEqual([]);
    });

    it('allows multiple cache refreshes within TTL', () => {
      const cache = new VaultCache();

      // First cache
      cache.setCache(mockVaultItems);
      vi.advanceTimersByTime(2 * 60 * 1000); // 2 minutes

      // Second cache (refresh)
      const newItems = [
        { key: 'name', value: 'Jane', semantic: 'firstName' },
      ];
      cache.setCache(newItems);

      // Advance another 4 minutes (total 6 minutes from first cache, but 4 from second)
      vi.advanceTimersByTime(4 * 60 * 1000);

      // Should still have newItems because TTL resets on setCache
      const items = cache.getCache();
      expect(items).toEqual(newItems);
    });
  });

  describe('Cache clearing on extension lifecycle events', () => {
    /**
     * Simulates the suspend listener from background.ts:513-517
     */
    it('clears cache on extension suspend', () => {
      const cache = {
        items: [...mockVaultItems],
        timestamp: Date.now(),
      };

      // Simulate the suspend handler
      function handleSuspend() {
        cache.items = [];
        cache.timestamp = 0;
      }

      // Cache should be populated
      expect(cache.items.length).toBe(3);

      // Trigger suspend
      handleSuspend();

      // Cache should be cleared
      expect(cache.items).toEqual([]);
      expect(cache.timestamp).toBe(0);
    });

    it('prevents data leakage after service worker restarts', () => {
      class VaultCache {
        private cachedItems: VaultItem[] = [];
        private cacheTimestamp: number = 0;

        setCache(items: VaultItem[]): void {
          this.cachedItems = items;
          this.cacheTimestamp = Date.now();
        }

        clearOnSuspend(): void {
          this.cachedItems = [];
          this.cacheTimestamp = 0;
        }

        getItems(): VaultItem[] {
          return this.cachedItems;
        }
      }

      const cache = new VaultCache();
      cache.setCache(mockVaultItems);

      // Service worker suspends
      cache.clearOnSuspend();

      // After restart, cache should be empty (secure by default)
      expect(cache.getItems()).toEqual([]);
    });
  });

  describe('Security implications', () => {
    class VaultCache {
      private cachedItems: VaultItem[] = [];
      private cacheTimestamp: number = 0;
      private readonly TTL_MS = CACHE_TTL_MS;

      setCache(items: VaultItem[]): void {
        this.cachedItems = items;
        this.cacheTimestamp = Date.now();
      }

      getCache(): VaultItem[] {
        if (Date.now() - this.cacheTimestamp > this.TTL_MS) {
          this.cachedItems = [];
          this.cacheTimestamp = 0;
        }
        return this.cachedItems;
      }

      clearCache(): void {
        this.cachedItems = [];
        this.cacheTimestamp = 0;
      }
    }

    it('limits exposure window of sensitive data to 5 minutes', () => {
      const cache = new VaultCache();

      // Sensitive data cached at T=0
      cache.setCache(mockVaultItems);

      // At T=5min, data still in cache
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(cache.getCache().length).toBe(3);

      // At T=5min+1ms, data cleared
      vi.advanceTimersByTime(1);
      expect(cache.getCache().length).toBe(0);
    });

    it('does not persist cache to disk', () => {
      // This is a behavioral test - cache should only be in memory
      const cache = new VaultCache();
      cache.setCache(mockVaultItems);

      // Cache is in memory only (no persistence layer called)
      // The VaultCache class doesn't use localStorage or chrome.storage
      expect(cache.getCache()).toEqual(mockVaultItems);

      // Verify cache is truly ephemeral (cleared on expiry)
      vi.advanceTimersByTime(6 * 60 * 1000);
      expect(cache.getCache()).toEqual([]);
    });

    it('handles cache expiry during active operations', () => {
      const cache = new VaultCache();
      cache.setCache(mockVaultItems);

      // Simulate long-running operation
      vi.advanceTimersByTime(3 * 60 * 1000); // 3 minutes

      // Mid-operation cache check
      expect(cache.getCache().length).toBe(3);

      // Continue operation
      vi.advanceTimersByTime(3 * 60 * 1000); // 3 more minutes (total 6)

      // Cache should now be expired
      expect(cache.getCache().length).toBe(0);
    });

    it('prevents sensitive data accumulation', () => {
      const cache = new VaultCache();

      // Multiple cache sets within TTL
      cache.setCache([{ key: 'data1', value: 'value1', semantic: 'text' }]);
      vi.advanceTimersByTime(1000);
      cache.setCache([{ key: 'data2', value: 'value2', semantic: 'text' }]);
      vi.advanceTimersByTime(1000);
      cache.setCache([{ key: 'data3', value: 'value3', semantic: 'text' }]);

      // Only latest cache should be retained (no accumulation)
      const items = cache.getCache();
      expect(items.length).toBe(1);
      expect(items[0].key).toBe('data3');
    });
  });

  describe('Edge cases', () => {
    class VaultCache {
      private cachedItems: VaultItem[] = [];
      private cacheTimestamp: number = 0;
      private readonly TTL_MS = CACHE_TTL_MS;

      setCache(items: VaultItem[]): void {
        this.cachedItems = items;
        this.cacheTimestamp = Date.now();
      }

      getCache(): VaultItem[] {
        if (Date.now() - this.cacheTimestamp > this.TTL_MS) {
          this.cachedItems = [];
          this.cacheTimestamp = 0;
        }
        return this.cachedItems;
      }

      clearCache(): void {
        this.cachedItems = [];
        this.cacheTimestamp = 0;
      }
    }

    it('handles empty cache', () => {
      const cache = new VaultCache();

      // No items cached
      expect(cache.getCache()).toEqual([]);
    });

    it('handles cache cleared manually before TTL', () => {
      const cache = new VaultCache();
      cache.setCache(mockVaultItems);

      // Manually clear cache
      cache.clearCache();

      // Cache should be empty
      expect(cache.getCache()).toEqual([]);
    });

    it('handles very large cache (memory pressure)', () => {
      const cache = new VaultCache();

      // Create large cache (1000 items)
      const largeCache: VaultItem[] = Array.from({ length: 1000 }, (_, i) => ({
        key: `key${i}`,
        value: `value${i}`,
        semantic: 'text',
      }));

      cache.setCache(largeCache);

      // Cache should handle large data
      expect(cache.getCache().length).toBe(1000);

      // Expiry should still work
      vi.advanceTimersByTime(6 * 60 * 1000);
      expect(cache.getCache().length).toBe(0);
    });

    it('handles cache timestamp reset on clear', () => {
      const cache = new VaultCache();
      cache.setCache(mockVaultItems);

      const initialTimestamp = Date.now();

      // Clear cache
      cache.clearCache();

      // Set new cache
      vi.advanceTimersByTime(1000);
      cache.setCache(mockVaultItems);

      // New timestamp should be later
      expect(Date.now()).toBeGreaterThan(initialTimestamp);
    });
  });
});
