// Production server-side in-memory cache with TTL
// Prevents OOM from repeated fetches and reduces Yahoo Finance load

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    // Evict oldest entries if we're at capacity
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }

    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

// Singleton caches with different TTLs for different data types
// These persist across requests in the same serverless instance

/** Stock quote cache — 5 min TTL (quotes are semi-real-time) */
export const quoteCache = new MemoryCache(200);
export const QUOTE_TTL = 5 * 60 * 1000;

/** Technical analysis cache — 15 min TTL (computed from OHLCV) */
export const techCache = new MemoryCache(200);
export const TECH_TTL = 15 * 60 * 1000;

/** News cache — 10 min TTL */
export const newsCache = new MemoryCache(10);
export const NEWS_TTL = 10 * 60 * 1000;

/** Market data cache — 5 min TTL */
export const marketCache = new MemoryCache(20);
export const MARKET_TTL = 5 * 60 * 1000;

/** Generic helper: fetch-or-cache pattern */
export async function cachedFetch<T>(
  cache: MemoryCache,
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== null) return cached;

  const data = await fetcher();
  if (data !== null && data !== undefined) {
    cache.set(key, data, ttlMs);
  }
  return data;
}
