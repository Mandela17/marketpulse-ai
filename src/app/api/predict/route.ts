// API Route: Server-side stock prediction
// Uses the ensemble ML engine to generate predictions with supporting signals.
// Now integrates event calendar, market regime, and narrative reports.

import { NextResponse } from 'next/server';
import { generatePrediction } from '@/lib/mlEngine';
import { computeRealTechnicals } from '@/lib/technicalAnalysis';
import { fetchDeliveryData, fetchRealPCR, fetchIndiaVIX, isFnOStock } from '@/lib/nseData';
import { getAccuracyMetrics } from '@/lib/predictionHistory';
import { computeRiskReward } from '@/lib/riskEngine';
import { getUpcomingEvents, getEventVolatilityAdjustment } from '@/lib/eventCalendar';
import { detectMarketRegime } from '@/lib/marketRegime';
import { generateNarrativeReport } from '@/lib/narrativeReport';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const includeReport = searchParams.get('report') !== 'false'; // Default: include narrative

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter required' }, { status: 400 });
  }

  try {
    // 1. Fetch real technicals, supplementary data, regime, and events in parallel
    const [technicals, deliveryData, pcrData, vixData, accuracyMetrics, regime] = await Promise.all([
      computeRealTechnicals(symbol),
      fetchDeliveryData(symbol).catch(() => null),
      isFnOStock(symbol) ? fetchRealPCR(symbol).catch(() => null) : Promise.resolve(null),
      fetchIndiaVIX().catch(() => null),
      getAccuracyMetrics(symbol).catch(() => []),
      detectMarketRegime().catch(() => null),
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
        atr: Math.abs(technicals.dayHigh - technicals.dayLow),
        ema20: technicals.ema20,
      }
    );

    // 5. Get event-aware context
    const upcomingEvents = getUpcomingEvents(7).filter(e =>
      e.relatedStocks.includes(symbol) || e.relatedStocks.length === 0
    );
    const eventAdjustment = getEventVolatilityAdjustment(symbol);

    // 6. Apply regime and event adjustments to confidence
    let adjustedConfidence = prediction.confidence;
    if (regime?.adjustments) {
      adjustedConfidence = Math.round(adjustedConfidence * regime.adjustments.confidenceMultiplier);
    }
    if (eventAdjustment.factor > 1.2) {
      // Reduce confidence near high-impact events (uncertainty)
      adjustedConfidence = Math.round(adjustedConfidence * 0.9);
    }
    adjustedConfidence = Math.max(50, Math.min(95, adjustedConfidence));

    // 7. Get historical accuracy for this stock
    const stockAccuracy = accuracyMetrics.find(m => m.symbol === symbol);

    // 8. Generate narrative report (async, non-blocking)
    let narrative = null;
    if (includeReport) {
      narrative = await generateNarrativeReport(
        symbol,
        { ...prediction, confidence: adjustedConfidence },
        riskReward,
        regime,
        upcomingEvents,
        {
          indiaVix: vixData?.value,
          fiiNet: undefined, // Will be filled from prediction features if available
          diiNet: undefined,
        }
      ).catch(() => null);
    }

    return NextResponse.json({
      prediction: {
        ...prediction,
        confidence: adjustedConfidence,
        riskReward,
      },
      regime: regime ? {
        regime: regime.regime,
        label: regime.label,
        emoji: regime.emoji,
        color: regime.color,
        confidence: regime.confidence,
        description: regime.description,
        adjustments: regime.adjustments,
      } : null,
      events: {
        upcoming: upcomingEvents.slice(0, 3),
        volatilityAdjustment: eventAdjustment,
      },
      narrative,
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
