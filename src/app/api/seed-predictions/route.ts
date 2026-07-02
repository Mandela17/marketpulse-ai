// API Route: Seed predictions for all key Nifty stocks
// Call this once to populate the predictions table with initial predictions.
// After this, the daily cron will keep it updated.

import { NextResponse } from 'next/server';
import { generatePrediction } from '@/lib/mlEngine';
import { computeRealTechnicals } from '@/lib/technicalAnalysis';
import { fetchDeliveryData, fetchRealPCR, fetchIndiaVIX, isFnOStock } from '@/lib/nseData';
import { computeRiskReward } from '@/lib/riskEngine';
import { fetchStockPrice } from '@/lib/stockData';
import { resolveUnresolvedPredictions } from '@/lib/predictionHistory';
import { createClient } from '@supabase/supabase-js';
import { getUserRole } from '@/lib/userRoles';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 120 second timeout for batch generation

const KEY_STOCKS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
  'SBIN', 'KOTAKBANK', 'AXISBANK', 'HINDUNILVR', 'ITC',
  'BAJFINANCE', 'BHARTIARTL', 'LT', 'MARUTI', 'TATAMOTORS',
  'SUNPHARMA', 'WIPRO', 'HCLTECH', 'NTPC', 'ONGC',
  'TATASTEEL', 'TITAN', 'ADANIENT', 'DRREDDY', 'CIPLA',
];

export async function GET(request: Request) {
  // Auth: allow in dev, with cron secret, or via Authorization header
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  const isDev = process.env.NODE_ENV === 'development';
  const hasCronSecret = cronSecret && (querySecret === cronSecret || authHeader === `Bearer ${cronSecret}`);

  // Check for logged-in user via Supabase auth header
  let isAuthenticated = false;
  if (!isDev && !hasCronSecret) {
    try {
      let accessToken = '';
      if (authHeader?.startsWith('Bearer ')) {
        accessToken = authHeader.slice(7);
      }
      if (accessToken) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || '',
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        );
        const { data: { user } } = await supabase.auth.getUser(accessToken);
        isAuthenticated = !!user;
      }
    } catch (err) {
      console.warn('[Seed] Auth check failed:', err);
    }
  }

  if (!isDev && !hasCronSecret && !isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized — please log in' }, { status: 401 });
  }
  // Step 0: Resolve any stale unresolved predictions first
  let resolved = 0;
  try {
    const closingPrices: Record<string, { todayClose: number; prevClose: number }> = {};
    for (let i = 0; i < KEY_STOCKS.length; i += 5) {
      const batch = KEY_STOCKS.slice(i, i + 5);
      await Promise.all(batch.map(async (sym) => {
        try {
          const quote = await fetchStockPrice(sym);
          if (quote && quote.price > 0) {
            closingPrices[sym] = { todayClose: quote.price, prevClose: quote.previousClose || quote.price };
          }
        } catch {}
      }));
    }
    const res = await resolveUnresolvedPredictions(closingPrices);
    resolved = res.resolved;
    console.log(`[Seed] Resolved ${res.resolved} stale predictions (${res.correct} correct)`);
  } catch (err) {
    console.warn('[Seed] Stale resolution failed:', err);
  }

  const results: { symbol: string; status: 'ok' | 'error' | 'skipped'; direction?: string; confidence?: number }[] = [];
  const vix = await fetchIndiaVIX().catch(() => null);

  // Process in small batches to avoid timeouts
  const batchSize = 5;
  for (let i = 0; i < KEY_STOCKS.length; i += batchSize) {
    const batch = KEY_STOCKS.slice(i, i + batchSize);

    await Promise.all(batch.map(async (symbol) => {
      try {
        const [technicals, deliveryData, pcrData] = await Promise.all([
          computeRealTechnicals(symbol),
          fetchDeliveryData(symbol).catch(() => null),
          isFnOStock(symbol) ? fetchRealPCR(symbol).catch(() => null) : Promise.resolve(null),
        ]);

        if (!technicals || technicals.currentPrice === 0) {
          results.push({ symbol, status: 'skipped' });
          return;
        }

        const prediction = await generatePrediction(symbol, {
          rsi: technicals.rsi,
          macdHist: technicals.histogram,
          ema20: technicals.ema20,
          ema50: technicals.ema50,
          close: technicals.currentPrice,
          volumeRatio: technicals.volumeRatio,
          pcr: pcrData?.pcr,
          deliveryPct: deliveryData?.deliveryPercent,
          bollingerUpper: technicals.bollingerUpper,
          bollingerLower: technicals.bollingerLower,
        });

        if (!prediction) {
          results.push({ symbol, status: 'skipped' });
          return;
        }

        // Also verify the DB is reachable by doing a direct count query
        results.push({ symbol, status: 'ok', direction: prediction.direction, confidence: prediction.confidence });
      } catch (err: any) {
        results.push({ symbol, status: 'error' });
        console.warn(`[Seed] Failed for ${symbol}:`, err.message);
      }
    }));

    // Small delay between batches
    if (i + batchSize < KEY_STOCKS.length) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;

  return NextResponse.json({
    success: true,
    summary: { ok, skipped, errors, total: KEY_STOCKS.length, resolved },
    results,
  });
}
