// Screener Local Cache — Persists last-known stock screener scan to localStorage
// Enables instant (0ms) page load, displays exact scan timestamp, and allows on-demand re-fetch.

export interface ScreenerCachedItem {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  rsi: number | null;
  prediction?: {
    direction: 'bullish' | 'bearish' | 'neutral';
    probability: number;
    confidenceLevel: string;
    supportingSignals?: string[];
  } | null;
}

export interface ScreenerStats {
  bullishCount: number;
  bearishCount: number;
  gainersCount: number;
  losersCount: number;
}

export interface ScreenerCachePayload {
  version: number;
  timestamp: number; // Unix ms
  formattedTime: string; // e.g. "24 Nov 2026, 10:45 pm"
  stocks: ScreenerCachedItem[];
  stats: ScreenerStats | null;
}

const CACHE_KEY = 'marketpulse_screener_cache';
const CACHE_VERSION = 1;
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours (data remains valid over non-trading hours)

/**
 * Format a timestamp into human-readable Indian time e.g. "24 Nov, 10:45 pm"
 */
export function formatScanTimestamp(dateOrMs: number | string | Date): string {
  const d = new Date(dateOrMs);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Returns a relative time string like "Just now", "4m ago", "1h ago"
 */
export function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour === 1) return '1h ago';
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.floor(diffHour / 24)}d ago`;
}

/**
 * Load cached screener data from localStorage synchronously
 */
export function loadScreenerCache(): ScreenerCachePayload | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const data: ScreenerCachePayload = JSON.parse(raw);
    if (data.version !== CACHE_VERSION) return null;

    // Discard if older than 24h
    if (Date.now() - data.timestamp > MAX_CACHE_AGE_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    if (!Array.isArray(data.stocks) || data.stocks.length === 0) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Save screener data to localStorage
 */
export function saveScreenerCache(
  stocks: ScreenerCachedItem[],
  stats: ScreenerStats | null,
  timestampMs: number = Date.now()
): void {
  if (typeof window === 'undefined' || !stocks || stocks.length === 0) return;

  try {
    const payload: ScreenerCachePayload = {
      version: CACHE_VERSION,
      timestamp: timestampMs,
      formattedTime: formatScanTimestamp(timestampMs),
      stocks,
      stats,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage full or restricted
  }
}

/**
 * Clear cached screener data
 */
export function clearScreenerCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}
