// API Route: Server-side stock prediction
// Uses the ensemble ML engine to generate predictions with supporting signals.

import { NextResponse } from 'next/server';
import { generatePrediction } from '@/lib/mlEngine';
import { computeRealTechnicals } from '@/lib/technicalAnalysis';
import { fetchDeliveryData, fetchRealPCR, fetchIndiaVIX, isFnOStock } from '@/lib/nseData';
import { getAccuracyMetrics } from '@/lib/predictionHistory';
import { computeRiskReward } from '@/lib/riskEngine';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter required' }, { status: 400 });
  }

  try {
    // 1. Fetch real technicals and supplementary data in parallel
    const [technicals, deliveryData, pcrData, vixData, accuracyMetrics] = await Promise.all([
      computeRealTechnicals(symbol),
      fetchDeliveryData(symbol).catch(() => null),
      isFnOStock(symbol) ? fetchRealPCR(symbol).catch(() => null) : Promise.resolve(null),
      fetchIndiaVIX().catch(() => null),
      getAccuracyMetrics(symbol).catch(() => []),
    ]);

    if (!technicals) {
      return NextResponse.json({ error: 'Insufficient market data for prediction' }, { status: 404 });
    }

    // 2. Build current features for the ML engine
    const currentFeatures = {
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
    };

    // 3. Generate prediction
    const prediction = await generatePrediction(symbol, currentFeatures);

    if (!prediction) {
      return NextResponse.json({
        error: 'Not enough historical data to generate prediction. Data is being accumulated — check back in a few days.',
        dataPoints: 0,
      }, { status: 422 });
    }

    // 4. Compute risk/reward
    const riskReward = computeRiskReward(
      technicals.currentPrice,
      prediction.direction,
      prediction.confidence,
      {
        bollingerUpper: technicals.bollingerUpper,
        bollingerLower: technicals.bollingerLower,
        atr: Math.abs(technicals.dayHigh - technicals.dayLow), // Simplified ATR
        ema20: technicals.ema20,
      }
    );

    // 5. Get historical accuracy for this stock
    const stockAccuracy = accuracyMetrics.find(m => m.symbol === symbol);

    return NextResponse.json({
      prediction: {
        ...prediction,
        riskReward,
      },
      historicalAccuracy: stockAccuracy || null,
      marketContext: {
        indiaVix: vixData,
        deliveryData: deliveryData,
        pcrData: pcrData,
      },
      dataQuality: {
        hasHistoricalData: prediction.metrics.totalSamples > 20,
        hasFiiDii: prediction.featureImportance['FII Flow'] != null,
        hasDeliveryData: deliveryData != null,
        hasPcrData: pcrData != null,
        hasVixData: vixData != null,
        dataPoints: prediction.metrics.totalSamples,
        modelVersion: prediction.metrics.modelVersion,
      },
      disclaimer: 'AI-assisted analysis for informational purposes only. Not financial advice. Past performance does not guarantee future results.',
    });
  } catch (error: any) {
    console.error('[Predict API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
