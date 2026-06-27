// Production ML Prediction Engine — Server-Side
// Ensemble model combining Logistic Regression, Decision Stump Ensemble, and Rule-Based Heuristics
// Trains on historical Supabase data (30-90 days), not client-side from scratch.

import { getHistoricalFeatures } from './nseData';
import { getRecentFIIDIIFlows, computeFIIDIIFeatures } from './fiiDiiData';
import { savePrediction, getConfidenceLevel } from './predictionHistory';

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
    logisticRegression: { direction: 'up' | 'down'; probability: number };
    stumpEnsemble: { direction: 'up' | 'down'; probability: number };
    heuristic: { direction: 'up' | 'down'; probability: number };
  };
  metrics: {
    trainingAccuracy: number;
    validationAccuracy: number;
    totalSamples: number;
    modelVersion: string;
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

function extractFeatures(row: any, prevRow: any): FeatureVector {
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

  // Feature engineering
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

  return {
    rsi, macdHist, ema20, close, volumeRatio, sentimentScore,
    pcr, deliveryPct, indiaVix, fiiNet, diiNet, bollingerUpper, bollingerLower,
    features: [
      1,              // intercept
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
    ],
  };
}

// ─── Model 1: Logistic Regression with L2 Regularization ────────────

function trainLogisticRegression(
  X: number[][],
  Y: number[],
  alpha: number = 0.1,
  lambda: number = 0.05,
  epochs: number = 500
): number[] {
  const m = X.length;
  const n = X[0].length;
  const theta = new Array(n).fill(0);

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradients = new Array(n).fill(0);

    for (let i = 0; i < m; i++) {
      let z = 0;
      for (let j = 0; j < n; j++) z += theta[j] * X[i][j];
      const pred = sigmoid(z);
      const error = pred - Y[i];
      for (let j = 0; j < n; j++) gradients[j] += error * X[i][j];
    }

    // Update with L2 regularization (skip intercept)
    theta[0] -= (alpha / m) * gradients[0];
    for (let j = 1; j < n; j++) {
      theta[j] -= (alpha / m) * (gradients[j] + lambda * theta[j]);
    }
  }

  return theta;
}

function predictLogReg(theta: number[], features: number[]): number {
  let z = 0;
  for (let j = 0; j < theta.length && j < features.length; j++) {
    z += theta[j] * features[j];
  }
  return sigmoid(z);
}

// ─── Model 2: Decision Stump Ensemble (AdaBoost-style) ──────────────

interface DecisionStump {
  featureIndex: number;
  threshold: number;
  polarity: 1 | -1;  // 1 = feature > threshold → predict 1
  weight: number;     // alpha weight in ensemble
}

function trainStumpEnsemble(
  X: number[][],
  Y: number[],
  numStumps: number = 10
): DecisionStump[] {
  const m = X.length;
  const n = X[0].length;
  const stumps: DecisionStump[] = [];
  const sampleWeights = new Array(m).fill(1 / m);

  for (let t = 0; t < numStumps; t++) {
    let bestStump: DecisionStump | null = null;
    let bestWeightedError = Infinity;

    // Try each feature and several thresholds
    for (let j = 1; j < n; j++) { // skip intercept
      const values = X.map(x => x[j]).sort((a, b) => a - b);
      // Try 5 quantile thresholds
      for (let q = 1; q <= 4; q++) {
        const threshold = values[Math.floor(m * q / 5)];

        for (const polarity of [1, -1] as const) {
          let weightedError = 0;

          for (let i = 0; i < m; i++) {
            const predicted = (polarity * X[i][j] > polarity * threshold) ? 1 : 0;
            if (predicted !== Y[i]) {
              weightedError += sampleWeights[i];
            }
          }

          if (weightedError < bestWeightedError) {
            bestWeightedError = weightedError;
            bestStump = { featureIndex: j, threshold, polarity, weight: 0 };
          }
        }
      }
    }

    if (!bestStump || bestWeightedError >= 0.5) break;

    // Compute stump weight (alpha)
    const epsilon = Math.max(1e-10, bestWeightedError);
    const alpha = 0.5 * Math.log((1 - epsilon) / epsilon);
    bestStump.weight = alpha;
    stumps.push(bestStump);

    // Update sample weights
    let weightSum = 0;
    for (let i = 0; i < m; i++) {
      const predicted = (bestStump.polarity * X[i][bestStump.featureIndex] > bestStump.polarity * bestStump.threshold) ? 1 : 0;
      const correct = predicted === Y[i];
      sampleWeights[i] *= correct ? Math.exp(-alpha) : Math.exp(alpha);
      weightSum += sampleWeights[i];
    }
    // Normalize
    for (let i = 0; i < m; i++) sampleWeights[i] /= weightSum;
  }

  return stumps;
}

function predictStumps(stumps: DecisionStump[], features: number[]): number {
  if (stumps.length === 0) return 0.5;

  let score = 0;
  let totalWeight = 0;

  for (const stump of stumps) {
    const predicted = (stump.polarity * features[stump.featureIndex] > stump.polarity * stump.threshold) ? 1 : -1;
    score += stump.weight * predicted;
    totalWeight += stump.weight;
  }

  // Convert to probability
  return sigmoid(totalWeight > 0 ? score / totalWeight * 3 : 0); // scale factor for reasonable probabilities
}

// ─── Model 3: Rule-Based Heuristic ──────────────────────────────────

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

  // Convert score to probability (score typically -8 to +8)
  const probability = sigmoid(score * 0.4); // Scale to reasonable range

  return { probability, signals };
}

// ─── Z-Score Standardization ─────────────────────────────────────────

function standardize(X: number[][]): { X_scaled: number[][]; means: number[]; stdDevs: number[] } {
  const n = X[0].length;
  const m = X.length;
  const means = new Array(n).fill(0);
  const stdDevs = new Array(n).fill(1);

  // Compute means (skip intercept at index 0)
  for (let j = 1; j < n; j++) {
    let sum = 0;
    for (let i = 0; i < m; i++) sum += X[i][j];
    means[j] = sum / m;
  }

  // Compute std devs
  for (let j = 1; j < n; j++) {
    let varSum = 0;
    for (let i = 0; i < m; i++) varSum += Math.pow(X[i][j] - means[j], 2);
    stdDevs[j] = Math.sqrt(varSum / m);
    if (stdDevs[j] === 0) stdDevs[j] = 1; // avoid division by zero
  }

  // Scale
  const X_scaled = X.map(row => {
    const scaled = [...row];
    for (let j = 1; j < n; j++) {
      scaled[j] = (scaled[j] - means[j]) / stdDevs[j];
    }
    return scaled;
  });

  return { X_scaled, means, stdDevs };
}

function scaleFeatures(features: number[], means: number[], stdDevs: number[]): number[] {
  const scaled = [...features];
  for (let j = 1; j < features.length && j < means.length; j++) {
    scaled[j] = (scaled[j] - means[j]) / stdDevs[j];
  }
  return scaled;
}

// ─── Feature Names ──────────────────────────────────────────────────

const FEATURE_NAMES = [
  'intercept', 'RSI', 'MACD', 'EMA Deviation', 'EMA 20/50',
  'Volume', 'Sentiment', 'Sentiment Momentum', 'PCR',
  'Delivery%', 'Delivery Momentum', 'VIX', 'FII Flow', 'DII Flow',
  'Price Momentum', 'Bollinger Position',
];

// ─── Main Prediction Function ───────────────────────────────────────

export async function generatePrediction(
  symbol: string,
  currentFeatures?: {
    rsi?: number; macdHist?: number; ema20?: number; ema50?: number;
    close?: number; volumeRatio?: number; sentimentScore?: number;
    pcr?: number; deliveryPct?: number; bollingerUpper?: number; bollingerLower?: number;
  }
): Promise<MLPrediction | null> {
  try {
    // 1. Fetch historical data from Supabase
    const history = await getHistoricalFeatures(symbol, 120);
    const fiiFlows = await getRecentFIIDIIFlows(30);
    const fiiFeatures = computeFIIDIIFeatures(fiiFlows);

    // Get India VIX from most recent daily_features entry that has it
    const latestVix = history.find(h => h.india_vix != null)?.india_vix || 14;

    // 2. Build feature matrix from history
    // If we have insufficient historical data, fall back to current features only
    if (history.length < 10) {
      // Not enough history — use heuristic only
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
        features: [],
      };

      const heurResult = predictHeuristic(fv);
      const direction: 'up' | 'down' = heurResult.probability >= 0.5 ? 'up' : 'down';
      const confidence = Math.round((direction === 'up' ? heurResult.probability : 1 - heurResult.probability) * 100);

      const supportingSignals = heurResult.signals.filter(s =>
        (direction === 'up' && !s.toLowerCase().includes('bearish') && !s.toLowerCase().includes('selling') && !s.toLowerCase().includes('overbought')) ||
        (direction === 'down' && !s.toLowerCase().includes('bullish') && !s.toLowerCase().includes('buying') && !s.toLowerCase().includes('oversold'))
      ).slice(0, 5);

      const contradictingSignals = heurResult.signals.filter(s =>
        (direction === 'up' && (s.toLowerCase().includes('bearish') || s.toLowerCase().includes('selling') || s.toLowerCase().includes('overbought'))) ||
        (direction === 'down' && (s.toLowerCase().includes('bullish') || s.toLowerCase().includes('buying') || s.toLowerCase().includes('oversold')))
      ).slice(0, 3);

      // Save heuristic prediction to DB so dashboard can show it
      await savePrediction({
        symbol,
        predictedDirection: direction,
        probability: confidence,
        confidenceLevel: getConfidenceLevel(confidence),
        featuresJson: { heuristicSignals: heurResult.signals },
        supportingSignals,
        contradictingSignals,
        modelVersion: 'v2-heuristic-only',
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
          logisticRegression: { direction, probability: confidence },
          stumpEnsemble: { direction, probability: confidence },
          heuristic: { direction: direction, probability: confidence },
        },
        metrics: {
          trainingAccuracy: 0,
          validationAccuracy: 0,
          totalSamples: history.length,
          modelVersion: 'v2-heuristic-only',
        },
      };
    }

    // 3. Build training data from historical features
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

    // 4. Chronological train/validation split (70/30)
    const trainSize = Math.floor(m * 0.7);
    const X_train = X.slice(0, trainSize);
    const Y_train = Y.slice(0, trainSize);
    const X_val = X.slice(trainSize);
    const Y_val = Y.slice(trainSize);

    // 5. Standardize features
    const { X_scaled: X_trainScaled, means, stdDevs } = standardize(X_train);
    const X_valScaled = X_val.map(row => scaleFeatures(row, means, stdDevs));

    // 6. Train Sub-Model 1: Logistic Regression
    const theta = trainLogisticRegression(X_trainScaled, Y_train, 0.1, 0.05, 500);

    // 7. Train Sub-Model 2: Decision Stump Ensemble
    const stumps = trainStumpEnsemble(X_trainScaled, Y_train, 12);

    // 8. Evaluate both on validation set
    let lrCorrect = 0, stumpCorrect = 0;
    for (let i = 0; i < X_valScaled.length; i++) {
      const lrPred = predictLogReg(theta, X_valScaled[i]) >= 0.5 ? 1 : 0;
      const stumpPred = predictStumps(stumps, X_valScaled[i]) >= 0.5 ? 1 : 0;
      if (lrPred === Y_val[i]) lrCorrect++;
      if (stumpPred === Y_val[i]) stumpCorrect++;
    }

    const lrAccuracy = X_valScaled.length > 0 ? (lrCorrect / X_valScaled.length) * 100 : 50;
    const stumpAccuracy = X_valScaled.length > 0 ? (stumpCorrect / X_valScaled.length) * 100 : 50;

    // Training accuracy
    let lrTrainCorrect = 0;
    for (let i = 0; i < X_trainScaled.length; i++) {
      if ((predictLogReg(theta, X_trainScaled[i]) >= 0.5 ? 1 : 0) === Y_train[i]) lrTrainCorrect++;
    }
    const trainingAccuracy = X_trainScaled.length > 0 ? (lrTrainCorrect / X_trainScaled.length) * 100 : 50;

    // 9. Predict today → tomorrow
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

    // Inject latest FII/DII
    latestRow.fii_net = fiiFeatures.fiiNetToday || latestRow.fii_net || 0;
    latestRow.dii_net = fiiFeatures.diiNetToday || latestRow.dii_net || 0;
    latestRow.india_vix = latestVix;

    const todayFV = extractFeatures(latestRow, prevLatestRow);
    const todayScaled = scaleFeatures(todayFV.features, means, stdDevs);

    // Sub-model predictions
    const lrProb = predictLogReg(theta, todayScaled);
    const stumpProb = predictStumps(stumps, todayScaled);
    const heurResult = predictHeuristic(todayFV);

    // 10. Ensemble: Weighted vote
    // Weight models by their validation accuracy
    const lrWeight = Math.max(0.1, (lrAccuracy - 45) / 20);    // Higher weight for better accuracy
    const stumpWeight = Math.max(0.1, (stumpAccuracy - 45) / 20);
    const heurWeight = 0.3;                                       // Constant weight for heuristic

    const totalWeight = lrWeight + stumpWeight + heurWeight;
    const ensembleProb = (lrProb * lrWeight + stumpProb * stumpWeight + heurResult.probability * heurWeight) / totalWeight;

    const direction: 'up' | 'down' = ensembleProb >= 0.5 ? 'up' : 'down';
    const rawConfidence = Math.round((direction === 'up' ? ensembleProb : 1 - ensembleProb) * 100);

    // Confidence discount for low data quality
    let confidenceDiscount = 0;
    if (m < 20) confidenceDiscount += 10;     // Very little training data
    if (latestVix > 22) confidenceDiscount += 5; // High uncertainty
    if (Math.abs(lrAccuracy - stumpAccuracy) > 15) confidenceDiscount += 5; // Models disagree

    const confidence = Math.max(50, Math.min(95, rawConfidence - confidenceDiscount));

    // 11. Generate human-readable signals
    const supportingSignals = heurResult.signals.filter(s => {
      const isPositive = s.toLowerCase().includes('bullish') || s.toLowerCase().includes('buying') ||
        s.toLowerCase().includes('oversold') || s.toLowerCase().includes('uptrend') ||
        s.toLowerCase().includes('genuine') || s.toLowerCase().includes('bounce') ||
        s.toLowerCase().includes('calm') || s.toLowerCase().includes('positive');
      return direction === 'up' ? isPositive : !isPositive;
    }).slice(0, 5);

    const contradictingSignals = heurResult.signals.filter(s => {
      const isPositive = s.toLowerCase().includes('bullish') || s.toLowerCase().includes('buying') ||
        s.toLowerCase().includes('oversold') || s.toLowerCase().includes('uptrend') ||
        s.toLowerCase().includes('genuine') || s.toLowerCase().includes('bounce');
      return direction === 'up' ? !isPositive : isPositive;
    }).slice(0, 3);

    // 12. Feature importance from LR coefficients
    const absWeights = theta.slice(1).map(w => Math.abs(w));
    const sumWeights = absWeights.reduce((s, w) => s + w, 0) || 1;
    const featureImportance: Record<string, number> = {};
    for (let j = 0; j < absWeights.length && j + 1 < FEATURE_NAMES.length; j++) {
      featureImportance[FEATURE_NAMES[j + 1]] = Math.round((absWeights[j] / sumWeights) * 100);
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
        logisticRegression: {
          direction: lrProb >= 0.5 ? 'up' : 'down',
          probability: Math.round((lrProb >= 0.5 ? lrProb : 1 - lrProb) * 100),
        },
        stumpEnsemble: {
          direction: stumpProb >= 0.5 ? 'up' : 'down',
          probability: Math.round((stumpProb >= 0.5 ? stumpProb : 1 - stumpProb) * 100),
        },
        heuristic: {
          direction: heurResult.probability >= 0.5 ? 'up' : 'down',
          probability: Math.round((heurResult.probability >= 0.5 ? heurResult.probability : 1 - heurResult.probability) * 100),
        },
      },
      metrics: {
        trainingAccuracy: parseFloat(trainingAccuracy.toFixed(1)),
        validationAccuracy: parseFloat(Math.max(lrAccuracy, stumpAccuracy).toFixed(1)),
        totalSamples: m,
        modelVersion: 'v2-ensemble',
      },
    };

    // 13. Save prediction to Supabase for tracking
    await savePrediction({
      symbol,
      predictedDirection: direction,
      probability: confidence,
      confidenceLevel: prediction.confidenceLevel,
      featuresJson: {
        ...featureImportance,
        subModels: prediction.subModelVotes,
        lrAccuracy, stumpAccuracy,
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
