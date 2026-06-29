// Dashboard Local Cache — Persist last-known dashboard state to localStorage
// so the UI loads instantly with real data instead of hardcoded mocks.

const CACHE_KEY = 'marketpulse_dashboard_cache';
const CACHE_VERSION = 1;

export interface DashboardCacheData {
  version: number;
  timestamp: number;  // Date.now()
  sectors: any[];
  news: any[];
  marketData: {
    nifty50: { value: number; change: number; changePercent: number };
    sensex: { value: number; change: number; changePercent: number };
    marketStatus: string;
  } | null;
  lastUpdated: string;  // ISO string
  aiAccuracy: { overallAccuracy: number; totalResolved: number } | null;
}

/**
 * Save the current dashboard state to localStorage.
 * Call this after every successful API fetch.
 */
export function saveDashboardCache(data: Omit<DashboardCacheData, 'version' | 'timestamp'>): void {
  if (typeof window === 'undefined') return;

  try {
    const cacheEntry: DashboardCacheData = {
      ...data,
      version: CACHE_VERSION,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

/**
 * Load the last-known dashboard state from localStorage.
 * Returns null if no cache exists or if the cache version is outdated.
 * Data up to 24 hours old is considered valid (market data doesn't change overnight).
 */
export function loadDashboardCache(): DashboardCacheData | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const data: DashboardCacheData = JSON.parse(raw);

    // Version check
    if (data.version !== CACHE_VERSION) return null;

    // Age check — discard if older than 24 hours
    const ageMs = Date.now() - data.timestamp;
    if (ageMs > 24 * 60 * 60 * 1000) return null;

    // Sanity: must have sectors and news
    if (!data.sectors?.length || !data.news?.length) return null;

    return data;
  } catch {
    return null;
  }
}

/**
 * Get a human-readable "X ago" string from a timestamp.
 */
export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Clear the dashboard cache (e.g. on logout or manual refresh).
 */
export function clearDashboardCache(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CACHE_KEY);
  }
}
