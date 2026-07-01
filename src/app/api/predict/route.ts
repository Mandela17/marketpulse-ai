// API Route: Server-side stock prediction v4
// Uses GBDT ensemble ML engine with global correlations, options intelligence, and alternative data.
// Integrates: GIFT Nifty, S&P 500, DXY, Crude, Max Pain, OI analysis, Order Book Imbalance,
// Volume Profile, adaptive weights, Kelly Criterion risk management, event calendar, and narrative reports.

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
import { fetchGlobalCorrelations } from '@/lib/globalCorrelations';
import { fetchOptionsIntelligence } from '@/lib/optionsIntelligence';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const includeReport = searchParams.get('report') !== 'false';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter required' }, { status: 400 });
  }

  try {
    // 1. Fetch all data sources in parallel (including new global + options intelligence)
    const [technicals, deliveryData, pcrData, vixData, accuracyMetrics, regime, obiData, ohlcvData, globalContext, optionsData] = await Promise.all([
      computeRealTechnicals(symbol),
      fetchDeliveryData(symbol).catch(() => null),
      isFnOStock(symbol) ? fetchRealPCR(symbol).catch(() => null) : Promise.resolve(null),
      fetchIndiaVIX().catch(() => null),
      getAccuracyMetrics(symbol).catch(() => []),
      detectMarketRegime().catch(() => null),
      fetchOrderBookImbalance(symbol).catch(() => null),
      fetchHistoricalOHLCV(symbol, 60).catch(() => []),
      fetchGlobalCorrelations().catch(() => null),
      isFnOStock(symbol) ? fetchOptionsIntelligence(symbol).catch(() => null) : Promise.resolve(null),
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

    // 4. Build alternative data features (now includes global + options)
    const altData = {
      obi: obiData?.bidAskImbalance || 0,
      pocPosition: volumeProfile?.pocDistancePct || 0,
      // Phase 3: Global correlations
      sp500Overnight: globalContext?.features?.sp500Overnight || 0,
      dxyChange: globalContext?.features?.dxyChange || 0,
      crudeChange: globalContext?.features?.crudeChange || 0,
      giftNiftyGap: globalContext?.features?.giftNiftyGap || 0,
      // Phase 3: Options intelligence
      maxPainDist: optionsData?.features?.maxPainDist || 0,
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

    // 11. Generate narrative report (with database caching to prevent Gemini credit overuse)
    let narrative = null;
    if (includeReport) {
      const todayDate = new Date().toISOString().split('T')[0];
      const db = getServiceClient();
      
      // Check if we have an existing prediction row for today with a cached narrative
      const { data: dbRecord } = await db
        .from('predictions')
        .select('id, features_json')
        .eq('symbol', symbol)
        .gte('predicted_at', `${todayDate}T00:00:00Z`)
        .lte('predicted_at', `${todayDate}T23:59:59Z`)
        .is('resolved_at', null)
        .order('predicted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dbRecord?.features_json?.narrativeCache) {
        console.log(`[Predict API] Serving cached narrative report from Supabase for ${symbol}`);
        narrative = dbRecord.features_json.narrativeCache;
      } else {
        console.log(`[Predict API] No cached narrative found for ${symbol}. Generating via Gemini...`);
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

        // Save the generated narrative back to the database row
        if (narrative && dbRecord?.id) {
          const updatedFeatures = {
            ...(dbRecord.features_json || {}),
            narrativeCache: narrative,
          };
          
          try {
            await db
              .from('predictions')
              .update({ features_json: updatedFeatures })
              .eq('id', dbRecord.id);
            console.log(`[Predict API] Cached narrative report in DB for ${symbol}`);
          } catch (err: any) {
            console.warn(`[Predict API] Failed to cache narrative report in DB:`, err.message);
          }
        }
      }
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
      globalContext: globalContext ? {
        gapPrediction: globalContext.gapPrediction,
        gapConfidence: globalContext.gapConfidence,
        overallBias: globalContext.overallBias,
        signals: globalContext.signals,
        instruments: {
          giftNifty: globalContext.giftNifty,
          sp500: globalContext.sp500,
          dxy: globalContext.dxy,
          brentCrude: globalContext.brentCrude,
          us10Y: globalContext.us10Y,
        },
      } : null,
      optionsIntelligence: optionsData ? {
        maxPain: optionsData.maxPain,
        maxPainDistance: optionsData.maxPainDistance,
        maxPainSignal: optionsData.maxPainSignal,
        pcrByOI: optionsData.pcrByOI,
        pcrByOIChange: optionsData.pcrByOIChange,
        freshPcrSignal: optionsData.freshPcrSignal,
        callWall: optionsData.callWall,
        putWall: optionsData.putWall,
        ivSkew: optionsData.ivSkew,
        ivSkewSignal: optionsData.ivSkewSignal,
        isExpiryWeek: optionsData.isExpiryWeek,
        daysToExpiry: optionsData.daysToExpiry,
        signals: optionsData.signals,
      } : null,
      dataQuality: {
        hasHistoricalData: prediction.metrics.totalSamples > 20,
        hasOBI: obiData != null,
        hasVolumeProfile: volumeProfile != null,
        hasDeliveryData: deliveryData != null,
        hasPcrData: pcrData != null,
        hasVixData: vixData != null,
        hasGlobalContext: globalContext != null,
        hasOptionsIntelligence: optionsData != null,
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
