// Production ML Prediction Engine v3 — Server-Side
// Ensemble: Gradient Boosted Decision Tree (GBDT) + Rule-Based Heuristic
// Features: 21-dimensional feature vector with alternative data (OBI, Volume Profile, Flow Velocity)
// Adaptive: Ensemble weights auto-tuned from rolling accuracy via adaptiveLearning.ts

import { getHistoricalFeatures } from './nseData';
import { getRecentFIIDIIFlows, computeFIIDIIFeatures } from './fiiDiiData';
import { savePrediction, getConfidenceLevel } from './predictionHistory';
import { trainGBDT, predictGBDT, GBDTModel } from './gbdt';
import { getEnsembleWeights } from './adaptiveLearning';

// ─── Types ──────────────────────────────────────────────────────────

export interface MLPrediction {
  symbol: string;
  direction: 'up' | 'down';
  confidence: number;          // 0-100
  confidenceLevel: 'low' | 'moderate' | 'high' | 'very_high';
  supportingSignals: string[];
  contradictingSignals: string[];
  featureImportance: Record<string, number>;
  subModelVotes: {
    gbdt: { direction: 'up' | 'down'; probability: number };
    heuristic: { direction: 'up' | 'down'; probability: number };
  };
  metrics: {
    trainingAccuracy: number;
    validationAccuracy: number;
    totalSamples: number;
    modelVersion: string;
    bestIteration: number;
    ensembleWeights: { gbdt: number; heuristic: number };
  };
}

interface FeatureVector {
  // Raw values for signal generation
  rsi: number;
  macdHist: number;
  ema20: number;
  close: number;
  volumeRatio: number;
  sentimentScore: number;
  pcr: number;
  deliveryPct: number;
  indiaVix: number;
  fiiNet: number;
  diiNet: number;
  bollingerUpper: number;
  bollingerLower: number;
  // Phase 2 alternative data
  obi: number;               // Order Book Imbalance [-1, 1]
  pocPosition: number;       // Price vs Point of Control (% distance)
  fiiVelocity: number;       // FII 5-day flow acceleration
  flowDivergence: number;    // FII vel × DII vel (negative = diverging)
  cumFlow10d: number;        // Cumulative 10-day FII net
  // Scaled feature array for models
  features: number[];
}

// ─── Sigmoid ─────────────────────────────────────────────────────────

function sigmoid(z: number): number {
  if (z > 500) return 1;
  if (z < -500) return 0;
  return 1 / (1 + Math.exp(-z));
}

// ─── Feature Extraction ─────────────────────────────────────────────

function extractFeatures(row: any, prevRow: any, altData?: {
  obi?: number; pocPosition?: number; fiiVelocity?: number;
  flowDivergence?: number; cumFlow10d?: number;
}): FeatureVector {
  const close = row.close || 0;
  const prevClose = prevRow?.close || close;
  const rsi = row.rsi || 50;
  const macdHist = row.macd_hist || 0;
  const ema20 = row.ema20 || close;
  const ema50 = row.ema50 || close;
  const volumeRatio = row.volume_ratio || 1;
  const sentimentScore = row.sentiment_score || 50;
  const prevSentiment = prevRow?.sentiment_score || 50;
  const pcr = row.pcr || 1;
  const deliveryPct = row.delivery_pct || 40;
  const prevDeliveryPct = prevRow?.delivery_pct || 40;
  const indiaVix = row.india_vix || 14;
  const fiiNet = row.fii_net || 0;
  const diiNet = row.dii_net || 0;
  const bollingerUpper = row.bollinger_upper || close * 1.02;
  const bollingerLower = row.bollinger_lower || close * 0.98;
  const obi = altData?.obi || 0;
  const pocPosition = altData?.pocPosition || 0;
  const fiiVelocity = altData?.fiiVelocity || 0;
  const flowDivergence = altData?.flowDivergence || 0;
  const cumFlow10d = altData?.cumFlow10d || 0;

  // Feature engineering — 20 engineered features (no intercept needed for GBDT)
  const f_rsi = (rsi - 50) / 50;                                            // RSI deviation from neutral
  const f_macd = close > 0 ? macdHist / close : 0;                          // MACD relative to price
  const f_emaDev = ema20 > 0 ? (close - ema20) / ema20 : 0;                 // EMA deviation
  const f_ema2050 = ema50 > 0 ? (ema20 - ema50) / ema50 : 0;                // EMA crossover signal
  const f_volume = Math.log(Math.max(0.01, volumeRatio));                    // Log volume ratio
  const f_sentiment = (sentimentScore - 50) / 50;                            // Sentiment normalized
  const f_sentimentMom = (sentimentScore - prevSentiment) / 50;              // Sentiment momentum
  const f_pcr = pcr - 1.0;                                                   // PCR deviation from neutral
  const f_delivery = deliveryPct / 100;                                       // Delivery fraction
  const f_deliveryMom = (deliveryPct - prevDeliveryPct) / 100;               // Delivery momentum
  const f_vix = (indiaVix - 15) / 15;                                        // VIX deviation from normal
  const f_fii = fiiNet / 5000;                                               // FII normalized (₹5000Cr = strong signal)
  const f_dii = diiNet / 5000;                                               // DII normalized
  const f_priceMom = prevClose > 0 ? (close - prevClose) / prevClose : 0;    // 1-day return
  const f_bbPosition = bollingerUpper !== bollingerLower
    ? (close - bollingerLower) / (bollingerUpper - bollingerLower) - 0.5     // BB position (-0.5 to 0.5)
    : 0;
  // Phase 2 new features
  const f_obi = obi;                                                         // Order Book Imbalance [-1, 1]
  const f_pocPosition = pocPosition / 100;                                   // POC distance normalized
  const f_fiiVelocity = fiiVelocity / 2000;                                 // FII acceleration normalized
  const f_flowDivergence = flowDivergence > 0                                // Flow divergence sign
    ? Math.min(1, Math.log(1 + flowDivergence / 100000)) 
    : -Math.min(1, Math.log(1 + Math.abs(flowDivergence) / 100000));
  const f_cumFlow10d = cumFlow10d / 20000;                                   // 10-day cum flow normalized

  return {
    rsi, macdHist, ema20, close, volumeRatio, sentimentScore,
    pcr, deliveryPct, indiaVix, fiiNet, diiNet, bollingerUpper, bollingerLower,
    obi, pocPosition, fiiVelocity, flowDivergence, cumFlow10d,
    features: [
      f_rsi,
      f_macd,
      f_emaDev,
      f_ema2050,
      f_volume,
      f_sentiment,
      f_sentimentMom,
      f_pcr,
      f_delivery,
      f_deliveryMom,
      f_vix,
      f_fii,
      f_dii,
      f_priceMom,
      f_bbPosition,
      f_obi,
      f_pocPosition,
      f_fiiVelocity,
      f_flowDivergence,
      f_cumFlow10d,
    ],
  };
}

// ─── Rule-Based Heuristic (Model 2) ────────────────────────────────

function predictHeuristic(fv: FeatureVector): { probability: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  // RSI signals
  if (fv.rsi < 30) { score += 2; signals.push(`RSI oversold at ${fv.rsi.toFixed(0)} — bounce likely`); }
  else if (fv.rsi < 40) { score += 1; signals.push(`RSI approaching oversold at ${fv.rsi.toFixed(0)}`); }
  else if (fv.rsi > 70) { score -= 2; signals.push(`RSI overbought at ${fv.rsi.toFixed(0)} — pullback risk`); }
  else if (fv.rsi > 60) { score -= 0.5; }

  // MACD histogram
  if (fv.macdHist > 0 && fv.close > 0) {
    score += 1; signals.push('MACD histogram positive — bullish momentum');
  } else if (fv.macdHist < 0) {
    score -= 1; signals.push('MACD histogram negative — bearish momentum');
  }

  // EMA trend
  if (fv.close > fv.ema20) { score += 1; signals.push('Price above EMA20 — uptrend'); }
  else { score -= 1; signals.push('Price below EMA20 — downtrend'); }

  // Bollinger Band position
  if (fv.close < fv.bollingerLower) { score += 1.5; signals.push('Price below lower Bollinger Band — mean reversion setup'); }
  else if (fv.close > fv.bollingerUpper) { score -= 1.5; signals.push('Price above upper Bollinger Band — overextended'); }

  // Volume
  if (fv.volumeRatio > 1.5) {
    if (fv.close > fv.ema20) { score += 1; signals.push(`High volume (${fv.volumeRatio.toFixed(1)}x) confirming uptrend`); }
    else { score -= 0.5; signals.push(`High volume (${fv.volumeRatio.toFixed(1)}x) in downtrend`); }
  }

  // Sentiment
  if (fv.sentimentScore > 65) { score += 1; signals.push(`Bullish sentiment at ${fv.sentimentScore}`); }
  else if (fv.sentimentScore < 35) { score -= 1; signals.push(`Bearish sentiment at ${fv.sentimentScore}`); }

  // FII/DII flows
  if (fv.fiiNet > 1000) { score += 2; signals.push(`Strong FII buying ₹${fv.fiiNet.toFixed(0)}Cr`); }
  else if (fv.fiiNet > 500) { score += 1; signals.push(`FII buying ₹${fv.fiiNet.toFixed(0)}Cr`); }
  else if (fv.fiiNet < -1000) { score -= 2; signals.push(`Heavy FII selling ₹${Math.abs(fv.fiiNet).toFixed(0)}Cr`); }
  else if (fv.fiiNet < -500) { score -= 1; signals.push(`FII selling ₹${Math.abs(fv.fiiNet).toFixed(0)}Cr`); }

  // PCR
  if (fv.pcr > 1.2) { score += 1; signals.push(`High PCR ${fv.pcr.toFixed(2)} — bullish unwinding potential`); }
  else if (fv.pcr < 0.7) { score -= 1; signals.push(`Low PCR ${fv.pcr.toFixed(2)} — bearish lean`); }

  // VIX
  if (fv.indiaVix > 22) { score -= 1; signals.push(`Elevated VIX ${fv.indiaVix.toFixed(1)} — high uncertainty`); }
  else if (fv.indiaVix < 12) { score += 0.5; signals.push(`Low VIX ${fv.indiaVix.toFixed(1)} — calm market`); }

  // Delivery %
  if (fv.deliveryPct > 55 && fv.close > fv.ema20) {
    score += 1; signals.push(`High delivery ${fv.deliveryPct.toFixed(0)}% — genuine buying`);
  }

  // ─── Phase 2: New alternative data signals ───

  // Order Book Imbalance
  if (fv.obi > 0.3) { score += 1.5; signals.push(`Strong buy-side order book imbalance (${(fv.obi * 100).toFixed(0)}%)`); }
  else if (fv.obi < -0.3) { score -= 1.5; signals.push(`Strong sell-side order book imbalance (${(fv.obi * 100).toFixed(0)}%)`); }
  else if (fv.obi > 0.1) { score += 0.5; }
  else if (fv.obi < -0.1) { score -= 0.5; }

  // FII Velocity
  if (fv.fiiVelocity > 500) { score += 1.5; signals.push(`FII buying accelerating (+₹${fv.fiiVelocity.toFixed(0)}Cr/day)`); }
  else if (fv.fiiVelocity < -500) { score -= 1.5; signals.push(`FII selling accelerating (-₹${Math.abs(fv.fiiVelocity).toFixed(0)}Cr/day)`); }

  // Cumulative 10d flow
  if (fv.cumFlow10d > 5000) { score += 1; signals.push(`Strong 10-day FII inflow ₹${(fv.cumFlow10d / 1000).toFixed(1)}KCr`); }
  else if (fv.cumFlow10d < -5000) { score -= 1; signals.push(`Heavy 10-day FII outflow ₹${(Math.abs(fv.cumFlow10d) / 1000).toFixed(1)}KCr`); }

  // Convert score to probability (score typically -10 to +10)
  const probability = sigmoid(score * 0.35);

  return { probability, signals };
}

// ─── Feature Names ──────────────────────────────────────────────────

const FEATURE_NAMES = [
  'RSI', 'MACD', 'EMA Deviation', 'EMA 20/50',
  'Volume', 'Sentiment', 'Sentiment Momentum', 'PCR',
  'Delivery%', 'Delivery Momentum', 'VIX', 'FII Flow', 'DII Flow',
  'Price Momentum', 'Bollinger Position',
  'Order Book Imbalance', 'Volume Profile (POC)', 'FII Velocity',
  'Flow Divergence', 'Cumulative 10d Flow',
];

// ─── Main Prediction Function ───────────────────────────────────────

export async function generatePrediction(
  symbol: string,
  currentFeatures?: {
    rsi?: number; macdHist?: number; ema20?: number; ema50?: number;
    close?: number; volumeRatio?: number; sentimentScore?: number;
    pcr?: number; deliveryPct?: number; bollingerUpper?: number; bollingerLower?: number;
  },
  altData?: {
    obi?: number; pocPosition?: number; fiiVelocity?: number;
    flowDivergence?: number; cumFlow10d?: number;
  }
): Promise<MLPrediction | null> {
  try {
    // 1. Fetch historical data from Supabase
    const history = await getHistoricalFeatures(symbol, 120);
    const fiiFlows = await getRecentFIIDIIFlows(30);
    const fiiFeatures = computeFIIDIIFeatures(fiiFlows);

    // Get ensemble weights (adaptive — updated daily)
    const ensembleWeights = await getEnsembleWeights();

    // Get India VIX from most recent daily_features entry that has it
    const latestVix = history.find(h => h.india_vix != null)?.india_vix || 14;

    // 2. Merge alt data with FII features
    const mergedAltData = {
      obi: altData?.obi || 0,
      pocPosition: altData?.pocPosition || 0,
      fiiVelocity: altData?.fiiVelocity ?? fiiFeatures.fiiVelocity,
      flowDivergence: altData?.flowDivergence ?? fiiFeatures.flowMomentumDivergence,
      cumFlow10d: altData?.cumFlow10d ?? fiiFeatures.cumFlow10d,
    };

    // 3. If insufficient historical data, use heuristic only
    if (history.length < 10) {
      if (!currentFeatures?.close) return null;

      const fv: FeatureVector = {
        rsi: currentFeatures.rsi || 50,
        macdHist: currentFeatures.macdHist || 0,
        ema20: currentFeatures.ema20 || currentFeatures.close,
        close: currentFeatures.close,
        volumeRatio: currentFeatures.volumeRatio || 1,
        sentimentScore: currentFeatures.sentimentScore || 50,
        pcr: currentFeatures.pcr || 1,
        deliveryPct: currentFeatures.deliveryPct || 40,
        indiaVix: latestVix,
        fiiNet: fiiFeatures.fiiNetToday,
        diiNet: fiiFeatures.diiNetToday,
        bollingerUpper: currentFeatures.bollingerUpper || currentFeatures.close * 1.02,
        bollingerLower: currentFeatures.bollingerLower || currentFeatures.close * 0.98,
        obi: mergedAltData.obi,
        pocPosition: mergedAltData.pocPosition,
        fiiVelocity: mergedAltData.fiiVelocity,
        flowDivergence: mergedAltData.flowDivergence,
        cumFlow10d: mergedAltData.cumFlow10d,
        features: [],
      };

      const heurResult = predictHeuristic(fv);
      const direction: 'up' | 'down' = heurResult.probability >= 0.5 ? 'up' : 'down';
      const confidence = Math.round((direction === 'up' ? heurResult.probability : 1 - heurResult.probability) * 100);

      const supportingSignals = classifySignals(heurResult.signals, direction, 'supporting').slice(0, 5);
      const contradictingSignals = classifySignals(heurResult.signals, direction, 'contradicting').slice(0, 3);

      await savePrediction({
        symbol,
        predictedDirection: direction,
        probability: confidence,
        confidenceLevel: getConfidenceLevel(confidence),
        featuresJson: { heuristicSignals: heurResult.signals, subModels: { heuristic: { direction, probability: confidence } } },
        supportingSignals,
        contradictingSignals,
        modelVersion: 'v3-heuristic-only',
        predictedAt: new Date().toISOString(),
      });

      return {
        symbol,
        direction,
        confidence,
        confidenceLevel: getConfidenceLevel(confidence),
        supportingSignals,
        contradictingSignals,
        featureImportance: {},
        subModelVotes: {
          gbdt: { direction, probability: confidence },
          heuristic: { direction, probability: confidence },
        },
        metrics: {
          trainingAccuracy: 0,
          validationAccuracy: 0,
          totalSamples: history.length,
          modelVersion: 'v3-heuristic-only',
          bestIteration: 0,
          ensembleWeights,
        },
      };
    }

    // 4. Build training data from historical features
    const X: number[][] = [];
    const Y: number[] = [];
    const featureVectors: FeatureVector[] = [];

    for (let i = 1; i < history.length - 1; i++) {
      const row = history[i];
      const prevRow = history[i - 1];
      const nextRow = history[i + 1];

      // Inject FII/DII from flow data (match by date)
      const matchingFlow = fiiFlows.find(f => f.date === row.date);
      if (matchingFlow) {
        row.fii_net = matchingFlow.fiiNet;
        row.dii_net = matchingFlow.diiNet;
      }

      const fv = extractFeatures(row, prevRow);
      featureVectors.push(fv);
      X.push(fv.features);

      // Label: did price go up next day?
      Y.push(nextRow.close > row.close ? 1 : 0);
    }

    const m = X.length;
    if (m < 8) return null;

    // 5. Chronological train/validation split (70/30)
    const trainSize = Math.floor(m * 0.7);
    const X_train = X.slice(0, trainSize);
    const Y_train = Y.slice(0, trainSize);
    const X_val = X.slice(trainSize);
    const Y_val = Y.slice(trainSize);

    // 6. Train GBDT
    const gbdtModel = trainGBDT(X_train, Y_train, X_val, Y_val, {
      numTrees: m < 30 ? 20 : 50,  // Fewer trees for small datasets
      maxDepth: m < 30 ? 3 : 4,
      learningRate: 0.1,
      subsampleRatio: 0.8,
      minSamplesLeaf: Math.max(2, Math.floor(trainSize * 0.05)),
      l2Regularization: 1.0,
      earlyStoppingRounds: 5,
    });

    // 7. Predict today → tomorrow
    const latestRow = history[history.length - 1];
    const prevLatestRow = history[history.length - 2];

    // Inject current features if provided (more up-to-date than DB)
    if (currentFeatures) {
      if (currentFeatures.rsi != null) latestRow.rsi = currentFeatures.rsi;
      if (currentFeatures.macdHist != null) latestRow.macd_hist = currentFeatures.macdHist;
      if (currentFeatures.ema20 != null) latestRow.ema20 = currentFeatures.ema20;
      if (currentFeatures.close != null) latestRow.close = currentFeatures.close;
      if (currentFeatures.volumeRatio != null) latestRow.volume_ratio = currentFeatures.volumeRatio;
      if (currentFeatures.sentimentScore != null) latestRow.sentiment_score = currentFeatures.sentimentScore;
      if (currentFeatures.pcr != null) latestRow.pcr = currentFeatures.pcr;
      if (currentFeatures.deliveryPct != null) latestRow.delivery_pct = currentFeatures.deliveryPct;
    }

    latestRow.fii_net = fiiFeatures.fiiNetToday || latestRow.fii_net || 0;
    latestRow.dii_net = fiiFeatures.diiNetToday || latestRow.dii_net || 0;
    latestRow.india_vix = latestVix;

    const todayFV = extractFeatures(latestRow, prevLatestRow, mergedAltData);

    // Sub-model predictions
    const gbdtProb = predictGBDT(gbdtModel, todayFV.features);
    const heurResult = predictHeuristic(todayFV);

    // 8. Ensemble: Adaptive weighted vote
    const gbdtWeight = ensembleWeights.gbdt;
    const heurWeight = ensembleWeights.heuristic;
    const totalWeight = gbdtWeight + heurWeight;
    const ensembleProb = (gbdtProb * gbdtWeight + heurResult.probability * heurWeight) / totalWeight;

    const direction: 'up' | 'down' = ensembleProb >= 0.5 ? 'up' : 'down';
    const rawConfidence = Math.round((direction === 'up' ? ensembleProb : 1 - ensembleProb) * 100);

    // Confidence discounts
    let confidenceDiscount = 0;
    if (m < 20) confidenceDiscount += 10;
    if (latestVix > 22) confidenceDiscount += 5;
    // Discount if GBDT and heuristic disagree
    const gbdtDir = gbdtProb >= 0.5 ? 'up' : 'down';
    const heurDir = heurResult.probability >= 0.5 ? 'up' : 'down';
    if (gbdtDir !== heurDir) confidenceDiscount += 8;

    const confidence = Math.max(50, Math.min(95, rawConfidence - confidenceDiscount));

    // 9. Generate human-readable signals
    const supportingSignals = classifySignals(heurResult.signals, direction, 'supporting').slice(0, 5);
    const contradictingSignals = classifySignals(heurResult.signals, direction, 'contradicting').slice(0, 3);

    // 10. Feature importance from GBDT
    const featureImportance: Record<string, number> = {};
    for (let j = 0; j < gbdtModel.featureImportance.length && j < FEATURE_NAMES.length; j++) {
      featureImportance[FEATURE_NAMES[j]] = gbdtModel.featureImportance[j];
    }

    const prediction: MLPrediction = {
      symbol,
      direction,
      confidence,
      confidenceLevel: getConfidenceLevel(confidence),
      supportingSignals,
      contradictingSignals,
      featureImportance,
      subModelVotes: {
        gbdt: {
          direction: gbdtDir,
          probability: Math.round((gbdtProb >= 0.5 ? gbdtProb : 1 - gbdtProb) * 100),
        },
        heuristic: {
          direction: heurDir,
          probability: Math.round((heurResult.probability >= 0.5 ? heurResult.probability : 1 - heurResult.probability) * 100),
        },
      },
      metrics: {
        trainingAccuracy: gbdtModel.trainingMetrics.trainingAccuracy,
        validationAccuracy: gbdtModel.trainingMetrics.validationAccuracy,
        totalSamples: m,
        modelVersion: 'v3-gbdt-adaptive',
        bestIteration: gbdtModel.trainingMetrics.bestIteration,
        ensembleWeights,
      },
    };

    // 11. Save prediction to Supabase
    await savePrediction({
      symbol,
      predictedDirection: direction,
      probability: confidence,
      confidenceLevel: prediction.confidenceLevel,
      featuresJson: {
        ...featureImportance,
        subModels: prediction.subModelVotes,
        gbdtTrainAcc: gbdtModel.trainingMetrics.trainingAccuracy,
        gbdtValAcc: gbdtModel.trainingMetrics.validationAccuracy,
        ensembleWeights,
      },
      supportingSignals,
      contradictingSignals,
      modelVersion: prediction.metrics.modelVersion,
      predictedAt: new Date().toISOString(),
    });

    return prediction;
  } catch (error) {
    console.error(`[MLEngine] Prediction failed for ${symbol}:`, error);
    return null;
  }
}

// ─── Signal Classification Helper ───────────────────────────────────

function classifySignals(
  signals: string[],
  direction: 'up' | 'down',
  type: 'supporting' | 'contradicting'
): string[] {
  const bullishKeywords = ['bullish', 'buying', 'oversold', 'uptrend', 'genuine', 'bounce', 'calm', 'positive', 'inflow', 'buy-side', 'accelerating'];
  const bearishKeywords = ['bearish', 'selling', 'overbought', 'downtrend', 'overextended', 'uncertainty', 'outflow', 'sell-side', 'fear'];

  return signals.filter(s => {
    const lower = s.toLowerCase();
    const isBullish = bullishKeywords.some(k => lower.includes(k));
    const isBearish = bearishKeywords.some(k => lower.includes(k));

    if (type === 'supporting') {
      return direction === 'up' ? isBullish : isBearish;
    } else {
      return direction === 'up' ? isBearish : isBullish;
    }
  });
}
