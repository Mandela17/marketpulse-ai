// API Route: High-performance Nifty Heatmap
// Uses Upstox Batch Quotes (1 single API call for all 51 constituents, ~100ms)
// Falls back to Yahoo v8 5-day chart (accurate previous-day close even off-market)
// Enriches with Supabase AI predictions & RSI, plus 2-minute server memory cache.

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getInstrumentKey } from '@/lib/upstoxInstruments';
import { getUpstoxToken, invalidateUpstoxTokens } from '@/lib/upstoxTokenStore';
import { toYahooTicker } from '@/lib/symbolMap';
import {
  NIFTY_HEATMAP_CONSTITUENTS,
  type HeatmapResponse,
  type HeatmapStockItem,
} from '@/lib/heatmapData';

export const dynamic = 'force-dynamic';

// In-memory cache (2 min TTL — bypassed cleanly with ?refresh=true)
let heatmapMemCache: { payload: HeatmapResponse; ts: number } | null = null;
const HEATMAP_CACHE_TTL = 2 * 60 * 1000;

interface RawQuote {
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  source: 'upstox' | 'yahoo' | 'db';
}

/**
 * Fetch all constituent quotes in ONE single Upstox batch API call.
 * Note: Upstox returns `last_price` and `net_change`; we derive `previousClose = last_price - net_change`
 * because `ohlc.close` equals `last_price` after EOD settlement and `close_price` is omitted.
 */
async function fetchUpstoxBatchQuotes(
  symbols: string[],
  token: string
): Promise<{ quotes: Map<string, RawQuote>; unauthorized: boolean }> {
  const quotes = new Map<string, RawQuote>();
  const keyToSymbol = new Map<string, string>();
  const keys: string[] = [];

  for (const sym of symbols) {
    const ik = getInstrumentKey(sym);
    if (ik) {
      keys.push(ik);
      keyToSymbol.set(ik, sym);
    }
  }

  if (keys.length === 0) return { quotes, unauthorized: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(keys.join(','))}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    if (res.status === 401) {
      return { quotes, unauthorized: true };
    }
    if (!res.ok) {
      return { quotes, unauthorized: false };
    }

    const json = await res.json();
    const entries = Object.entries(json?.data || {}) as [string, any][];

    for (const [dictKey, q] of entries) {
      if (!q || !(q.last_price > 0)) continue;

      // Match primarily via instrument_token, fallback to dictionary key symbol
      let sym = q.instrument_token ? keyToSymbol.get(q.instrument_token) : undefined;
      if (!sym) {
        const rawSym = (q.symbol || dictKey.split(':')[1] || '').toUpperCase();
        if (symbols.includes(rawSym)) sym = rawSym;
      }
      if (!sym) continue;

      const price = Number(q.last_price);
      const netChange =
        typeof q.net_change === 'number'
          ? Number(q.net_change)
          : price - Number(q.close_price || q.ohlc?.close || price);
      const derivedPrev = price - netChange;
      const prevClose =
        typeof q.net_change === 'number' && derivedPrev > 0
          ? derivedPrev
          : Number(q.close_price || q.ohlc?.close || price);
      const changePercent = prevClose > 0 && netChange !== 0 ? (netChange / prevClose) * 100 : 0;

      quotes.set(sym, {
        price: Number(price.toFixed(2)),
        change: Number(netChange.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        previousClose: Number(prevClose.toFixed(2)),
        open: Number((q.ohlc?.open || price).toFixed(2)),
        dayHigh: Number((q.ohlc?.high || price).toFixed(2)),
        dayLow: Number((q.ohlc?.low || price).toFixed(2)),
        volume: Number(q.volume || 0),
        source: 'upstox',
      });
    }

    return { quotes, unauthorized: false };
  } catch {
    return { quotes, unauthorized: false };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fallback: Fetch missing quotes from Yahoo v8 5-day chart in parallel chunks of 10.
 * Using range=5d ensures accurate previous-trading-day close even on weekends/holidays.
 */
async function fetchYahooFallbackQuotes(symbols: string[]): Promise<Map<string, RawQuote>> {
  const quotes = new Map<string, RawQuote>();
  if (symbols.length === 0) return quotes;

  const chunkSize = 10;
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (sym) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        try {
          const yt = toYahooTicker(sym);
          const safeTicker = yt.includes('%') ? yt : encodeURIComponent(yt);
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${safeTicker}?interval=1d&range=5d`;
          const res = await fetch(url, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Accept: 'application/json',
            },
            signal: controller.signal,
          });
          if (!res.ok) return;

          const json = await res.json();
          const result = json?.chart?.result?.[0];
          const meta = result?.meta;
          if (!meta || !(meta.regularMarketPrice > 0)) return;

          const price = Number(meta.regularMarketPrice);
          const rawCloses = (result.indicators?.quote?.[0]?.close || []) as (number | null)[];
          const validCloses = rawCloses.filter((c): c is number => typeof c === 'number' && c > 0);
          const prevClose =
            validCloses.length >= 2
              ? validCloses[validCloses.length - 2]
              : Number(meta.chartPreviousClose || meta.previousClose || price);
          const change = price - prevClose;
          const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

          const opens = (result.indicators?.quote?.[0]?.open || []).filter(
            (x: any): x is number => typeof x === 'number' && x > 0
          );
          const open = opens.length > 0 ? opens[opens.length - 1] : price;

          quotes.set(sym, {
            price: Number(price.toFixed(2)),
            change: Number(change.toFixed(2)),
            changePercent: Number(changePercent.toFixed(2)),
            previousClose: Number(prevClose.toFixed(2)),
            open: Number(open.toFixed(2)),
            dayHigh: Number((meta.regularMarketDayHigh || price).toFixed(2)),
            dayLow: Number((meta.regularMarketDayLow || price).toFixed(2)),
            volume: Number(meta.regularMarketVolume || 0),
            source: 'yahoo',
          });
        } catch {
          // Ignore individual quote timeout
        } finally {
          clearTimeout(timeout);
        }
      })
    );
  }

  return quotes;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';
  const clientToken = request.headers.get('X-Upstox-Token') || '';

  try {
    const db = getServiceClient();
    const symbols = NIFTY_HEATMAP_CONSTITUENTS.map((c) => c.symbol);

    // Resolve Upstox token: client header -> server Supabase store
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

    // Fetch DB context (AI predictions + RSI) & Upstox batch quotes in parallel
    const [predResult, featResult, upstoxResult] = await Promise.all([
      db
        .from('predictions')
        .select('symbol, predicted_direction, probability, confidence_level, predicted_at')
        .in('symbol', symbols)
        .order('predicted_at', { ascending: false })
        .limit(300),
      db
        .from('daily_features')
        .select('symbol, close, open, high, low, volume, rsi, date')
        .in('symbol', symbols)
        .order('date', { ascending: false })
        .limit(300),
      upstoxToken
        ? fetchUpstoxBatchQuotes(symbols, upstoxToken)
        : Promise.resolve({ quotes: new Map<string, RawQuote>(), unauthorized: false }),
    ]);

    if (upstoxResult.unauthorized) {
      await invalidateUpstoxTokens();
    }

    const quoteMap = new Map<string, RawQuote>(upstoxResult.quotes);
    const missingSymbols = symbols.filter((s) => !quoteMap.has(s));

    // Fetch missing quotes from Yahoo Finance 5D chart
    if (missingSymbols.length > 0) {
      const yahooQuotes = await fetchYahooFallbackQuotes(missingSymbols);
      for (const [sym, q] of yahooQuotes.entries()) {
        quoteMap.set(sym, q);
      }
    }

    // Build lookup maps for predictions & daily_features
    const predMap = new Map<string, any>();
    for (const p of predResult.data || []) {
      if (!predMap.has(p.symbol)) predMap.set(p.symbol, p);
    }

    const featMap = new Map<string, any>();
    for (const f of featResult.data || []) {
      if (!featMap.has(f.symbol)) featMap.set(f.symbol, f);
    }

    // Assemble final constituent items
    const stocks: HeatmapStockItem[] = [];
    let upstoxCount = 0;
    let yahooCount = 0;

    for (const c of NIFTY_HEATMAP_CONSTITUENTS) {
      const q = quoteMap.get(c.symbol);
      const feat = featMap.get(c.symbol);
      const pred = predMap.get(c.symbol);
      const rsi = feat?.rsi != null ? parseFloat(Number(feat.rsi).toFixed(1)) : null;

      let resolved: RawQuote | null = q || null;
      if (!resolved && feat && Number(feat.close) > 0) {
        const price = Number(feat.close);
        const open = Number(feat.open || price);
        const ch = price - open;
        resolved = {
          price: Number(price.toFixed(2)),
          change: Number(ch.toFixed(2)),
          changePercent: open > 0 ? Number(((ch / open) * 100).toFixed(2)) : 0,
          previousClose: Number(open.toFixed(2)),
          open: Number(open.toFixed(2)),
          dayHigh: Number(feat.high || price),
          dayLow: Number(feat.low || price),
          volume: Number(feat.volume || 0),
          source: 'db',
        };
      }

      if (!resolved || resolved.price <= 0) continue;

      if (resolved.source === 'upstox') upstoxCount++;
      else yahooCount++;

      let predictionObj: HeatmapStockItem['prediction'] = null;
      if (pred) {
        const dir =
          pred.predicted_direction === 'up'
            ? 'bullish'
            : pred.predicted_direction === 'down'
              ? 'bearish'
              : 'neutral';
        let prob = Number(pred.probability || 55);
        if (prob > 0 && prob <= 1) prob *= 100;
        predictionObj = {
          direction: dir,
          probability: Math.round(Math.min(99, Math.max(50, prob))),
          confidenceLevel: pred.confidence_level || (prob >= 70 ? 'high' : 'moderate'),
        };
      } else if (rsi !== null || Math.abs(resolved.changePercent) >= 1) {
        let dir: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        let prob = 52;
        if (rsi !== null && rsi < 38) {
          dir = 'bullish';
          prob = 66;
        } else if (rsi !== null && rsi > 68) {
          dir = 'bearish';
          prob = 64;
        } else if (resolved.changePercent >= 1.2) {
          dir = 'bullish';
          prob = 61;
        } else if (resolved.changePercent <= -1.2) {
          dir = 'bearish';
          prob = 61;
        }
        predictionObj = {
          direction: dir,
          probability: prob,
          confidenceLevel: prob >= 65 ? 'moderate' : 'low',
        };
      }

      const indexImpact = Number(((c.weight * resolved.changePercent) / 100).toFixed(4));

      stocks.push({
        ...c,
        price: resolved.price,
        change: resolved.change,
        changePercent: resolved.changePercent,
        previousClose: resolved.previousClose,
        open: resolved.open,
        dayHigh: resolved.dayHigh,
        dayLow: resolved.dayLow,
        volume: resolved.volume,
        indexImpact,
        rsi,
        prediction: predictionObj,
        dataSource: resolved.source,
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
