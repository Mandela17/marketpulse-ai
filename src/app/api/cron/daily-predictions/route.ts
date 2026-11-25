// Daily Cron: Generate predictions + Resolve yesterday's outcomes
// Schedule: Monday-Friday at 4:30 PM IST (after market close)
// 
// This endpoint:
// 1. Resolves all pending predictions using today's closing prices
// 2. Generates new predictions for 25 key Nifty stocks for tomorrow
//
// Auth: CRON_SECRET query param or Authorization header
// Uses Next.js after() to respond instantly and run in background.

import { NextResponse, after } from 'next/server';
import { generatePrediction } from '@/lib/mlEngine';
import { computeRealTechnicals } from '@/lib/technicalAnalysis';
import { resolveUnresolvedPredictions } from '@/lib/predictionHistory';
import { fetchStockPrice } from '@/lib/stockData';
import { fetchDeliveryData, fetchRealPCR, fetchIndiaVIX, isFnOStock } from '@/lib/nseData';
import { runAdaptiveLearningCycle } from '@/lib/adaptiveLearning';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minute timeout

const KEY_STOCKS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
  'SBIN', 'KOTAKBANK', 'AXISBANK', 'HINDUNILVR', 'ITC',
  'BAJFINANCE', 'BHARTIARTL', 'LT', 'MARUTI', 'TMCV', 'INDIGO',
  'SUNPHARMA', 'WIPRO', 'HCLTECH', 'NTPC', 'ONGC',
  'TATASTEEL', 'TITAN', 'ADANIENT', 'DRREDDY', 'CIPLA',
];

// ─── Background pipeline ────────────────────────────────────────────

async function runPredictionPipeline() {
  const startTime = Date.now();

  try {
    console.log(`[DailyPredictions] Starting at ${new Date().toISOString()}`);

    // Step 1: Resolve yesterday's predictions
    console.log('[DailyPredictions] Step 1: Resolving pending predictions...');

    const closingPrices: Record<string, { todayClose: number; prevClose: number }> = {};
    let fetchedCount = 0;

    // Include any symbols from pending unresolved predictions (not just KEY_STOCKS)
    const db = getServiceClient();
    const { data: pendingRows } = await db
      .from('predictions')
      .select('symbol')
      .is('resolved_at', null);
    const symbolsToFetch = Array.from(
      new Set([...KEY_STOCKS, ...(pendingRows || []).map((r: any) => String(r.symbol)).filter(Boolean)])
    );

    // Fetch today's closing prices for all stocks (batches of 8, minimal delay)
    for (let i = 0; i < symbolsToFetch.length; i += 8) {
      const batch = symbolsToFetch.slice(i, i + 8);
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
      if (i + 8 < symbolsToFetch.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    console.log(`[DailyPredictions] Fetched closing prices for ${fetchedCount}/${KEY_STOCKS.length} stocks`);

    // Resolve predictions
    const resolution = await resolveUnresolvedPredictions(closingPrices);
    console.log(`[DailyPredictions] Resolved ${resolution.resolved} predictions (${resolution.correct} correct)`);

    // Step 1.5: Run adaptive learning
    try {
      const adaptive = await runAdaptiveLearningCycle();
      console.log(`[DailyPredictions] Adaptive learning: GBDT=${adaptive.newWeights.gbdt}, Heuristic=${adaptive.newWeights.heuristic}`);
    } catch (err: any) {
      console.warn(`[DailyPredictions] Adaptive learning failed: ${err.message}`);
    }

    // Step 2: Generate new predictions
    console.log('[DailyPredictions] Step 2: Generating new predictions...');

    const results: { symbol: string; status: string; direction?: string; confidence?: number }[] = [];

    for (let i = 0; i < KEY_STOCKS.length; i += 8) {
      const batch = KEY_STOCKS.slice(i, i + 8);
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
          console.warn(`[DailyPredictions] Error for ${symbol}: ${err.message}`);
        }
      }));

      if (i + 8 < KEY_STOCKS.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    const ok = results.filter(r => r.status === 'ok').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors = results.filter(r => r.status === 'error').length;
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`[DailyPredictions] ✅ Generated ${ok} predictions (${skipped} skipped, ${errors} errors) in ${duration}s`);

    // Save run status
    try {
      const db = getServiceClient();
      await db.from('cron_runs').upsert({
        job_name: 'daily-predictions',
        ran_at: new Date().toISOString(),
        status: 'success',
        duration_ms: Date.now() - startTime,
        stocks_processed: ok,
        predictions_resolved: resolution.resolved,
      }, { onConflict: 'job_name' });
    } catch {}
  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[DailyPredictions] ❌ Failed after ${duration}s:`, error);

    try {
      const db = getServiceClient();
      await db.from('cron_runs').upsert({
        job_name: 'daily-predictions',
        ran_at: new Date().toISOString(),
        status: 'failed',
        duration_ms: Date.now() - startTime,
        error_message: error.message?.substring(0, 500),
      }, { onConflict: 'job_name' });
    } catch {}
  }
}

// ─── Main Handler ───────────────────────────────────────────────────
// Responds IMMEDIATELY, then runs the full pipeline in the background.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;

  const authHeader = request.headers.get('authorization');
  const headerMatch = authHeader === `Bearer ${cronSecret}`;
  const queryMatch = querySecret === cronSecret;

  if (process.env.NODE_ENV !== 'development' && cronSecret && !headerMatch && !queryMatch) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Schedule background work via after() — Vercel keeps the function
  // alive for up to maxDuration (120s) even though the response is instant.
  after(runPredictionPipeline);

  console.log('[DailyPredictions] ⏰ Triggered — pipeline scheduled via after()');
  return NextResponse.json({
    success: true,
    message: 'Prediction pipeline scheduled — running in background',
    timestamp: new Date().toISOString(),
  });
}
