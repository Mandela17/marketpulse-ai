// Heatmap Local Cache — Persists last-known Nifty Heatmap scan to localStorage
// Enables instant (0ms) page load, displays exact scan timestamp, and allows on-demand re-fetch.

import { formatScanTimestamp, formatTimeAgo } from './screenerCache';
import type { HeatmapResponse, HeatmapStockItem, HeatmapStats } from './heatmapData';

export { formatScanTimestamp, formatTimeAgo };

export interface HeatmapCachePayload {
  version: number;
  timestamp: number;
  formattedTime: string;
  stocks: HeatmapStockItem[];
  stats: HeatmapStats;
  source: HeatmapResponse['source'];
}

const CACHE_KEY = 'marketpulse_heatmap_cache';
const CACHE_VERSION = 1;
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function loadHeatmapCache(): HeatmapCachePayload | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const data: HeatmapCachePayload = JSON.parse(raw);
    if (data.version !== CACHE_VERSION) return null;
    if (Date.now() - data.timestamp > MAX_CACHE_AGE_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    if (!Array.isArray(data.stocks) || data.stocks.length === 0 || !data.stats) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveHeatmapCache(payloadData: {
  stocks: HeatmapStockItem[];
  stats: HeatmapStats;
  source: HeatmapResponse['source'];
  timestampMs?: number;
}): void {
  if (typeof window === 'undefined' || !payloadData.stocks?.length) return;

  const ts = payloadData.timestampMs ?? Date.now();
  try {
    const payload: HeatmapCachePayload = {
      version: CACHE_VERSION,
      timestamp: ts,
      formattedTime: formatScanTimestamp(ts),
      stocks: payloadData.stocks,
      stats: payloadData.stats,
      source: payloadData.source,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage full or restricted
  }
}

export function clearHeatmapCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

