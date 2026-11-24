// API Route: High-performance Stock Screener
// Returns unified prices, technicals (RSI, volume), and AI predictions for top liquid NSE stocks.
// Optimized with database batch lookups, in-memory caching, and multi-symbol quote fetching.

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
  } | null;
}

// In-memory cache for screener results (5 minutes)
let screenerCache: { data: any; timestamp: number } | null = null;
const SCREENER_CACHE_TTL = 5 * 60 * 1000;

// Fetch multiple stock quotes in batch via Yahoo v6 quote endpoint
async function fetchYahooBatchQuotes(symbols: string[]): Promise<Map<string, any>> {
  const quoteMap = new Map<string, any>();
  
  // Map symbols to Yahoo tickers and maintain reverse mapping
  const tickerToSymbol = new Map<string, string>();
  const yahooTickers: string[] = [];

  for (const sym of symbols) {
    const cached = quoteCache.get<any>(`quote:${sym}`);
    if (cached && cached.price > 0) {
      quoteMap.set(sym, cached);
    } else {
      const yt = toYahooTicker(sym);
      tickerToSymbol.set(yt.toUpperCase(), sym);
      yahooTickers.push(yt);
    }
  }

  // If all quotes were in cache, return immediately
  if (yahooTickers.length === 0) return quoteMap;

  // Batch query in chunks of 25 to respect URL limits
  const chunkSize = 25;
  for (let i = 0; i < yahooTickers.length; i += chunkSize) {
    const chunk = yahooTickers.slice(i, i + chunkSize);
    const encoded = chunk.map(t => encodeURIComponent(t)).join(',');
    const urls = [
      `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${encoded}`,
      `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${encoded}`,
    ];

    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout
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
          const results = json?.quoteResponse?.result || [];
          for (const q of results) {
            const sym = tickerToSymbol.get(q.symbol?.toUpperCase()) || q.symbol?.replace(/\.NS$/, '');
            if (sym && q.regularMarketPrice > 0) {
              const price = q.regularMarketPrice;
              const prevClose = q.regularMarketPreviousClose || price;
              const change = q.regularMarketChange ?? (price - prevClose);
              const changePercent = prevClose > 0 ? (change / prevClose) * 100 : (q.regularMarketChangePercent ?? 0);

              const quoteData = {
                symbol: sym,
                price,
                change,
                changePercent,
                dayHigh: q.regularMarketDayHigh || price,
                dayLow: q.regularMarketDayLow || price,
                volume: q.regularMarketVolume || 0,
              };
              quoteMap.set(sym, quoteData);
              quoteCache.set(`quote:${sym}`, quoteData, QUOTE_TTL);
            }
          }
          break; // Chunk succeeded
        }
      } catch {
        continue; // Try secondary URL or proceed
      }
    }
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

    // 1. Fetch AI predictions in one query (unresolved in last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: dbPredictions } = await db
      .from('predictions')
      .select('symbol, predicted_direction, probability, confidence_level, predicted_at, supporting_signals')
      .is('resolved_at', null)
      .gte('predicted_at', sevenDaysAgo)
      .order('predicted_at', { ascending: false });

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

    // 3. Fetch live batch quotes from Yahoo/Upstox
    let quoteMap = new Map<string, any>();
    try {
      quoteMap = await fetchYahooBatchQuotes(SCREENER_UNIVERSE);
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

      // Resolve price & change (prefer live, fallback to feature row)
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

      // Normalize prediction direction: 'up' -> 'bullish', 'down' -> 'bearish'
      let predictionObj: ScreenerItem['prediction'] = null;
      if (pred) {
        const dir = pred.predicted_direction === 'up' ? 'bullish' :
                    pred.predicted_direction === 'down' ? 'bearish' : 'neutral';
        predictionObj = {
          direction: dir,
          probability: pred.probability || 50,
          confidenceLevel: pred.confidence_level || 'moderate',
          supportingSignals: pred.supporting_signals || [],
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

