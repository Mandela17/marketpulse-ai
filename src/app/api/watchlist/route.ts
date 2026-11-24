// API Route: High-performance Batch Watchlist Quotes + AI & RSI Enrichment
// Replaces 20+ sequential per-stock fetches (/api/stock + /api/predict) with 1 fast batch call (~100ms).

import { NextResponse } from 'next/server';
import { getUpstoxToken } from '@/lib/upstoxTokenStore';
import { fetchBatchEnrichedQuotes } from '@/lib/batchQuotes';
import { getStockBySymbol } from '@/lib/sectorData';
import type { WatchlistStockData } from '@/lib/watchlistCache';

export const dynamic = 'force-dynamic';

const watchlistMemCache = new Map<string, { payload: any; ts: number }>();
const WATCHLIST_CACHE_TTL = 2 * 60 * 1000;

export async function GET(request: Request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols') || '';
  const forceRefresh = searchParams.get('refresh') === 'true';
  const clientToken = request.headers.get('X-Upstox-Token') || '';

  const symbols = Array.from(
    new Set(
      symbolsParam
        .split(',')
        .map((s) => decodeURIComponent(s).toUpperCase().trim())
        .filter((s) => s.length >= 1)
    )
  ).slice(0, 100);

  if (symbols.length === 0) {
    return NextResponse.json({ stocks: [], source: 'upstox', timestamp: new Date().toISOString(), fetchMs: 0 });
  }

  try {
    let upstoxToken =
      clientToken && clientToken !== 'sandbox' && clientToken !== 'mock' ? clientToken : '';
    if (!upstoxToken) {
      const stored = await getUpstoxToken();
      if (stored?.accessToken) upstoxToken = stored.accessToken;
    }

    const cacheKey = `${upstoxToken ? 'u' : 'y'}:${[...symbols].sort().join(',')}`;
    const cached = watchlistMemCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.ts < WATCHLIST_CACHE_TTL) {
      return NextResponse.json(cached.payload, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      });
    }

    const { items, upstoxCount, yahooCount } = await fetchBatchEnrichedQuotes(symbols, upstoxToken);

    const stocks: WatchlistStockData[] = [];
    for (const sym of symbols) {
      const enriched = items.get(sym);
      if (!enriched) continue;
      const meta = getStockBySymbol(sym);
      stocks.push({
        symbol: sym,
        name: meta?.name || sym,
        sector: meta?.sector || 'general',
        price: enriched.quote.price,
        change: enriched.quote.change,
        changePercent: enriched.quote.changePercent,
        previousClose: enriched.quote.previousClose,
        open: enriched.quote.open,
        dayHigh: enriched.quote.dayHigh,
        dayLow: enriched.quote.dayLow,
        volume: enriched.quote.volume,
        rsi: enriched.rsi,
        prediction: enriched.prediction,
        dataSource: enriched.quote.source,
      });
    }

    const source: 'upstox' | 'yahoo' | 'mixed' =
      upstoxCount > 0 && yahooCount === 0
        ? 'upstox'
        : upstoxCount === 0
          ? 'yahoo'
          : 'mixed';

    const payload = {
      stocks,
      source,
      timestamp: new Date().toISOString(),
      fetchMs: Date.now() - startedAt,
    };

    if (watchlistMemCache.size >= 50) {
      const firstKey = watchlistMemCache.keys().next().value;
      if (firstKey) watchlistMemCache.delete(firstKey);
    }
    watchlistMemCache.set(cacheKey, { payload, ts: Date.now() });

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error: any) {
    console.error('[Watchlist API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch watchlist quotes', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

