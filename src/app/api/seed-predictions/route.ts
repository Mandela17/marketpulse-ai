// API Route: Seed predictions — optimized for Vercel Hobby 60s timeout
// Processes top 10 stocks quickly. No auth required.

import { NextResponse } from 'next/server';
import { generatePrediction } from '@/lib/mlEngine';
import { computeRealTechnicals } from '@/lib/technicalAnalysis';
import { fetchDeliveryData, fetchRealPCR, isFnOStock } from '@/lib/nseData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Hobby max

// Only process 10 stocks per call to stay within timeout
// The daily cron handles all 25
const KEY_STOCKS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
  'SBIN', 'BHARTIARTL', 'LT', 'TATAMOTORS', 'ITC',
];

export async function GET(request: Request) {
  const startTime = Date.now();
  try {
  const { searchParams } = new URL(request.url);
  
  // Allow selecting a batch: ?batch=2 processes stocks 11-20
  const batch = parseInt(searchParams.get('batch') || '1', 10);
  
  const ALL_STOCKS = [
    'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
    'SBIN', 'BHARTIARTL', 'LT', 'TATAMOTORS', 'ITC',
    'BAJFINANCE', 'KOTAKBANK', 'AXISBANK', 'HINDUNILVR', 'MARUTI',
    'SUNPHARMA', 'WIPRO', 'HCLTECH', 'NTPC', 'ONGC',
    'TATASTEEL', 'TITAN', 'ADANIENT', 'DRREDDY', 'CIPLA',
  ];
  
  const BATCH_SIZE = 10;
  const startIdx = (batch - 1) * BATCH_SIZE;
  const stocks = ALL_STOCKS.slice(startIdx, startIdx + BATCH_SIZE);
  const totalBatches = Math.ceil(ALL_STOCKS.length / BATCH_SIZE);

  if (stocks.length === 0) {
    return NextResponse.json({ success: true, summary: { ok: 0, total: 0 }, message: 'No stocks in this batch' });
  }

  const results: { symbol: string; status: 'ok' | 'error' | 'skipped'; direction?: string; confidence?: number; error?: string }[] = [];

  // Process 3 at a time (fast parallel)
  const parallelSize = 3;
  for (let i = 0; i < stocks.length; i += parallelSize) {
    // Check if we're running out of time (leave 5s buffer)
    if (Date.now() - startTime > 50000) {
      stocks.slice(i).forEach(s => results.push({ symbol: s, status: 'skipped', error: 'timeout' }));
      break;
    }

    const chunk = stocks.slice(i, i + parallelSize);
    await Promise.all(chunk.map(async (symbol) => {
      try {
        const technicals = await computeRealTechnicals(symbol);

        if (!technicals || technicals.currentPrice === 0) {
          results.push({ symbol, status: 'skipped', error: 'No data' });
          return;
        }

        // Fetch extras in parallel but don't block on failure
        const [deliveryData, pcrData] = await Promise.all([
          fetchDeliveryData(symbol).catch(() => null),
          isFnOStock(symbol) ? fetchRealPCR(symbol).catch(() => null) : Promise.resolve(null),
        ]);

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
          results.push({ symbol, status: 'skipped', error: 'ML returned null' });
          return;
        }

        results.push({ symbol, status: 'ok', direction: prediction.direction, confidence: prediction.confidence });
      } catch (err: any) {
        results.push({ symbol, status: 'error', error: err.message?.slice(0, 80) });
      }
    }));
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  return NextResponse.json({
    success: true,
    duration: `${duration}s`,
    batch,
    totalBatches,
    summary: { ok, skipped, errors, total: stocks.length },
    results,
  });
  } catch (err: any) {
    console.error('[seed-predictions] Top-level crash:', err);
    return NextResponse.json(
      { success: false, error: `Server error: ${err.message?.slice(0, 100)}` },
      { status: 500 }
    );
  }
}
