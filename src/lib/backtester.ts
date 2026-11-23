// Walk-Forward Backtester for MarketPulse Prediction Engine
// Evaluates out-of-sample prediction accuracy and strategy performance using historical daily features.
// Features: 20-dimensional feature vector, walk-forward GBDT training, regime classification, and comprehensive performance metrics.

import { getHistoricalFeatures } from './nseData';
import { getRecentFIIDIIFlows, computeFIIDIIFeatures } from './fiiDiiData';
import { trainGBDT, predictGBDT, GBDTModel } from './gbdt';
import { getServiceClient } from './supabase';

// ─── Types ──────────────────────────────────────────────────────────

export interface BacktestResult {
  symbol: string;
  totalDays: number;
  correctDays: number;
  accuracy: number;
  profitFactor: number;        // sum winning returns / sum losing returns
  maxDrawdown: number;         // worst peak-to-trough %
  winRate: number;
  avgWinReturn: number;
  avgLossReturn: number;
  sharpeRatio: number;
  confidenceBuckets: Array<{ bucket: string; total: number; correct: number; accuracy: number }>;
  byRegime: Array<{ regime: string; total: number; correct: number; accuracy: number }>;
  dailyResults: Array<{
    date: string;
    predicted: 'up' | 'down';
    actual: 'up' | 'down';
    confidence: number;
    returnPct: number;
    correct: boolean;
  }>;
}

export interface BacktestOptions {
  minTrainDays?: number;
  testDays?: number;
}

// ─── GBDT Configuration ─────────────────────────────────────────────

const BACKTEST_GBDT_CONFIG = {
  numTrees: 30,
  maxDepth: 3,
  learningRate: 0.08,
  subsampleRatio: 0.8,
  minSamplesLeaf: 3,
  l2Regularization: 1.0,
  earlyStoppingRounds: 5,
};

// ─── Local Wilder's RSI Helper ──────────────────────────────────────

function computeWilderRSI(closes: number[], period: number = 5): number {
  if (closes.length < period + 1) return 50;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }

  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

// ─── Local 20-Feature Extraction ────────────────────────────────────

function extractLocalFeatures(history: any[], index: number): number[] {
  const row = history[index];
  const prevRow = index > 0 ? history[index - 1] : row;

  const close = row.close ?? 0;
  const prevClose = prevRow?.close ?? close;
  const rsi = row.rsi ?? 50;
  const macdHist = row.macd_hist ?? 0;
  const ema20 = row.ema20 ?? close;
  const ema50 = row.ema50 ?? close;
  const volumeRatio = row.volume_ratio ?? 1;
  const sentimentScore = row.sentiment_score ?? 50;
  const prevSentiment = prevRow?.sentiment_score ?? 50;
  const pcr = row.pcr ?? 1;
  const deliveryPct = row.delivery_pct ?? 40;
  const prevDeliveryPct = prevRow?.delivery_pct ?? 40;
  const indiaVix = row.india_vix ?? 14;
  const fiiNet = row.fii_net ?? 0;
  const diiNet = row.dii_net ?? 0;
  const bollingerUpper = row.bollinger_upper ?? close * 1.02;
  const bollingerLower = row.bollinger_lower ?? close * 0.98;

  // 15 Original Features
  const f_rsi = (rsi - 50) / 50;
  const f_macd = close > 0 ? macdHist / close : 0;
  const f_emaDev = ema20 > 0 ? (close - ema20) / ema20 : 0;
  const f_ema2050 = ema50 > 0 ? (ema20 - ema50) / ema50 : 0;
  const f_volume = Math.log(Math.max(0.01, volumeRatio));
  const f_sentiment = (sentimentScore - 50) / 50;
  const f_sentimentMom = (sentimentScore - prevSentiment) / 50;
  const f_pcr = pcr - 1.0;
  const f_delivery = deliveryPct / 100;
  const f_deliveryMom = (deliveryPct - prevDeliveryPct) / 100;
  const f_vix = (indiaVix - 15) / 15;
  const f_fii = fiiNet / 5000;
  const f_dii = diiNet / 5000;
  const f_priceMom = prevClose > 0 ? (close - prevClose) / prevClose : 0;
  const f_bbPosition = bollingerUpper !== bollingerLower
    ? (close - bollingerLower) / (bollingerUpper - bollingerLower) - 0.5
    : 0;

  // 5 New Multi-Timeframe Features
  // 1. 5-day return
  let f_return5d = 0;
  if (index >= 5 && history[index - 5]?.close > 0) {
    f_return5d = (close - history[index - 5].close) / history[index - 5].close;
  }

  // 2. 20-day return
  let f_return20d = 0;
  if (index >= 20 && history[index - 20]?.close > 0) {
    f_return20d = (close - history[index - 20].close) / history[index - 20].close;
  }

  // 3. RSI(5) with Wilder smoothing
  const recentCloses = history
    .slice(Math.max(0, index - 15), index + 1)
    .map((r: any) => r.close ?? 0);
  const rawRsi5 = computeWilderRSI(recentCloses, 5);
  const f_rsi5 = (rawRsi5 - 50) / 50;

  // 4. ATR dev = (close - ema20) / ATR over last 14 days, clamped to [-3, 3]
  let f_atrDev = 0;
  const lookback = Math.min(14, index + 1);
  let trSum = 0;
  for (let k = index - lookback + 1; k <= index; k++) {
    const h = history[k]?.high ?? history[k]?.close ?? close;
    const l = history[k]?.low ?? history[k]?.close ?? close;
    trSum += (h - l);
  }
  const atr = trSum / lookback;
  if (atr > 0) {
    f_atrDev = Math.max(-3, Math.min(3, (close - ema20) / atr));
  }

  // 5. SMA(200) deviation = close / SMA(200) - 1
  let f_sma200dev = 0;
  if (index >= 199) {
    let sum200 = 0;
    for (let k = index - 199; k <= index; k++) {
      sum200 += history[k]?.close ?? 0;
    }
    const sma200 = sum200 / 200;
    if (sma200 > 0) {
      f_sma200dev = close / sma200 - 1;
    }
  }

  return [
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
    f_return5d,
    f_return20d,
    f_rsi5,
    f_atrDev,
    f_sma200dev,
  ];
}

// ─── Confidence Bucket Mapper ───────────────────────────────────────

function getConfidenceBucket(confidence: number): string {
  if (confidence < 55) return '50-55';
  if (confidence < 60) return '55-60';
  if (confidence < 65) return '60-65';
  if (confidence < 70) return '65-70';
  return '70+';
}

// ─── Metric Computation Helper ──────────────────────────────────────

function computeMetrics(
  symbol: string,
  dailyResults: Array<{
    date: string;
    predicted: 'up' | 'down';
    actual: 'up' | 'down';
    confidence: number;
    returnPct: number;
    correct: boolean;
  }>,
  resultsWithRegime: Array<{
    regime: string;
    correct: boolean;
  }>
): BacktestResult {
  const totalDays = dailyResults.length;
  const correctDays = dailyResults.filter(d => d.correct).length;
  const accuracy = totalDays > 0 ? parseFloat(((correctDays / totalDays) * 100).toFixed(1)) : 0;
  const winRate = accuracy;

  const winningReturns = dailyResults.filter(d => d.returnPct > 0).map(d => d.returnPct);
  const losingReturns = dailyResults.filter(d => d.returnPct < 0).map(d => d.returnPct);

  const avgWinReturn = winningReturns.length > 0
    ? parseFloat((winningReturns.reduce((s, r) => s + r, 0) / winningReturns.length).toFixed(2))
    : 0;

  const avgLossReturn = losingReturns.length > 0
    ? parseFloat((losingReturns.reduce((s, r) => s + r, 0) / losingReturns.length).toFixed(2))
    : 0;

  const sumWins = winningReturns.reduce((s, r) => s + r, 0);
  const sumLosses = Math.abs(losingReturns.reduce((s, r) => s + r, 0));
  const profitFactor = sumLosses > 0 ? parseFloat((sumWins / sumLosses).toFixed(2)) : (sumWins > 0 ? 999 : 0);

  // Cumulative equity curve starting at 1.0; find worst peak-to-trough %
  let equity = 1.0;
  let peak = 1.0;
  let maxDd = 0;
  for (const d of dailyResults) {
    equity *= (1 + d.returnPct / 100);
    if (equity > peak) {
      peak = equity;
    }
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDd) {
      maxDd = dd;
    }
  }
  const maxDrawdown = parseFloat(maxDd.toFixed(2));

  // Sharpe ratio: mean(daily returns) / std(daily returns) * sqrt(252)
  const rets = dailyResults.map(d => d.returnPct);
  const mean = rets.length > 0 ? rets.reduce((s, r) => s + r, 0) / rets.length : 0;
  const variance = rets.length > 1
    ? rets.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (rets.length - 1)
    : 0;
  const std = Math.sqrt(variance);
  const sharpeRatio = std > 0 ? parseFloat(((mean / std) * Math.sqrt(252)).toFixed(2)) : 0;

  // Confidence buckets: [50-55, 55-60, 60-65, 65-70, 70+]
  const bucketDefs = ['50-55', '55-60', '60-65', '65-70', '70+'];
  const bucketMap = new Map<string, { total: number; correct: number }>();
  for (const b of bucketDefs) bucketMap.set(b, { total: 0, correct: 0 });

  for (const d of dailyResults) {
    const b = getConfidenceBucket(d.confidence);
    const entry = bucketMap.get(b);
    if (entry) {
      entry.total++;
      if (d.correct) entry.correct++;
    }
  }

  const confidenceBuckets = bucketDefs.map(b => {
    const entry = bucketMap.get(b)!;
    return {
      bucket: b,
      total: entry.total,
      correct: entry.correct,
      accuracy: entry.total > 0 ? parseFloat(((entry.correct / entry.total) * 100).toFixed(1)) : 0,
    };
  });

  // By regime: bull (>2% 20d return), bear (<-2% 20d return), sideways
  const regimeDefs = ['bull', 'bear', 'sideways'];
  const regimeMap = new Map<string, { total: number; correct: number }>();
  for (const r of regimeDefs) regimeMap.set(r, { total: 0, correct: 0 });

  for (const item of resultsWithRegime) {
    const entry = regimeMap.get(item.regime);
    if (entry) {
      entry.total++;
      if (item.correct) entry.correct++;
    }
  }

  const byRegime = regimeDefs.map(reg => {
    const entry = regimeMap.get(reg)!;
    return {
      regime: reg,
      total: entry.total,
      correct: entry.correct,
      accuracy: entry.total > 0 ? parseFloat(((entry.correct / entry.total) * 100).toFixed(1)) : 0,
    };
  });

  return {
    symbol,
    totalDays,
    correctDays,
    accuracy,
    profitFactor,
    maxDrawdown,
    winRate,
    avgWinReturn,
    avgLossReturn,
    sharpeRatio,
    confidenceBuckets,
    byRegime,
    dailyResults,
  };
}

// ─── Main Walk-Forward Backtester ───────────────────────────────────

export async function runBacktest(
  symbol: string,
  options?: BacktestOptions
): Promise<BacktestResult | null> {
  const minTrainDays = options?.minTrainDays ?? 60;
  const testDays = options?.testDays;

  // 1. Fetch historical features (500 days)
  const history = await getHistoricalFeatures(symbol, 500);
  if (!history || history.length < minTrainDays + 2) {
    return null;
  }

  // Ensure chronological order
  history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Merge FII/DII flow data if not already populated on rows
  try {
    const fiiFlows = await getRecentFIIDIIFlows(500);
    if (fiiFlows && fiiFlows.length > 0) {
      // Validate flows using institutional feature helper
      computeFIIDIIFeatures(fiiFlows);

      const flowMap = new Map<string, { fiiNet: number; diiNet: number }>();
      for (const flow of fiiFlows) {
        flowMap.set(flow.date, { fiiNet: flow.fiiNet, diiNet: flow.diiNet });
      }
      for (const row of history) {
        const flow = flowMap.get(row.date);
        if (flow) {
          if (row.fii_net == null) row.fii_net = flow.fiiNet;
          if (row.dii_net == null) row.dii_net = flow.diiNet;
        }
      }
    }
  } catch (err) {
    console.warn(`[Backtester] Failed to fetch FII/DII flows for ${symbol}:`, err);
  }

  const n = history.length;

  // 2. Precompute 20 features for all rows
  const featureVectors: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    featureVectors[i] = extractLocalFeatures(history, i);
  }

  // Precompute sample validity and labels for transitions j -> j+1
  const isSampleValid: boolean[] = new Array(n - 1).fill(false);
  const sampleLabels: number[] = new Array(n - 1).fill(0);

  for (let j = 1; j < n - 1; j++) {
    const fv = featureVectors[j];
    // Filter: skip rows with >40% zero features
    const zeroCount = fv.filter(v => v === 0).length;
    if (zeroCount / fv.length > 0.4) continue;

    // Filter: skip flat days (<0.3% move) — noise
    const currClose = history[j].close || 1;
    const nextClose = history[j + 1].close || currClose;
    const returnPct = (nextClose - currClose) / currClose;
    if (Math.abs(returnPct) < 0.003) continue;

    isSampleValid[j] = true;
    sampleLabels[j] = returnPct > 0 ? 1 : 0;
  }

  // Determine starting day for walk-forward testing
  // Each day i from startIdx to n - 2 predicts day i + 1
  let startIdx = minTrainDays;
  if (testDays && testDays > 0) {
    startIdx = Math.max(minTrainDays, (n - 1) - testDays);
  }

  if (startIdx >= n - 1) {
    return null;
  }

  // Build initial training set up to startIdx - 1
  const X: number[][] = [];
  const Y: number[] = [];

  for (let j = 1; j < startIdx; j++) {
    if (isSampleValid[j]) {
      X.push(featureVectors[j]);
      Y.push(sampleLabels[j]);
    }
  }

  const dailyResults: Array<{
    date: string;
    predicted: 'up' | 'down';
    actual: 'up' | 'down';
    confidence: number;
    returnPct: number;
    correct: boolean;
  }> = [];

  const resultsWithRegime: Array<{
    regime: string;
    correct: boolean;
  }> = [];

  // Walk-forward loop: for each day from startIdx to n - 2
  for (let i = startIdx; i < n - 1; i++) {
    // Add the newly completed transition (i - 1 -> i) to the training pool
    if (i > startIdx && isSampleValid[i - 1]) {
      X.push(featureVectors[i - 1]);
      Y.push(sampleLabels[i - 1]);
    }

    // Require at least 10 quality training samples
    if (X.length < 10) {
      continue;
    }

    // Chronological train / validation split (80% train, 20% validation for early stopping)
    const valCount = Math.max(2, Math.floor(X.length * 0.2));
    const trainCount = X.length - valCount;
    const X_train = X.slice(0, trainCount);
    const Y_train = Y.slice(0, trainCount);
    const X_val = X.slice(trainCount);
    const Y_val = Y.slice(trainCount);

    // Train GBDT on prior data
    const model: GBDTModel = trainGBDT(
      X_train,
      Y_train,
      X_val,
      Y_val,
      BACKTEST_GBDT_CONFIG
    );

    // Predict next day (i -> i + 1)
    const testFeatures = featureVectors[i];
    const prob = predictGBDT(model, testFeatures);
    const predicted: 'up' | 'down' = prob >= 0.5 ? 'up' : 'down';
    // Map probability to 50-100 confidence
    const confidence = parseFloat((Math.max(prob, 1 - prob) * 100).toFixed(1));

    // Next day actual outcome
    const currClose = history[i].close || 1;
    const nextClose = history[i + 1].close || currClose;
    const priceMovePct = ((nextClose - currClose) / currClose) * 100;
    const actual: 'up' | 'down' = nextClose >= currClose ? 'up' : 'down';
    const correct = predicted === actual;

    // Directional strategy return: long if predicted up, short if predicted down
    const returnPct = parseFloat((predicted === 'up' ? priceMovePct : -priceMovePct).toFixed(2));

    // Regime detection: 20-day return >2% = bull, <-2% = bear, else = sideways
    const close20 = i >= 20 ? history[i - 20].close : history[0].close;
    const ret20Pct = close20 > 0 ? ((currClose - close20) / close20) * 100 : 0;
    const regime: 'bull' | 'bear' | 'sideways' =
      ret20Pct > 2 ? 'bull' : ret20Pct < -2 ? 'bear' : 'sideways';

    dailyResults.push({
      date: history[i + 1].date,
      predicted,
      actual,
      confidence,
      returnPct,
      correct,
    });

    resultsWithRegime.push({
      regime,
      correct,
    });
  }

  if (dailyResults.length === 0) {
    return null;
  }

  return computeMetrics(symbol, dailyResults, resultsWithRegime);
}

// ─── Aggregate Backtest Across All Symbols ──────────────────────────

export async function runBacktestAll(
  options?: BacktestOptions
): Promise<{ aggregate: BacktestResult; perSymbol: BacktestResult[] }> {
  const db = getServiceClient();

  // Query distinct symbols from daily_features
  let symbols: string[] = [];
  try {
    const { data } = await db
      .from('daily_features')
      .select('symbol')
      .limit(10000);

    if (data && data.length > 0) {
      symbols = Array.from(new Set(data.map((r: any) => r.symbol).filter(Boolean)));
    }
  } catch (err) {
    console.warn('[Backtester] Failed to query distinct symbols from daily_features:', err);
  }

  // Fallback to major F&O symbols if table is empty or error
  if (symbols.length === 0) {
    symbols = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK'];
  }

  const perSymbol: BacktestResult[] = [];

  for (const symbol of symbols) {
    try {
      const res = await runBacktest(symbol, options);
      if (res && res.totalDays > 0) {
        perSymbol.push(res);
      }
    } catch (err) {
      console.warn(`[Backtester] Backtest failed for ${symbol}:`, err);
    }
  }

  const emptyAggregate: BacktestResult = {
    symbol: 'ALL',
    totalDays: 0,
    correctDays: 0,
    accuracy: 0,
    profitFactor: 0,
    maxDrawdown: 0,
    winRate: 0,
    avgWinReturn: 0,
    avgLossReturn: 0,
    sharpeRatio: 0,
    confidenceBuckets: [
      { bucket: '50-55', total: 0, correct: 0, accuracy: 0 },
      { bucket: '55-60', total: 0, correct: 0, accuracy: 0 },
      { bucket: '60-65', total: 0, correct: 0, accuracy: 0 },
      { bucket: '65-70', total: 0, correct: 0, accuracy: 0 },
      { bucket: '70+', total: 0, correct: 0, accuracy: 0 },
    ],
    byRegime: [
      { regime: 'bull', total: 0, correct: 0, accuracy: 0 },
      { regime: 'bear', total: 0, correct: 0, accuracy: 0 },
      { regime: 'sideways', total: 0, correct: 0, accuracy: 0 },
    ],
    dailyResults: [],
  };

  if (perSymbol.length === 0) {
    return {
      aggregate: emptyAggregate,
      perSymbol: [],
    };
  }

  // Aggregate stats across all symbols
  const totalDays = perSymbol.reduce((s, r) => s + r.totalDays, 0);
  const correctDays = perSymbol.reduce((s, r) => s + r.correctDays, 0);
  const accuracy = totalDays > 0 ? parseFloat(((correctDays / totalDays) * 100).toFixed(1)) : 0;
  const winRate = accuracy;

  const allDaily = perSymbol
    .flatMap(r => r.dailyResults)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const winningReturns = allDaily.filter(d => d.returnPct > 0).map(d => d.returnPct);
  const losingReturns = allDaily.filter(d => d.returnPct < 0).map(d => d.returnPct);

  const avgWinReturn = winningReturns.length > 0
    ? parseFloat((winningReturns.reduce((s, r) => s + r, 0) / winningReturns.length).toFixed(2))
    : 0;

  const avgLossReturn = losingReturns.length > 0
    ? parseFloat((losingReturns.reduce((s, r) => s + r, 0) / losingReturns.length).toFixed(2))
    : 0;

  const sumWins = winningReturns.reduce((s, r) => s + r, 0);
  const sumLosses = Math.abs(losingReturns.reduce((s, r) => s + r, 0));
  const profitFactor = sumLosses > 0 ? parseFloat((sumWins / sumLosses).toFixed(2)) : (sumWins > 0 ? 999 : 0);

  // Multi-asset portfolio equity curve and drawdown
  const dateMap = new Map<string, number[]>();
  for (const d of allDaily) {
    if (!dateMap.has(d.date)) dateMap.set(d.date, []);
    dateMap.get(d.date)!.push(d.returnPct);
  }

  const dates = Array.from(dateMap.keys()).sort();
  let equity = 1.0;
  let peak = 1.0;
  let maxDd = 0;
  const portfolioDailyReturns: number[] = [];

  for (const dt of dates) {
    const rets = dateMap.get(dt)!;
    const avgDayRet = rets.reduce((s, r) => s + r, 0) / rets.length;
    portfolioDailyReturns.push(avgDayRet);
    equity *= (1 + avgDayRet / 100);
    if (equity > peak) {
      peak = equity;
    }
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDd) {
      maxDd = dd;
    }
  }
  const maxDrawdown = parseFloat(maxDd.toFixed(2));

  // Portfolio Sharpe ratio
  const mean = portfolioDailyReturns.length > 0
    ? portfolioDailyReturns.reduce((s, r) => s + r, 0) / portfolioDailyReturns.length
    : 0;
  const variance = portfolioDailyReturns.length > 1
    ? portfolioDailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (portfolioDailyReturns.length - 1)
    : 0;
  const std = Math.sqrt(variance);
  const sharpeRatio = std > 0 ? parseFloat(((mean / std) * Math.sqrt(252)).toFixed(2)) : 0;

  // Aggregate confidence buckets
  const bucketDefs = ['50-55', '55-60', '60-65', '65-70', '70+'];
  const confidenceBuckets = bucketDefs.map(b => {
    let bTotal = 0;
    let bCorrect = 0;
    for (const r of perSymbol) {
      const found = r.confidenceBuckets.find(cb => cb.bucket === b);
      if (found) {
        bTotal += found.total;
        bCorrect += found.correct;
      }
    }
    return {
      bucket: b,
      total: bTotal,
      correct: bCorrect,
      accuracy: bTotal > 0 ? parseFloat(((bCorrect / bTotal) * 100).toFixed(1)) : 0,
    };
  });

  // Aggregate by regime
  const regimeDefs = ['bull', 'bear', 'sideways'];
  const byRegime = regimeDefs.map(reg => {
    let rTotal = 0;
    let rCorrect = 0;
    for (const r of perSymbol) {
      const found = r.byRegime.find(br => br.regime === reg);
      if (found) {
        rTotal += found.total;
        rCorrect += found.correct;
      }
    }
    return {
      regime: reg,
      total: rTotal,
      correct: rCorrect,
      accuracy: rTotal > 0 ? parseFloat(((rCorrect / rTotal) * 100).toFixed(1)) : 0,
    };
  });

  return {
    aggregate: {
      symbol: 'ALL',
      totalDays,
      correctDays,
      accuracy,
      profitFactor,
      maxDrawdown,
      winRate,
      avgWinReturn,
      avgLossReturn,
      sharpeRatio,
      confidenceBuckets,
      byRegime,
      dailyResults: allDaily,
    },
    perSymbol,
  };
}
