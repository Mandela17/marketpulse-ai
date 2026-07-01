// API Route: Server-side stock prediction v3
// Uses GBDT ensemble ML engine with alternative data features.
// Integrates: Order Book Imbalance, Volume Profile, adaptive weights,
// Kelly Criterion risk management, event calendar, and narrative reports.

import { NextResponse } from 'next/server';
import { generatePrediction } from '@/lib/mlEngine';
import { computeRealTechnicals, fetchHistoricalOHLCV } from '@/lib/technicalAnalysis';
import { fetchDeliveryData, fetchRealPCR, fetchIndiaVIX, isFnOStock } from '@/lib/nseData';
import { getAccuracyMetrics } from '@/lib/predictionHistory';
import { computeRiskReward } from '@/lib/riskEngine';
import { getUpcomingEvents, getEventVolatilityAdjustment } from '@/lib/eventCalendar';
import { detectMarketRegime } from '@/lib/marketRegime';
import { generateNarrativeReport } from '@/lib/narrativeReport';
import { fetchOrderBookImbalance } from '@/lib/orderBookImbalance';
import { computeVolumeProfile } from '@/lib/volumeProfile';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const includeReport = searchParams.get('report') !== 'false';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter required' }, { status: 400 });
  }

  try {
    // 1. Fetch all data sources in parallel
    const [technicals, deliveryData, pcrData, vixData, accuracyMetrics, regime, obiData, ohlcvData] = await Promise.all([
      computeRealTechnicals(symbol),
      fetchDeliveryData(symbol).catch(() => null),
      isFnOStock(symbol) ? fetchRealPCR(symbol).catch(() => null) : Promise.resolve(null),
      fetchIndiaVIX().catch(() => null),
      getAccuracyMetrics(symbol).catch(() => []),
      detectMarketRegime().catch(() => null),
      fetchOrderBookImbalance(symbol).catch(() => null),
      fetchHistoricalOHLCV(symbol, 60).catch(() => []),
    ]);

    if (!technicals) {
      return NextResponse.json({ error: 'Insufficient market data for prediction' }, { status: 404 });
    }

    // 2. Compute Volume Profile from OHLCV data
    const volumeProfile = ohlcvData.length > 0
      ? computeVolumeProfile(ohlcvData, technicals.currentPrice)
      : null;

    // 3. Compute ATR (14-period Average True Range)
    let atr = Math.abs(technicals.dayHigh - technicals.dayLow); // Simple 1-day range fallback
    if (ohlcvData.length >= 14) {
      const trueRanges: number[] = [];
      for (let i = 1; i < ohlcvData.length; i++) {
        const tr = Math.max(
          ohlcvData[i].high - ohlcvData[i].low,
          Math.abs(ohlcvData[i].high - ohlcvData[i - 1].close),
          Math.abs(ohlcvData[i].low - ohlcvData[i - 1].close)
        );
        trueRanges.push(tr);
      }
      // Use last 14 true ranges
      const recent14 = trueRanges.slice(-14);
      atr = recent14.reduce((s, tr) => s + tr, 0) / recent14.length;
    }

    // 4. Build alternative data features
    const altData = {
      obi: obiData?.bidAskImbalance || 0,
      pocPosition: volumeProfile?.pocDistancePct || 0,
    };

    // 5. Build current features for the ML engine
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

    // 6. Generate prediction (GBDT + Heuristic ensemble)
    const prediction = await generatePrediction(symbol, currentFeatures, altData);

    if (!prediction) {
      return NextResponse.json({
        error: 'Not enough historical data to generate prediction. Data is being accumulated — check back in a few days.',
        dataPoints: 0,
      }, { status: 422 });
    }

    // 7. Compute advanced risk/reward (Kelly + VIX-aware)
    const riskReward = await computeRiskReward(
      technicals.currentPrice,
      prediction.direction,
      prediction.confidence,
      {
        bollingerUpper: technicals.bollingerUpper,
        bollingerLower: technicals.bollingerLower,
        atr,
        ema20: technicals.ema20,
        indiaVix: vixData?.value,
      },
      symbol
    );

    // 8. Event-aware context
    const upcomingEvents = getUpcomingEvents(7).filter(e =>
      e.relatedStocks.includes(symbol) || e.relatedStocks.length === 0
    );
    const eventAdjustment = getEventVolatilityAdjustment(symbol);

    // 9. Apply regime and event adjustments to confidence
    let adjustedConfidence = prediction.confidence;
    if (regime?.adjustments) {
      adjustedConfidence = Math.round(adjustedConfidence * regime.adjustments.confidenceMultiplier);
    }
    if (eventAdjustment.factor > 1.2) {
      adjustedConfidence = Math.round(adjustedConfidence * 0.9);
    }
    adjustedConfidence = Math.max(50, Math.min(95, adjustedConfidence));

    // 10. Historical accuracy for this stock
    const stockAccuracy = accuracyMetrics.find(m => m.symbol === symbol);

    // 11. Generate narrative report
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
          fiiNet: undefined,
          diiNet: undefined,
        }
      ).catch(() => null);
    }

    // 12. Build response
    return NextResponse.json({
      prediction: {
        symbol: prediction.symbol,
        direction: prediction.direction,
        confidence: adjustedConfidence,
        confidenceLevel: prediction.confidenceLevel,
        ensembleConsensus: prediction.subModelVotes.gbdt.direction === prediction.subModelVotes.heuristic.direction
          ? 'unanimous' : 'split',
        subModels: {
          gbdt: {
            ...prediction.subModelVotes.gbdt,
            weight: prediction.metrics.ensembleWeights.gbdt,
          },
          heuristic: {
            ...prediction.subModelVotes.heuristic,
            weight: prediction.metrics.ensembleWeights.heuristic,
          },
        },
        supportingSignals: prediction.supportingSignals,
        contradictingSignals: prediction.contradictingSignals,
      },
      features: {
        rsi: technicals.rsi,
        rsiSignal: technicals.rsiSignal,
        macdHistogram: technicals.histogram,
        macdSignal: technicals.macdSignal,
        ema20: technicals.ema20,
        ema50: technicals.ema50,
        emaTrend: technicals.emaTrend,
        bollingerPosition: technicals.bollingerPosition,
        volumeRatio: technicals.volumeRatio,
        volumeSignal: technicals.volumeSignal,
        orderBookImbalance: obiData?.bidAskImbalance ?? null,
        depthPressure: obiData?.depthPressureScore ?? null,
        volumeProfile: volumeProfile ? {
          poc: volumeProfile.poc,
          vah: volumeProfile.vah,
          val: volumeProfile.val,
          position: volumeProfile.positionVsPOC,
          pocDistancePct: volumeProfile.pocDistancePct,
        } : null,
        featureImportance: prediction.featureImportance,
      },
      trade: {
        entry: riskReward.entry,
        target1: riskReward.target1,
        target1Pct: riskReward.target1Pct,
        target2: riskReward.target2,
        target2Pct: riskReward.target2Pct,
        stopLoss: riskReward.stopLoss,
        stopLossPct: riskReward.stopLossPct,
        invalidation: riskReward.invalidation,
        invalidationPct: riskReward.invalidationPct,
        riskRewardRatio: riskReward.riskRewardRatio,
        kellyPct: riskReward.positionSizePct,
        positionSizeHint: riskReward.positionSizeHint,
        riskLevel: riskReward.riskLevel,
        vixAdjusted: riskReward.vixAdjusted,
      },
      metrics: {
        modelVersion: prediction.metrics.modelVersion,
        trainingAccuracy: prediction.metrics.trainingAccuracy,
        validationAccuracy: prediction.metrics.validationAccuracy,
        totalSamples: prediction.metrics.totalSamples,
        bestIteration: prediction.metrics.bestIteration,
        ensembleWeights: prediction.metrics.ensembleWeights,
        historicalAccuracy: stockAccuracy || null,
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
      marketContext: {
        indiaVix: vixData,
        deliveryData,
        pcrData,
        currentPrice: technicals.currentPrice,
        dayHigh: technicals.dayHigh,
        dayLow: technicals.dayLow,
        atr: parseFloat(atr.toFixed(2)),
      },
      dataQuality: {
        hasHistoricalData: prediction.metrics.totalSamples > 20,
        hasOBI: obiData != null,
        hasVolumeProfile: volumeProfile != null,
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
