// Watchlist Local Cache — Persists last-known watchlist quotes, RSI & AI signals to localStorage
// Enables instant (0ms) page load, displays exact scan timestamp, and supports per-symbol incremental updates.

import { formatScanTimestamp, formatTimeAgo } from './screenerCache';

export { formatScanTimestamp, formatTimeAgo };

export interface WatchlistStockData {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  rsi: number | null;
  prediction: {
    direction: 'bullish' | 'bearish' | 'neutral';
    probability: number;
    confidenceLevel: string;
  } | null;
  dataSource: 'upstox' | 'yahoo' | 'db';
}

export interface WatchlistCachePayload {
  version: number;
  timestamp: number;
  source: 'upstox' | 'yahoo' | 'mixed';
  items: Record<string, WatchlistStockData>;
}

const CACHE_KEY = 'marketpulse_watchlist_quotes_cache';
const CACHE_VERSION = 1;
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

export function loadWatchlistCache(): WatchlistCachePayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data: WatchlistCachePayload = JSON.parse(raw);
    if (data.version !== CACHE_VERSION) return null;
    if (Date.now() - data.timestamp > MAX_CACHE_AGE_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    if (!data.items || typeof data.items !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

export function saveWatchlistCache(
  items: Record<string, WatchlistStockData>,
  source: 'upstox' | 'yahoo' | 'mixed',
  timestampMs: number = Date.now()
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: WatchlistCachePayload = {
      version: CACHE_VERSION,
      timestamp: timestampMs,
      source,
      items,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage full or restricted
  }
}

