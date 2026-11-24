// API Route: High-performance Nifty Heatmap
// Uses shared batch quote engine (1 Upstox API call + Yahoo 5d fallback + Supabase DB enrichment)

import { NextResponse } from 'next/server';
import { getUpstoxToken } from '@/lib/upstoxTokenStore';
import { fetchBatchEnrichedQuotes } from '@/lib/batchQuotes';
import {
  NIFTY_HEATMAP_CONSTITUENTS,
  type HeatmapResponse,
  type HeatmapStockItem,
} from '@/lib/heatmapData';

export const dynamic = 'force-dynamic';

let heatmapMemCache: { payload: HeatmapResponse; ts: number } | null = null;
const HEATMAP_CACHE_TTL = 2 * 60 * 1000;

export async function GET(request: Request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';
  const clientToken = request.headers.get('X-Upstox-Token') || '';

  try {
    let upstoxToken =
      clientToken && clientToken !== 'sandbox' && clientToken !== 'mock' ? clientToken : '';
    if (!upstoxToken) {
      const stored = await getUpstoxToken();
      if (stored?.accessToken) upstoxToken = stored.accessToken;
    }

    if (
      !forceRefresh &&
      heatmapMemCache &&
      Date.now() - heatmapMemCache.ts < HEATMAP_CACHE_TTL &&
      (!upstoxToken || heatmapMemCache.payload.source !== 'yahoo')
    ) {
      return NextResponse.json(heatmapMemCache.payload, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      });
    }

    const symbols = NIFTY_HEATMAP_CONSTITUENTS.map((c) => c.symbol);
    const { items, upstoxCount, yahooCount } = await fetchBatchEnrichedQuotes(symbols, upstoxToken);

    const stocks: HeatmapStockItem[] = [];
    for (const c of NIFTY_HEATMAP_CONSTITUENTS) {
      const enriched = items.get(c.symbol);
      if (!enriched) continue;

      const { quote, rsi, prediction } = enriched;
      stocks.push({
        ...c,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        previousClose: quote.previousClose,
        open: quote.open,
        dayHigh: quote.dayHigh,
        dayLow: quote.dayLow,
        volume: quote.volume,
        indexImpact: Number(((c.weight * quote.changePercent) / 100).toFixed(4)),
        rsi,
        prediction,
        dataSource: quote.source,
      });
    }

    const advancers = stocks.filter((s) => s.changePercent > 0.05).length;
    const decliners = stocks.filter((s) => s.changePercent < -0.05).length;
    const unchanged = stocks.length - advancers - decliners;
    const avgChange =
      stocks.length > 0
        ? Number((stocks.reduce((sum, s) => sum + s.changePercent, 0) / stocks.length).toFixed(2))
        : 0;
    const totalWeight = stocks.reduce((sum, s) => sum + s.weight, 0);
    const weightedIndexChange =
      totalWeight > 0
        ? Number(
            (stocks.reduce((sum, s) => sum + s.weight * s.changePercent, 0) / totalWeight).toFixed(2)
          )
        : avgChange;

    const byChangeDesc = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
    const byImpactDesc = [...stocks].sort((a, b) => b.indexImpact - a.indexImpact);

    const source: HeatmapResponse['source'] =
      upstoxCount > 0 && yahooCount === 0
        ? 'upstox'
        : upstoxCount === 0
          ? 'yahoo'
          : 'mixed';

    const payload: HeatmapResponse = {
      stocks,
      stats: {
        total: stocks.length,
        advancers,
        decliners,
        unchanged,
        avgChange,
        weightedIndexChange,
        bullishCount: stocks.filter((s) => s.prediction?.direction === 'bullish').length,
        bearishCount: stocks.filter((s) => s.prediction?.direction === 'bearish').length,
        topGainers: byChangeDesc.slice(0, 3),
        topLosers: byChangeDesc.slice(-3).reverse(),
        topPositiveImpact: byImpactDesc.filter((s) => s.indexImpact > 0).slice(0, 3),
        topNegativeImpact: [...byImpactDesc]
          .reverse()
          .filter((s) => s.indexImpact < 0)
          .slice(0, 3),
      },
      source,
      timestamp: new Date().toISOString(),
      fetchMs: Date.now() - startedAt,
    };

    heatmapMemCache = { payload, ts: Date.now() };

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error: any) {
    console.error('[Heatmap API] Error:', error);
    if (heatmapMemCache) {
      return NextResponse.json(heatmapMemCache.payload);
    }
    return NextResponse.json(
      { error: 'Failed to generate heatmap data', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
