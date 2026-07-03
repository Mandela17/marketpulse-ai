// API Route: Seed predictions for all key Nifty stocks
// Generates fresh predictions and resolves stale ones.
// No auth required — this is a personal project endpoint.

import { NextResponse } from 'next/server';
import { generatePrediction } from '@/lib/mlEngine';
import { computeRealTechnicals } from '@/lib/technicalAnalysis';
import { fetchDeliveryData, fetchRealPCR, fetchIndiaVIX, isFnOStock } from '@/lib/nseData';
import { fetchStockPrice } from '@/lib/stockData';
import { resolveUnresolvedPredictions } from '@/lib/predictionHistory';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const KEY_STOCKS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
  'SBIN', 'KOTAKBANK', 'AXISBANK', 'HINDUNILVR', 'ITC',
  'BAJFINANCE', 'BHARTIARTL', 'LT', 'MARUTI', 'TATAMOTORS',
  'SUNPHARMA', 'WIPRO', 'HCLTECH', 'NTPC', 'ONGC',
  'TATASTEEL', 'TITAN', 'ADANIENT', 'DRREDDY', 'CIPLA',
];

export async function GET() {
  const startTime = Date.now();
  const log: string[] = [];

  // Step 0: Resolve any stale unresolved predictions first
  let resolved = 0;
  let resolveCorrect = 0;
  try {
    log.push('[Seed] Step 0: Resolving stale predictions...');
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
    resolveCorrect = res.correct;
    log.push(`[Seed] Resolved ${res.resolved} predictions (${res.correct} correct)`);
  } catch (err: any) {
    log.push(`[Seed] Resolution failed: ${err.message}`);
  }

  // Step 1: Generate fresh predictions
  log.push('[Seed] Step 1: Generating fresh predictions...');
  const results: { symbol: string; status: 'ok' | 'error' | 'skipped'; direction?: string; confidence?: number; error?: string }[] = [];
  const vix = await fetchIndiaVIX().catch(() => null);

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
          results.push({ symbol, status: 'skipped', error: 'No technicals data' });
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
          results.push({ symbol, status: 'skipped', error: 'ML engine returned null' });
          return;
        }

        results.push({ symbol, status: 'ok', direction: prediction.direction, confidence: prediction.confidence });
      } catch (err: any) {
        results.push({ symbol, status: 'error', error: err.message });
        log.push(`[Seed] Error for ${symbol}: ${err.message}`);
      }
    }));

    if (i + batchSize < KEY_STOCKS.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  log.push(`[Seed] Done in ${duration}s: ${ok} ok, ${skipped} skipped, ${errors} errors`);

  return NextResponse.json({
    success: true,
    duration: `${duration}s`,
    summary: { ok, skipped, errors, total: KEY_STOCKS.length, resolved, resolveCorrect },
    results,
    log,
  });
}
