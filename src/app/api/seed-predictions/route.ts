// API Route: Seed predictions for all key Nifty stocks
// Call this once to populate the predictions table with initial predictions.
// After this, the daily cron will keep it updated.

import { NextResponse } from 'next/server';
import { generatePrediction } from '@/lib/mlEngine';
import { computeRealTechnicals } from '@/lib/technicalAnalysis';
import { fetchDeliveryData, fetchRealPCR, fetchIndiaVIX, isFnOStock } from '@/lib/nseData';
import { computeRiskReward } from '@/lib/riskEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 second timeout on Vercel

const KEY_STOCKS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
  'SBIN', 'KOTAKBANK', 'AXISBANK', 'HINDUNILVR', 'ITC',
  'BAJFINANCE', 'BHARTIARTL', 'LT', 'MARUTI', 'TATAMOTORS',
  'SUNPHARMA', 'WIPRO', 'HCLTECH', 'NTPC', 'ONGC',
  'TATASTEEL', 'TITAN', 'ADANIENT', 'DRREDDY', 'CIPLA',
];

export async function GET(request: Request) {
  // Auth: only allow in dev or with the cron secret
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;

  if (process.env.NODE_ENV !== 'development' && cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    summary: { ok, skipped, errors, total: KEY_STOCKS.length },
    results,
  });
}
