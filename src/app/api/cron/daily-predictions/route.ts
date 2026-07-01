// Daily Cron: Generate predictions + Resolve yesterday's outcomes
// Schedule: Monday-Friday at 4:30 PM IST (after market close)
// 
// This endpoint:
// 1. Resolves all pending predictions using today's closing prices
// 2. Generates new predictions for 25 key Nifty stocks for tomorrow
//
// Auth: CRON_SECRET query param (or dev mode)

import { NextResponse } from 'next/server';
import { generatePrediction } from '@/lib/mlEngine';
import { computeRealTechnicals } from '@/lib/technicalAnalysis';
import { resolveUnresolvedPredictions } from '@/lib/predictionHistory';
import { fetchStockPrice } from '@/lib/stockData';
import { fetchDeliveryData, fetchRealPCR, fetchIndiaVIX, isFnOStock } from '@/lib/nseData';
import { runAdaptiveLearningCycle } from '@/lib/adaptiveLearning';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minute timeout

const KEY_STOCKS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
  'SBIN', 'KOTAKBANK', 'AXISBANK', 'HINDUNILVR', 'ITC',
  'BAJFINANCE', 'BHARTIARTL', 'LT', 'MARUTI', 'TATAMOTORS',
  'SUNPHARMA', 'WIPRO', 'HCLTECH', 'NTPC', 'ONGC',
  'TATASTEEL', 'TITAN', 'ADANIENT', 'DRREDDY', 'CIPLA',
];

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;

  // Auth check
  if (process.env.NODE_ENV !== 'development' && cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log: string[] = [];
  log.push(`[Cron] Starting daily run at ${new Date().toISOString()}`);

  // ─── Step 1: Resolve yesterday's predictions ────────────────────────
  log.push('[Cron] Step 1: Resolving pending predictions...');
  
  const closingPrices: Record<string, { todayClose: number; prevClose: number }> = {};
  let fetchedCount = 0;

  // Fetch today's closing prices for all stocks
  const batchSize = 5;
  for (let i = 0; i < KEY_STOCKS.length; i += batchSize) {
    const batch = KEY_STOCKS.slice(i, i + batchSize);
    await Promise.all(batch.map(async (symbol) => {
      try {
        const quote = await fetchStockPrice(symbol);
        if (quote && quote.price > 0) {
          closingPrices[symbol] = {
            todayClose: quote.price,
            prevClose: quote.previousClose || quote.price,
          };
          fetchedCount++;
        }
      } catch {}
    }));
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < KEY_STOCKS.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  log.push(`[Cron] Fetched closing prices for ${fetchedCount}/${KEY_STOCKS.length} stocks`);

  // Resolve predictions
  const resolution = await resolveUnresolvedPredictions(closingPrices);
  log.push(`[Cron] Resolved ${resolution.resolved} predictions (${resolution.correct} correct)`);

  // ─── Step 1.5: Run adaptive learning to tune ensemble weights ───────
  log.push('[Cron] Step 1.5: Running adaptive learning cycle...');
  try {
    const adaptive = await runAdaptiveLearningCycle();
    log.push(`[Cron] Adaptive learning: GBDT 7d acc=${adaptive.gbdtAccuracy7d}%, ` +
      `Heuristic 7d acc=${adaptive.heuristicAccuracy7d}%, ` +
      `New weights: GBDT=${adaptive.newWeights.gbdt}, Heuristic=${adaptive.newWeights.heuristic}`);
  } catch (err: any) {
    log.push(`[Cron] Adaptive learning failed: ${err.message}`);
  }

  // ─── Step 2: Generate new predictions ───────────────────────────────
  log.push('[Cron] Step 2: Generating new predictions...');
  
  const vix = await fetchIndiaVIX().catch(() => null);
  const results: { symbol: string; status: string; direction?: string; confidence?: number }[] = [];

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

        if (prediction) {
          results.push({ symbol, status: 'ok', direction: prediction.direction, confidence: prediction.confidence });
        } else {
          results.push({ symbol, status: 'skipped' });
        }
      } catch (err: any) {
        results.push({ symbol, status: 'error' });
        log.push(`[Cron] Error for ${symbol}: ${err.message}`);
      }
    }));

    if (i + batchSize < KEY_STOCKS.length) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  log.push(`[Cron] Generated ${ok} predictions (${skipped} skipped, ${errors} errors)`);
  log.push(`[Cron] Completed in ${duration}s`);

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    duration: `${duration}s`,
    resolution: {
      resolved: resolution.resolved,
      correct: resolution.correct,
      accuracy: resolution.resolved > 0 
        ? `${((resolution.correct / resolution.resolved) * 100).toFixed(1)}%` 
        : 'N/A',
    },
    predictions: { ok, skipped, errors, total: KEY_STOCKS.length },
    results,
    log,
  });
}
