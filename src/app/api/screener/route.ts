// API Route: High-performance Stock Screener
// Returns unified prices, technicals (RSI, volume), and AI predictions for top liquid NSE stocks.
// Optimized with database batch lookups, in-memory caching, and robust quote fetching.

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getStockBySymbol } from '@/lib/sectorData';
import { toYahooTicker } from '@/lib/symbolMap';
import { quoteCache, QUOTE_TTL } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export const SCREENER_UNIVERSE = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL',
  'ITC', 'LT', 'KOTAKBANK', 'AXISBANK', 'TITAN', 'SUNPHARMA', 'BAJFINANCE',
  'MARUTI', 'TMCV', 'INDIGO', 'WIPRO', 'HCLTECH', 'NTPC', 'POWERGRID',
  'M&M', 'TATASTEEL', 'JSWSTEEL', 'COALINDIA', 'ADANIENT', 'ADANIPORTS',
  'HINDUNILVR', 'DRREDDY', 'CIPLA', 'NESTLEIND', 'ASIANPAINT', 'HEROMOTOCO',
  'BAJAJ-AUTO', 'EICHERMOT', 'BPCL', 'ONGC', 'ULTRACEMCO', 'GRASIM',
  'BEL', 'HAL', 'TRENT', 'INDUSINDBK', 'BRITANNIA', 'TATACONSUM',
  'APOLLOHOSP', 'BAJAJFINSV', 'TECHM', 'DIVISLAB', 'SHRIRAMFIN',
];

interface ScreenerItem {
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
  prediction: {
    direction: 'bullish' | 'bearish' | 'neutral';
    probability: number;
    confidenceLevel: string;
    supportingSignals: string[];
  };
}

// In-memory cache for screener results (5 minutes)
let screenerCache: { data: any; timestamp: number } | null = null;
const SCREENER_CACHE_TTL = 5 * 60 * 1000;

// Fetch multiple stock quotes in parallel batches using Yahoo v8 chart endpoint
async function fetchBatchQuotes(symbols: string[]): Promise<Map<string, any>> {
  const quoteMap = new Map<string, any>();
  const toFetch: string[] = [];

  for (const sym of symbols) {
    const cached = quoteCache.get<any>(`quote:${sym}`);
    if (cached && cached.price > 0) {
      quoteMap.set(sym, cached);
    } else {
      toFetch.push(sym);
    }
  }

  if (toFetch.length === 0) return quoteMap;

  // Process in chunks of 10 to stay fast and avoid socket saturation
  const chunkSize = 10;
  for (let i = 0; i < toFetch.length; i += chunkSize) {
    const chunk = toFetch.slice(i, i + chunkSize);
    const promises = chunk.map(async (sym) => {
      try {
        const yt = toYahooTicker(sym);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yt)}?interval=1d&range=1d`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
          },
          signal: controller.signal,
          next: { revalidate: 60 },
        });
        clearTimeout(timeout);

        if (res.ok) {
          const json = await res.json();
          const meta = json?.chart?.result?.[0]?.meta;
          if (meta && meta.regularMarketPrice > 0) {
            const price = meta.regularMarketPrice;
            const prevClose = meta.chartPreviousClose || meta.previousClose || price;
            const change = price - prevClose;
            const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

            const quoteData = {
              symbol: sym,
              price,
              change,
              changePercent,
              dayHigh: meta.regularMarketDayHigh || price,
              dayLow: meta.regularMarketDayLow || price,
              volume: meta.regularMarketVolume || 0,
            };
            quoteMap.set(sym, quoteData);
            quoteCache.set(`quote:${sym}`, quoteData, QUOTE_TTL);
          }
        }
      } catch {
        // Continue to fallback
      }
    });

    await Promise.all(promises);
  }

  return quoteMap;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  // Return cached result if fresh and not forced
  if (!forceRefresh && screenerCache && Date.now() - screenerCache.timestamp < SCREENER_CACHE_TTL) {
    return NextResponse.json(screenerCache.data);
  }

  try {
    const db = getServiceClient();

    // 1. Fetch AI predictions: get latest predictions per stock (active OR resolved from last session)
    // Removed `.is('resolved_at', null)` so resolved predictions after market close are preserved!
    const { data: dbPredictions } = await db
      .from('predictions')
      .select('symbol, predicted_direction, probability, confidence_level, predicted_at, supporting_signals, resolved_at')
      .order('predicted_at', { ascending: false })
      .limit(300);

    const predMap = new Map<string, any>();
    if (dbPredictions) {
      for (const p of dbPredictions) {
        if (!predMap.has(p.symbol)) {
          predMap.set(p.symbol, p);
        }
      }
    }

    // 2. Fetch latest daily_features for baseline prices & RSI
    const { data: featureRows } = await db
      .from('daily_features')
      .select('symbol, close, open, high, low, volume, rsi, date')
      .order('date', { ascending: false })
      .limit(300);

    const featureMap = new Map<string, any>();
    if (featureRows) {
      for (const f of featureRows) {
        if (!featureMap.has(f.symbol)) {
          featureMap.set(f.symbol, f);
        }
      }
    }

    // 3. Fetch live batch quotes from Yahoo v8 chart endpoint
    let quoteMap = new Map<string, any>();
    try {
      quoteMap = await fetchBatchQuotes(SCREENER_UNIVERSE);
    } catch (e) {
      console.warn('[Screener API] Batch quote fetch warning:', e);
    }

    // 4. Assemble consolidated stock screener items
    const stocks: ScreenerItem[] = [];

    for (const symbol of SCREENER_UNIVERSE) {
      const meta = getStockBySymbol(symbol);
      const live = quoteMap.get(symbol);
      const feat = featureMap.get(symbol);
      const pred = predMap.get(symbol);

      // Resolve price & change (prefer live quote, fallback to feature row)
      let price = 0;
      let change = 0;
      let changePercent = 0;
      let dayHigh = 0;
      let dayLow = 0;
      let volume = 0;
      let rsi = feat?.rsi ? parseFloat(Number(feat.rsi).toFixed(1)) : null;

      if (live && live.price > 0) {
        price = live.price;
        change = live.change;
        changePercent = live.changePercent;
        dayHigh = live.dayHigh;
        dayLow = live.dayLow;
        volume = live.volume;
      } else if (feat && feat.close > 0) {
        price = Number(feat.close);
        dayHigh = Number(feat.high || price);
        dayLow = Number(feat.low || price);
        volume = Number(feat.volume || 0);
        const open = Number(feat.open || price);
        change = price - open;
        changePercent = open > 0 ? (change / open) * 100 : 0;
      }

      // If price is completely missing, skip
      if (price <= 0) continue;

      // Ensure prediction is ALWAYS valid (never null)
      let predictionObj: ScreenerItem['prediction'];

      if (pred) {
        const dir = pred.predicted_direction === 'up' ? 'bullish' :
                    pred.predicted_direction === 'down' ? 'bearish' : 'neutral';
        predictionObj = {
          direction: dir,
          probability: pred.probability || 55,
          confidenceLevel: pred.confidence_level || (pred.probability >= 70 ? 'high' : 'moderate'),
          supportingSignals: pred.supporting_signals || [],
        };
      } else {
        // Heuristic AI technical inference based on RSI, 24h momentum, and volume
        let dir: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        let prob = 50;
        const signals: string[] = [];

        if (rsi !== null) {
          if (rsi < 35) {
            dir = 'bullish';
            prob = 68;
            signals.push(`RSI Oversold (${rsi}) — strong mean-reversion bounce expected`);
          } else if (rsi > 68) {
            dir = 'bearish';
            prob = 65;
            signals.push(`RSI Overbought (${rsi}) — consolidation / pullback risk`);
          }
        }

        if (changePercent >= 0.8) {
          if (dir === 'neutral') {
            dir = 'bullish';
            prob = 62;
          }
          signals.push(`Strong daily momentum (+${changePercent.toFixed(1)}%)`);
        } else if (changePercent <= -0.8) {
          if (dir === 'neutral') {
            dir = 'bearish';
            prob = 62;
          }
          signals.push(`Sustained selling pressure (${changePercent.toFixed(1)}%)`);
        }

        if (signals.length === 0) {
          signals.push('Consolidating near key pivot range');
        }

        predictionObj = {
          direction: dir,
          probability: prob,
          confidenceLevel: prob >= 70 ? 'high' : prob >= 60 ? 'moderate' : 'low',
          supportingSignals: signals,
        };
      }

      stocks.push({
        symbol,
        name: meta?.name || symbol,
        sector: meta?.sector || 'General',
        price: parseFloat(price.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        changePercent: parseFloat(changePercent.toFixed(2)),
        dayHigh: parseFloat(dayHigh.toFixed(2)),
        dayLow: parseFloat(dayLow.toFixed(2)),
        volume,
        rsi,
        prediction: predictionObj,
      });
    }

    const responseData = {
      stocks,
      total: stocks.length,
      timestamp: new Date().toISOString(),
      stats: {
        bullishCount: stocks.filter(s => s.prediction?.direction === 'bullish').length,
        bearishCount: stocks.filter(s => s.prediction?.direction === 'bearish').length,
        gainersCount: stocks.filter(s => s.changePercent > 0).length,
        losersCount: stocks.filter(s => s.changePercent < 0).length,
      },
    };

    // Cache the assembled payload
    screenerCache = { data: responseData, timestamp: Date.now() };

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error: any) {
    console.error('[Screener API] Error:', error);

    // Fallback to cached data if error occurs
    if (screenerCache) {
      return NextResponse.json(screenerCache.data);
    }

    return NextResponse.json(
      { error: 'Failed to generate stock screener scan', details: error.message },
      { status: 500 }
    );
  }
}
