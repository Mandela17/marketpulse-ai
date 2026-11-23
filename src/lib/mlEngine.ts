// Production ML Prediction Engine v6 — Server-Side
// Ensemble: Gradient Boosted Decision Tree (GBDT) + Rule-Based Heuristic
// Features: 30-dimensional feature vector with multi-timeframe, global, options, and alternative data
// Phase 2: Z-score standardization, frozen-model-only (no on-demand training), 5 new multi-timeframe features
// Supports frozen model mode: train nightly via cron, serve predictions from saved weights.
// Adaptive: Ensemble weights auto-tuned from rolling accuracy via adaptiveLearning.ts

import { getHistoricalFeatures } from './nseData';
import { getRecentFIIDIIFlows, computeFIIDIIFeatures } from './fiiDiiData';
import { savePrediction, getConfidenceLevel } from './predictionHistory';
import { trainGBDT, predictGBDT, GBDTModel } from './gbdt';
import { getEnsembleWeights } from './adaptiveLearning';
import { getServiceClient } from './supabase';

// ─── Types ──────────────────────────────────────────────────────────

export type TradeGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface MLPrediction {
  symbol: string;
  direction: 'up' | 'down';
  confidence: number;          // 0-100
  confidenceLevel: 'low' | 'moderate' | 'high' | 'very_high';
  // Signal confluence
  tradeGrade: TradeGrade;
  confluenceScore: number;      // 0-6: how many signal categories agree
  tradeable: boolean;           // Only true for A/B grades
  confluenceBreakdown: Record<string, 'bullish' | 'bearish' | 'neutral'>;
  // Signals
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
  // Phase 3: Global correlations + Options intelligence
  sp500Overnight: number;    // S&P 500 overnight return (normalized)
  dxyChange: number;         // Dollar Index change (inverted, normalized)
  crudeChange: number;       // Brent Crude change (inverted, normalized)
  giftNiftyGap: number;      // GIFT Nifty implied gap % (normalized)
  maxPainDist: number;       // Distance from Max Pain (normalized)
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
  sp500Overnight?: number; dxyChange?: number; crudeChange?: number;
  giftNiftyGap?: number; maxPainDist?: number;
}, historyContext?: any[]): FeatureVector {
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
  // Global + Options data
  const sp500Overnight = altData?.sp500Overnight || 0;
  const dxyChange = altData?.dxyChange || 0;
  const crudeChange = altData?.crudeChange || 0;
  const giftNiftyGap = altData?.giftNiftyGap || 0;
  const maxPainDist = altData?.maxPainDist || 0;

  // ─── Phase 2: Multi-timeframe features from history context ───
  let f_return5d = 0;
  let f_return20d = 0;
  let f_rsi5 = 0;
  let f_atrDev = 0;
  let f_sma200dev = 0;

  if (historyContext && historyContext.length > 0) {
    // 5-day return
    if (historyContext.length >= 5) {
      const close5dAgo = historyContext[historyContext.length - 5]?.close;
      if (close5dAgo > 0) f_return5d = (close - close5dAgo) / close5dAgo;
    }
    // 20-day return
    if (historyContext.length >= 20) {
      const close20dAgo = historyContext[historyContext.length - 20]?.close;
      if (close20dAgo > 0) f_return20d = (close - close20dAgo) / close20dAgo;
    }
    // RSI(5) — short-term RSI from recent closes
    const recentCloses = historyContext.slice(-6).map((r: any) => r.close).concat(close);
    f_rsi5 = (computeLocalRSI(recentCloses, 5) - 50) / 50;
    // ATR (14-day average true range) normalized price deviation
    if (historyContext.length >= 14) {
      const atrSlice = historyContext.slice(-14);
      let atrSum = 0;
      for (const h of atrSlice) {
        atrSum += (h.high || h.close) - (h.low || h.close);
      }
      const atr = atrSum / 14;
      if (atr > 0) f_atrDev = Math.max(-3, Math.min(3, (close - ema20) / atr));
    }
    // Price vs SMA(200)
    if (historyContext.length >= 200) {
      const sma200slice = historyContext.slice(-200);
      const sma200 = sma200slice.reduce((s: number, r: any) => s + (r.close || 0), 0) / 200;
      if (sma200 > 0) f_sma200dev = close / sma200 - 1;
    }
  }

  // Feature engineering — 25 core features + 5 multi-timeframe = 30 total
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
  // Alt data features
  const f_obi = obi;                                                         // Order Book Imbalance [-1, 1]
  const f_pocPosition = pocPosition / 100;                                   // POC distance normalized
  const f_fiiVelocity = fiiVelocity / 2000;                                 // FII acceleration normalized
  const f_flowDivergence = flowDivergence > 0                                // Flow divergence sign
    ? Math.min(1, Math.log(1 + flowDivergence / 100000)) 
    : -Math.min(1, Math.log(1 + Math.abs(flowDivergence) / 100000));
  const f_cumFlow10d = cumFlow10d / 20000;                                   // 10-day cum flow normalized
  // Global correlations + Options intelligence (already normalized [-1, 1])
  const f_sp500Overnight = sp500Overnight;
  const f_dxyChange = dxyChange;
  const f_crudeChange = crudeChange;
  const f_giftNiftyGap = giftNiftyGap;
  const f_maxPainDist = maxPainDist;

  return {
    rsi, macdHist, ema20, close, volumeRatio, sentimentScore,
    pcr, deliveryPct, indiaVix, fiiNet, diiNet, bollingerUpper, bollingerLower,
    obi, pocPosition, fiiVelocity, flowDivergence, cumFlow10d,
    sp500Overnight, dxyChange, crudeChange, giftNiftyGap, maxPainDist,
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
      // Global + Options (5 features)
      f_sp500Overnight,
      f_dxyChange,
      f_crudeChange,
      f_giftNiftyGap,
      f_maxPainDist,
      // Phase 2: Multi-timeframe features (5 new)
      f_return5d,
      f_return20d,
      f_rsi5,
      f_atrDev,
      f_sma200dev,
    ],
  };
}

// ─── Local RSI helper for multi-timeframe (avoids importing technicalAnalysis) ──
function computeLocalRSI(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
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

  // ─── Phase 3: Global correlation signals ───

  // GIFT Nifty gap
  if (fv.giftNiftyGap > 0.3) { score += 1.5; signals.push(`GIFT Nifty indicating gap up (${(fv.giftNiftyGap * 3).toFixed(1)}%)`); }
  else if (fv.giftNiftyGap < -0.3) { score -= 1.5; signals.push(`GIFT Nifty indicating gap down (${(fv.giftNiftyGap * 3).toFixed(1)}%)`); }

  // S&P 500 overnight
  if (fv.sp500Overnight > 0.3) { score += 1; signals.push(`S&P 500 rallied overnight — risk-on sentiment`); }
  else if (fv.sp500Overnight < -0.3) { score -= 1; signals.push(`S&P 500 fell overnight — risk-off pressure`); }

  // DXY (already inverted in feature)
  if (fv.dxyChange > 0.3) { score += 0.5; signals.push('Weakening dollar — positive for EM flows'); }
  else if (fv.dxyChange < -0.3) { score -= 0.5; signals.push('Strengthening dollar — FII outflow risk'); }

  // Crude (already inverted in feature)
  if (fv.crudeChange > 0.3) { score += 0.5; signals.push('Falling crude — eases India inflation pressure'); }
  else if (fv.crudeChange < -0.3) { score -= 0.5; signals.push('Rising crude — negative for India current account'); }

  // Max Pain proximity (mean-reversion signal)
  if (Math.abs(fv.maxPainDist) > 0.5) {
    // Price far from Max Pain — expect pull toward it
    if (fv.maxPainDist > 0) {
      score -= 0.5; signals.push(`Price above Max Pain — mean-reversion pull downward on expiry`);
    } else {
      score += 0.5; signals.push(`Price below Max Pain — mean-reversion pull upward on expiry`);
    }
  }

  // Convert score to probability (score typically -12 to +12)
  const probability = sigmoid(score * 0.3);

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
  'S&P 500 Overnight', 'DXY Change', 'Crude Change',
  'GIFT Nifty Gap', 'Max Pain Distance',
  // Phase 2: Multi-timeframe features
  '5-Day Return', '20-Day Return', 'RSI(5)',
  'ATR-Normalized Dev', 'Price vs SMA(200)',
];

// ─── Signal Confluence Scoring ──────────────────────────────────────
// Counts how many INDEPENDENT signal categories agree on direction.
// 6 categories: Technical Momentum, Mean Reversion, Volume, Institutional Flow,
//               Sentiment/VIX, Options Data

interface ConfluenceResult {
  score: number;                    // 0-6: categories agreeing with predicted direction
  breakdown: Record<string, 'bullish' | 'bearish' | 'neutral'>;
  grade: TradeGrade;
  tradeable: boolean;
}

function computeConfluence(
  fv: FeatureVector,
  direction: 'up' | 'down',
  gbdtDir: 'up' | 'down',
  heurDir: 'up' | 'down',
  confidence: number,
): ConfluenceResult {
  const breakdown: Record<string, 'bullish' | 'bearish' | 'neutral'> = {};

  // 1. Technical Momentum (RSI + MACD + EMA trend)
  let techScore = 0;
  if (fv.rsi < 40) techScore++;
  if (fv.rsi > 60) techScore--;
  if (fv.macdHist > 0) techScore++;
  if (fv.macdHist < 0) techScore--;
  if (fv.close > fv.ema20) techScore++;
  if (fv.close < fv.ema20) techScore--;
  breakdown['Technical'] = techScore > 0 ? 'bullish' : techScore < 0 ? 'bearish' : 'neutral';

  // 2. Mean Reversion / Bollinger
  let bbScore = 0;
  if (fv.close < fv.bollingerLower) bbScore = 1;      // Oversold → bullish reversion
  else if (fv.close > fv.bollingerUpper) bbScore = -1; // Overbought → bearish reversion
  breakdown['Bollinger'] = bbScore > 0 ? 'bullish' : bbScore < 0 ? 'bearish' : 'neutral';

  // 3. Volume Confirmation
  let volScore = 0;
  if (fv.volumeRatio > 1.3 && fv.close > fv.ema20) volScore = 1;
  else if (fv.volumeRatio > 1.3 && fv.close < fv.ema20) volScore = -1;
  else if (fv.deliveryPct > 55 && fv.close > fv.ema20) volScore = 1;
  breakdown['Volume'] = volScore > 0 ? 'bullish' : volScore < 0 ? 'bearish' : 'neutral';

  // 4. Institutional Flow (FII + DII)
  let flowScore = 0;
  if (fv.fiiNet > 500) flowScore++;
  if (fv.fiiNet < -500) flowScore--;
  if (fv.diiNet > 500) flowScore += 0.5;
  if (fv.diiNet < -500) flowScore -= 0.5;
  if (fv.fiiVelocity > 300) flowScore += 0.5;
  if (fv.fiiVelocity < -300) flowScore -= 0.5;
  breakdown['Institutional'] = flowScore > 0 ? 'bullish' : flowScore < 0 ? 'bearish' : 'neutral';

  // 5. Sentiment / VIX
  let sentScore = 0;
  if (fv.sentimentScore > 60) sentScore++;
  if (fv.sentimentScore < 40) sentScore--;
  if (fv.indiaVix < 14) sentScore += 0.5;  // Calm = bullish
  if (fv.indiaVix > 22) sentScore -= 0.5;  // Fear = bearish
  breakdown['Sentiment'] = sentScore > 0 ? 'bullish' : sentScore < 0 ? 'bearish' : 'neutral';

  // 6. Options Data (PCR + Max Pain)
  let optScore = 0;
  if (fv.pcr > 1.2) optScore++;    // High PCR = bullish
  if (fv.pcr < 0.7) optScore--;    // Low PCR = bearish
  if (fv.maxPainDist < -0.3) optScore += 0.5;   // Below max pain = upward pull
  if (fv.maxPainDist > 0.3) optScore -= 0.5;    // Above max pain = downward pull
  breakdown['Options'] = optScore > 0 ? 'bullish' : optScore < 0 ? 'bearish' : 'neutral';

  // Count categories agreeing with predicted direction
  const targetSentiment = direction === 'up' ? 'bullish' : 'bearish';
  let confluenceScore = 0;
  for (const cat of Object.values(breakdown)) {
    if (cat === targetSentiment) confluenceScore++;
  }

  // Grade calculation
  const modelsAgree = gbdtDir === heurDir;
  let grade: TradeGrade;

  if (confluenceScore >= 4 && confidence >= 62 && modelsAgree) {
    grade = 'A';  // Strong edge
  } else if (confluenceScore >= 3 && confidence >= 58 && modelsAgree) {
    grade = 'B';  // Moderate edge
  } else if (confluenceScore >= 2 && confidence >= 55) {
    grade = 'C';  // Weak — no trade
  } else if (confluenceScore >= 1) {
    grade = 'D';  // Very weak — avoid
  } else {
    grade = 'F';  // No signals agree — strong avoid
  }

  const tradeable = grade === 'A' || grade === 'B';

  return { score: confluenceScore, breakdown, grade, tradeable };
}

// ─── Main Prediction Function ───────────────────────────────────────

// ─── Frozen Model Cache ─────────────────────────────────────────────

const frozenModelCache: Map<string, { model: GBDTModel; timestamp: number }> = new Map();
const FROZEN_MODEL_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function loadFrozenModel(symbol: string): Promise<GBDTModel | null> {
  // Check in-memory cache first
  const cached = frozenModelCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < FROZEN_MODEL_CACHE_TTL) {
    return cached.model;
  }

  try {
    const db = getServiceClient();
    const { data } = await db
      .from('frozen_models')
      .select('model_json')
      .eq('symbol', symbol)
      .order('trained_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.model_json) {
      const model = data.model_json as GBDTModel;
      frozenModelCache.set(symbol, { model, timestamp: Date.now() });
      console.log(`[MLEngine] Loaded frozen model for ${symbol}`);
      return model;
    }
  } catch (err) {
    console.warn(`[MLEngine] Failed to load frozen model for ${symbol}:`, err);
  }
  return null;
}

async function saveFrozenModel(symbol: string, model: GBDTModel): Promise<void> {
  try {
    const db = getServiceClient();
    await db.from('frozen_models').upsert({
      symbol,
      model_json: model as any,
      training_samples: model.trainingMetrics.totalSamples,
      training_accuracy: model.trainingMetrics.trainingAccuracy,
      validation_accuracy: model.trainingMetrics.validationAccuracy,
      model_version: 'v6-multitf-zscore',
      trained_at: new Date().toISOString(),
    }, { onConflict: 'symbol' });
    // Update in-memory cache
    frozenModelCache.set(symbol, { model, timestamp: Date.now() });
    console.log(`[MLEngine] Saved frozen model for ${symbol} (${model.trainingMetrics.totalSamples} samples, ${model.trainingMetrics.validationAccuracy.toFixed(1)}% val acc)`);
  } catch (err) {
    console.warn(`[MLEngine] Failed to save frozen model for ${symbol}:`, err);
  }
}

// ─── Z-Score Standardization Helpers ────────────────────────────────

interface FeatureScaler {
  means: number[];
  stds: number[];
  featureCount: number;
}

function fitScaler(X: number[][]): FeatureScaler {
  const n = X.length;
  const d = X[0].length;
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(0);

  for (let j = 0; j < d; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += X[i][j];
    means[j] = sum / n;

    let sqSum = 0;
    for (let i = 0; i < n; i++) sqSum += Math.pow(X[i][j] - means[j], 2);
    stds[j] = Math.sqrt(sqSum / n) || 1; // avoid division by zero
  }

  return { means, stds, featureCount: d };
}

function transformFeatures(X: number[][], scaler: FeatureScaler): number[][] {
  return X.map(row =>
    row.map((val, j) => (val - scaler.means[j]) / scaler.stds[j])
  );
}

function transformSingle(features: number[], scaler: FeatureScaler): number[] {
  return features.map((val, j) => (val - scaler.means[j]) / scaler.stds[j]);
}

// ─── Train and Save Model (called by cron job) ─────────────────────

export async function trainAndSaveModel(symbol: string): Promise<{
  success: boolean;
  samples?: number;
  valAccuracy?: number;
  error?: string;
}> {
  try {
    const history = await getHistoricalFeatures(symbol, 500);
    const fiiFlows = await getRecentFIIDIIFlows(30);
    const fiiFeatures = computeFIIDIIFeatures(fiiFlows);

    if (history.length < 30) {
      return { success: false, error: `Insufficient data: ${history.length} rows (need 30+)` };
    }

    // Build training data
    const X: number[][] = [];
    const Y: number[] = [];

    for (let i = 1; i < history.length - 1; i++) {
      const row = history[i];
      const prevRow = history[i - 1];
      const nextRow = history[i + 1];

      const matchingFlow = fiiFlows.find(f => f.date === row.date);
      if (matchingFlow) {
        row.fii_net = matchingFlow.fiiNet;
        row.dii_net = matchingFlow.diiNet;
      }

      // Pass history context for multi-timeframe features
      const histContext = history.slice(0, i);
      const fv = extractFeatures(row, prevRow, undefined, histContext);

      // Skip rows where >30% of features are zero/default (likely missing data)
      const nullCount = fv.features.filter(f => f === 0).length;
      if (nullCount / fv.features.length > 0.4) continue;

      // Use threshold-based labels: skip flat days (<0.3% move) — they're noise
      const returnPct = (nextRow.close - row.close) / row.close;
      if (Math.abs(returnPct) < 0.003) continue; // Skip noise

      X.push(fv.features);
      Y.push(returnPct > 0 ? 1 : 0);
    }

    const m = X.length;
    if (m < 15) {
      return { success: false, error: `Too few quality training samples: ${m} (after filtering noise)` };
    }

    // Phase 2: Z-score standardize features (fit on training data only)
    const scaler = fitScaler(X);
    const X_scaled = transformFeatures(X, scaler);

    const trainSize = Math.floor(m * 0.7);
    const X_train = X_scaled.slice(0, trainSize);
    const Y_train = Y.slice(0, trainSize);
    const X_val = X_scaled.slice(trainSize);
    const Y_val = Y.slice(trainSize);

    const gbdtModel = trainGBDT(X_train, Y_train, X_val, Y_val, {
      numTrees: m < 50 ? 30 : m < 100 ? 50 : 80,
      maxDepth: m < 50 ? 3 : 4,
      learningRate: 0.08,
      subsampleRatio: 0.8,
      minSamplesLeaf: Math.max(2, Math.floor(trainSize * 0.04)),
      l2Regularization: 1.0,
      earlyStoppingRounds: 8,
    });

    // Store scaler parameters with the model
    gbdtModel.featureScaler = scaler;

    await saveFrozenModel(symbol, gbdtModel);

    return {
      success: true,
      samples: m,
      valAccuracy: gbdtModel.trainingMetrics.validationAccuracy,
    };
  } catch (error: any) {
    console.error(`[MLEngine] trainAndSaveModel failed for ${symbol}:`, error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

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
    sp500Overnight?: number; dxyChange?: number; crudeChange?: number;
    giftNiftyGap?: number; maxPainDist?: number;
  }
): Promise<MLPrediction | null> {
  try {
    // 1. Fetch historical data from Supabase (expanded from 120 to 500 days)
    const history = await getHistoricalFeatures(symbol, 500);
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
        sp500Overnight: altData?.sp500Overnight || 0,
        dxyChange: altData?.dxyChange || 0,
        crudeChange: altData?.crudeChange || 0,
        giftNiftyGap: altData?.giftNiftyGap || 0,
        maxPainDist: altData?.maxPainDist || 0,
        features: [],
      };

      const heurResult = predictHeuristic(fv);
      const direction: 'up' | 'down' = heurResult.probability >= 0.5 ? 'up' : 'down';
      const confidence = Math.round((direction === 'up' ? heurResult.probability : 1 - heurResult.probability) * 100);

      // Compute confluence (heuristic-only: both models = heuristic)
      const confluence = computeConfluence(fv, direction, direction, direction, confidence);

      const supportingSignals = classifySignals(heurResult.signals, direction, 'supporting').slice(0, 5);
      const contradictingSignals = classifySignals(heurResult.signals, direction, 'contradicting').slice(0, 3);

      await savePrediction({
        symbol,
        predictedDirection: direction,
        probability: confidence,
        confidenceLevel: getConfidenceLevel(confidence),
        featuresJson: {
          heuristicSignals: heurResult.signals,
          subModels: { heuristic: { direction, probability: confidence } },
          tradeGrade: confluence.grade,
          confluenceScore: confluence.score,
          confluenceBreakdown: confluence.breakdown,
          tradeable: confluence.tradeable,
        },
        supportingSignals,
        contradictingSignals,
        modelVersion: 'v6-multitf-heuristic',
        predictedAt: new Date().toISOString(),
      });

      return {
        symbol,
        direction,
        confidence,
        confidenceLevel: getConfidenceLevel(confidence),
        tradeGrade: confluence.grade,
        confluenceScore: confluence.score,
        tradeable: confluence.tradeable,
        confluenceBreakdown: confluence.breakdown,
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
          modelVersion: 'v6-multitf-heuristic',
          bestIteration: 0,
          ensembleWeights,
        },
      };
    }

    // 4. Build training data from historical features (for heuristic context + fallback)
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

      // Pass history context for multi-timeframe features
      const histContext = history.slice(0, i);
      const fv = extractFeatures(row, prevRow, undefined, histContext);

      // Skip rows where >40% of features are zero/default (likely missing data from backfill)
      const nullCount = fv.features.filter(f => f === 0).length;
      if (nullCount / fv.features.length > 0.4) continue;

      // Threshold-based labels: skip flat days (<0.3% move) — they're noise the model can't learn from
      const returnPct = (nextRow.close - row.close) / row.close;
      if (Math.abs(returnPct) < 0.003) continue;

      featureVectors.push(fv);
      X.push(fv.features);
      Y.push(returnPct > 0 ? 1 : 0);
    }

    const m = X.length;
    if (m < 8) return null;

    // 5. Phase 2: Load frozen model — NO on-demand training
    let gbdtModel = await loadFrozenModel(symbol);
    let usedFrozenModel = false;
    let scaler: FeatureScaler | null = null;

    if (gbdtModel && gbdtModel.trees && gbdtModel.trees.length > 0) {
      console.log(`[MLEngine] Using frozen model for ${symbol} (${gbdtModel.trainingMetrics.totalSamples} samples)`);
      usedFrozenModel = true;
      scaler = gbdtModel.featureScaler || null;
    } else {
      // Phase 2: Instead of training on-demand, return a heuristic-only prediction
      console.warn(`[MLEngine] No frozen model for ${symbol} — using heuristic-only (cron hasn't trained yet)`);
    }

    // 6. Predict today → tomorrow
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

    // Pass full history context for multi-timeframe features
    const todayFV = extractFeatures(latestRow, prevLatestRow, mergedAltData, history.slice(0, -1));

    // Sub-model predictions
    let gbdtProb = 0.5; // default neutral if no frozen model
    if (usedFrozenModel && gbdtModel) {
      // Apply z-score standardization if scaler is available
      const scaledFeatures = scaler
        ? transformSingle(todayFV.features, scaler)
        : todayFV.features;
      gbdtProb = predictGBDT(gbdtModel, scaledFeatures);
    }
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
    // Phase 2: Extra discount if no frozen model (heuristic-only mode)
    if (!usedFrozenModel) confidenceDiscount += 12;

    const confidence = Math.max(50, Math.min(95, rawConfidence - confidenceDiscount));

    // 9. Signal confluence and trade grading
    const confluence = computeConfluence(todayFV, direction, gbdtDir, heurDir, confidence);

    // 10. Generate human-readable signals
    const supportingSignals = classifySignals(heurResult.signals, direction, 'supporting').slice(0, 5);
    const contradictingSignals = classifySignals(heurResult.signals, direction, 'contradicting').slice(0, 3);

    // 11. Feature importance from GBDT
    const featureImportance: Record<string, number> = {};
    for (let j = 0; j < gbdtModel.featureImportance.length && j < FEATURE_NAMES.length; j++) {
      featureImportance[FEATURE_NAMES[j]] = gbdtModel.featureImportance[j];
    }

    const prediction: MLPrediction = {
      symbol,
      direction,
      confidence,
      confidenceLevel: getConfidenceLevel(confidence),
      tradeGrade: confluence.grade,
      confluenceScore: confluence.score,
      tradeable: confluence.tradeable,
      confluenceBreakdown: confluence.breakdown,
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
        modelVersion: usedFrozenModel ? 'v6-multitf-frozen' : 'v6-multitf-heuristic',
        bestIteration: gbdtModel.trainingMetrics.bestIteration,
        ensembleWeights,
      },
    };

    // 12. Save prediction to Supabase
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
        tradeGrade: confluence.grade,
        confluenceScore: confluence.score,
        confluenceBreakdown: confluence.breakdown,
        tradeable: confluence.tradeable,
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
