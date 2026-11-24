// Shared Batch Market Quote + AI Enrichment Fetcher
// Used by /api/heatmap and /api/watchlist to fetch up to hundreds of NSE stocks
// in 1 single Upstox API call (~100ms), falling back cleanly to Yahoo Finance 5D chart + Supabase DB.

import { getServiceClient } from './supabase';
import { getInstrumentKey } from './upstoxInstruments';
import { invalidateUpstoxTokens } from './upstoxTokenStore';
import { toYahooTicker } from './symbolMap';

export interface BatchQuoteData {
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

export interface BatchEnrichedItem {
  symbol: string;
  quote: BatchQuoteData;
  rsi: number | null;
  prediction: {
    direction: 'bullish' | 'bearish' | 'neutral';
    probability: number;
    confidenceLevel: string;
  } | null;
}

const SYMBOL_DB_ALIASES: Record<string, string[]> = {
  TATAMOTORS: ['TATAMOTORS', 'TMCV', 'TMPV'],
  ZOMATO: ['ZOMATO', 'ETERNAL'],
  'L&T': ['L&T', 'LT'],
  MAZAGON: ['MAZAGON', 'MAZDOCK'],
  POLICYBAZAAR: ['POLICYBAZAAR', 'POLICYBZR'],
  INTERGLOBE: ['INTERGLOBE', 'INDIGO'],
};

function expandDbLookupSymbols(symbols: string[]): string[] {
  const expanded = new Set<string>();
  for (const s of symbols) {
    const upper = s.toUpperCase().trim();
    expanded.add(upper);
    for (const alias of SYMBOL_DB_ALIASES[upper] || []) {
      expanded.add(alias);
    }
  }
  return Array.from(expanded);
}

/**
 * Fetch quotes in ONE single Upstox batch request (max 500 instruments per call).
 * Derives previousClose = last_price - net_change because ohlc.close equals last_price after EOD.
 */
async function fetchUpstoxBatch(
  symbols: string[],
  token: string
): Promise<{ quotes: Map<string, BatchQuoteData>; unauthorized: boolean }> {
  const quotes = new Map<string, BatchQuoteData>();
  const keyToSymbols = new Map<string, string[]>();
  const uniqueKeys = new Set<string>();

  for (const rawSym of symbols) {
    const sym = rawSym.toUpperCase().trim();
    const ik = getInstrumentKey(sym);
    if (ik) {
      uniqueKeys.add(ik);
      const list = keyToSymbols.get(ik) || [];
      list.push(sym);
      keyToSymbols.set(ik, list);
    }
  }

  const keys = Array.from(uniqueKeys);
  if (keys.length === 0) return { quotes, unauthorized: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(keys.join(','))}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    if (res.status === 401) return { quotes, unauthorized: true };
    if (!res.ok) return { quotes, unauthorized: false };

    const json = await res.json();
    const entries = Object.entries(json?.data || {}) as [string, any][];

    for (const [dictKey, q] of entries) {
      if (!q || !(q.last_price > 0)) continue;

      const matchedSyms = q.instrument_token ? keyToSymbols.get(q.instrument_token) : undefined;
      const targets =
        matchedSyms && matchedSyms.length > 0
          ? matchedSyms
          : (() => {
              const rawSym = (q.symbol || dictKey.split(':')[1] || '').toUpperCase();
              return symbols.includes(rawSym) ? [rawSym] : [];
            })();

      if (targets.length === 0) continue;

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

      const parsed: BatchQuoteData = {
        price: Number(price.toFixed(2)),
        change: Number(netChange.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        previousClose: Number(prevClose.toFixed(2)),
        open: Number((q.ohlc?.open || price).toFixed(2)),
        dayHigh: Number((q.ohlc?.high || price).toFixed(2)),
        dayLow: Number((q.ohlc?.low || price).toFixed(2)),
        volume: Number(q.volume || 0),
        source: 'upstox',
      };

      for (const sym of targets) {
        quotes.set(sym, parsed);
      }
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
 * range=5d provides accurate previous-trading-day close even off-market / weekends.
 */
async function fetchYahoo5dFallback(symbols: string[]): Promise<Map<string, BatchQuoteData>> {
  const quotes = new Map<string, BatchQuoteData>();
  if (symbols.length === 0) return quotes;

  const chunkSize = 10;
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (rawSym) => {
        const sym = rawSym.toUpperCase().trim();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
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
          // Skip timed-out quote
        } finally {
          clearTimeout(timeout);
        }
      })
    );
  }

  return quotes;
}

export async function fetchBatchEnrichedQuotes(
  rawSymbols: string[],
  upstoxToken: string
): Promise<{
  items: Map<string, BatchEnrichedItem>;
  upstoxCount: number;
  yahooCount: number;
}> {
  const symbols = Array.from(new Set(rawSymbols.map((s) => s.toUpperCase().trim()).filter(Boolean)));
  const items = new Map<string, BatchEnrichedItem>();
  if (symbols.length === 0) return { items, upstoxCount: 0, yahooCount: 0 };

  const db = getServiceClient();
  const dbLookupSymbols = expandDbLookupSymbols(symbols);

  // Run DB lookups + Upstox batch quote in parallel
  const [predResult, featResult, upstoxResult] = await Promise.all([
    db
      .from('predictions')
      .select('symbol, predicted_direction, probability, confidence_level, predicted_at')
      .in('symbol', dbLookupSymbols)
      .order('predicted_at', { ascending: false })
      .limit(Math.max(300, dbLookupSymbols.length * 4)),
    db
      .from('daily_features')
      .select('symbol, close, open, high, low, volume, rsi, date')
      .in('symbol', dbLookupSymbols)
      .order('date', { ascending: false })
      .limit(Math.max(300, dbLookupSymbols.length * 4)),
    upstoxToken
      ? fetchUpstoxBatch(symbols, upstoxToken)
      : Promise.resolve({ quotes: new Map<string, BatchQuoteData>(), unauthorized: false }),
  ]);

  if (upstoxResult.unauthorized) {
    await invalidateUpstoxTokens();
  }

  const quoteMap = new Map<string, BatchQuoteData>(upstoxResult.quotes);
  const missingSymbols = symbols.filter((s) => !quoteMap.has(s));

  if (missingSymbols.length > 0) {
    const yahooQuotes = await fetchYahoo5dFallback(missingSymbols);
    for (const [sym, q] of yahooQuotes.entries()) {
      quoteMap.set(sym, q);
    }
  }

  const predMap = new Map<string, any>();
  for (const p of predResult.data || []) {
    if (!predMap.has(p.symbol)) predMap.set(p.symbol, p);
  }

  const featMap = new Map<string, any>();
  for (const f of featResult.data || []) {
    if (!featMap.has(f.symbol)) featMap.set(f.symbol, f);
  }

  const findDbMatch = (map: Map<string, any>, sym: string) => {
    if (map.has(sym)) return map.get(sym);
    for (const alias of SYMBOL_DB_ALIASES[sym] || []) {
      if (map.has(alias)) return map.get(alias);
    }
    return undefined;
  };

  let upstoxCount = 0;
  let yahooCount = 0;

  for (const sym of symbols) {
    const q = quoteMap.get(sym);
    const feat = findDbMatch(featMap, sym);
    const pred = findDbMatch(predMap, sym);
    const rsi = feat?.rsi != null ? parseFloat(Number(feat.rsi).toFixed(1)) : null;

    let resolved: BatchQuoteData | null = q || null;
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

    let prediction: BatchEnrichedItem['prediction'] = null;
    if (pred) {
      const dir =
        pred.predicted_direction === 'up'
          ? 'bullish'
          : pred.predicted_direction === 'down'
            ? 'bearish'
            : 'neutral';
      let prob = Number(pred.probability || 55);
      if (prob > 0 && prob <= 1) prob *= 100;
      prediction = {
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
      prediction = {
        direction: dir,
        probability: prob,
        confidenceLevel: prob >= 65 ? 'moderate' : 'low',
      };
    }

    items.set(sym, { symbol: sym, quote: resolved, rsi, prediction });
  }

  return { items, upstoxCount, yahooCount };
}

