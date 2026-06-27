// Market Regime Detection — Bull / Bear / Sideways classifier
// Uses breadth, momentum, and volatility indicators to classify the current market environment.
// This regime context adjusts ML model aggressiveness and risk parameters.

import { fetchIndiaVIX } from './nseData';
import { getRecentFIIDIIFlows, computeFIIDIIFeatures } from './fiiDiiData';
import { getServiceClient } from './supabase';

export type MarketRegime = 'strong_bull' | 'bull' | 'sideways' | 'bear' | 'strong_bear';

export interface RegimeAnalysis {
  regime: MarketRegime;
  confidence: number;          // 0-100
  label: string;               // Human-readable
  emoji: string;
  color: string;               // CSS color for UI
  description: string;
  components: {
    trendScore: number;        // -100 to +100
    momentumScore: number;     // -100 to +100
    volatilityScore: number;   // -100 to +100
    breadthScore: number;      // -100 to +100
    flowScore: number;         // -100 to +100
  };
  adjustments: {
    confidenceMultiplier: number;   // 0.5 to 1.5 — applied to ML prediction confidence
    riskMultiplier: number;         // 0.5 to 2.0 — adjusts stop-loss distance
    positionSizeMultiplier: number; // 0.5 to 1.5 — adjusts position sizing
  };
  signals: string[];
}

// ─── Regime Classification ──────────────────────────────────────────

export async function detectMarketRegime(): Promise<RegimeAnalysis> {
  const signals: string[] = [];

  // 1. Fetch market data
  const [vixData, fiiFlows, niftyFeatures] = await Promise.all([
    fetchIndiaVIX().catch(() => null),
    getRecentFIIDIIFlows(20).catch(() => []),
    fetchNiftyBreadth().catch(() => null),
  ]);

  const fiiFeatures = computeFIIDIIFeatures(fiiFlows);

  // ─── Component Scores ───────────────────────────────────────────
  
  // A. Trend Score — based on Nifty's position relative to moving averages
  let trendScore = 0;
  if (niftyFeatures) {
    if (niftyFeatures.aboveEma20) { trendScore += 25; signals.push('Nifty above 20-day EMA'); }
    else { trendScore -= 25; signals.push('Nifty below 20-day EMA'); }
    
    if (niftyFeatures.aboveEma50) { trendScore += 25; signals.push('Nifty above 50-day EMA'); }
    else { trendScore -= 25; signals.push('Nifty below 50-day EMA'); }
    
    // Recent momentum
    if (niftyFeatures.return5d > 2) { trendScore += 20; signals.push(`Nifty up ${niftyFeatures.return5d.toFixed(1)}% in 5 days`); }
    else if (niftyFeatures.return5d < -2) { trendScore -= 20; signals.push(`Nifty down ${Math.abs(niftyFeatures.return5d).toFixed(1)}% in 5 days`); }
    
    if (niftyFeatures.return20d > 5) { trendScore += 15; }
    else if (niftyFeatures.return20d < -5) { trendScore -= 15; }
  }
  trendScore = clamp(trendScore, -100, 100);

  // B. Momentum Score — RSI-based
  let momentumScore = 0;
  if (niftyFeatures) {
    const rsi = niftyFeatures.rsi;
    if (rsi > 65) { momentumScore = 50 + (rsi - 65); signals.push(`Nifty RSI bullish at ${rsi.toFixed(0)}`); }
    else if (rsi > 55) { momentumScore = 25; }
    else if (rsi < 35) { momentumScore = -50 - (35 - rsi); signals.push(`Nifty RSI bearish at ${rsi.toFixed(0)}`); }
    else if (rsi < 45) { momentumScore = -25; }
  }
  momentumScore = clamp(momentumScore, -100, 100);

  // C. Volatility Score — VIX-based (inverted: low VIX = bullish)
  let volatilityScore = 0;
  if (vixData) {
    const vix = vixData.value;
    if (vix < 12) { volatilityScore = 60; signals.push(`VIX very low at ${vix.toFixed(1)} — complacent market`); }
    else if (vix < 15) { volatilityScore = 30; signals.push(`VIX low at ${vix.toFixed(1)} — calm market`); }
    else if (vix > 25) { volatilityScore = -60; signals.push(`VIX elevated at ${vix.toFixed(1)} — fear in market`); }
    else if (vix > 20) { volatilityScore = -30; signals.push(`VIX above normal at ${vix.toFixed(1)}`); }
  }
  volatilityScore = clamp(volatilityScore, -100, 100);

  // D. Breadth Score — based on % of key stocks above their own EMAs
  let breadthScore = 0;
  if (niftyFeatures && niftyFeatures.breadthPct != null) {
    const pct = niftyFeatures.breadthPct;
    if (pct > 70) { breadthScore = 60; signals.push(`${pct}% of stocks above EMA — broad rally`); }
    else if (pct > 55) { breadthScore = 25; }
    else if (pct < 30) { breadthScore = -60; signals.push(`Only ${pct}% of stocks above EMA — broad weakness`); }
    else if (pct < 45) { breadthScore = -25; }
  }
  breadthScore = clamp(breadthScore, -100, 100);

  // E. Flow Score — FII/DII net buying/selling trend
  let flowScore = 0;
  if (fiiFeatures.fiiNet5DAvg > 500) { flowScore += 30; signals.push('FII net buyers (5-day avg)'); }
  else if (fiiFeatures.fiiNet5DAvg < -500) { flowScore -= 30; signals.push('FII net sellers (5-day avg)'); }

  if (fiiFeatures.diiNet5DAvg > 500) { flowScore += 15; }
  else if (fiiFeatures.diiNet5DAvg < -500) { flowScore -= 15; }

  // FII trend reversal is a strong signal
  if (fiiFeatures.fiiTrend === 'buying' && fiiFeatures.fiiNet5DAvg > 1000) {
    flowScore += 25; signals.push('Strong FII buying trend reversal');
  } else if (fiiFeatures.fiiTrend === 'selling' && fiiFeatures.fiiNet5DAvg < -1000) {
    flowScore -= 25; signals.push('Sustained FII selling pressure');
  }
  flowScore = clamp(flowScore, -100, 100);

  // ─── Composite Score ────────────────────────────────────────────
  const weights = { trend: 0.30, momentum: 0.20, volatility: 0.15, breadth: 0.20, flow: 0.15 };
  const composite = 
    trendScore * weights.trend +
    momentumScore * weights.momentum +
    volatilityScore * weights.volatility +
    breadthScore * weights.breadth +
    flowScore * weights.flow;

  // ─── Classify Regime ────────────────────────────────────────────
  let regime: MarketRegime;
  let label: string;
  let emoji: string;
  let color: string;
  let description: string;

  if (composite > 50) {
    regime = 'strong_bull';
    label = 'Strong Bull Market';
    emoji = '🚀';
    color = '#00d68f';
    description = 'Broad-based rally with strong momentum, low volatility, and institutional buying. High probability of upward continuation.';
  } else if (composite > 20) {
    regime = 'bull';
    label = 'Bull Market';
    emoji = '📈';
    color = '#4ade80';
    description = 'Market trending higher with positive breadth. Favor long positions with moderate conviction.';
  } else if (composite > -20) {
    regime = 'sideways';
    label = 'Sideways / Choppy';
    emoji = '↔️';
    color = '#fbbf24';
    description = 'Range-bound market with mixed signals. Reduce position sizes and avoid directional bets.';
  } else if (composite > -50) {
    regime = 'bear';
    label = 'Bear Market';
    emoji = '📉';
    color = '#f87171';
    description = 'Declining trend with deteriorating breadth. Institutional selling. Protect capital.';
  } else {
    regime = 'strong_bear';
    label = 'Strong Bear Market';
    emoji = '🔻';
    color = '#ef4444';
    description = 'Sustained selling across sectors with high volatility. Extreme caution advised.';
  }

  // ─── Model Adjustments ──────────────────────────────────────────
  const adjustments = getRegimeAdjustments(regime);

  const confidence = Math.min(95, Math.max(30, Math.abs(composite) + 30));

  return {
    regime,
    confidence: Math.round(confidence),
    label,
    emoji,
    color,
    description,
    components: {
      trendScore: Math.round(trendScore),
      momentumScore: Math.round(momentumScore),
      volatilityScore: Math.round(volatilityScore),
      breadthScore: Math.round(breadthScore),
      flowScore: Math.round(flowScore),
    },
    adjustments,
    signals,
  };
}

function getRegimeAdjustments(regime: MarketRegime) {
  switch (regime) {
    case 'strong_bull':
      return { confidenceMultiplier: 1.15, riskMultiplier: 0.8, positionSizeMultiplier: 1.3 };
    case 'bull':
      return { confidenceMultiplier: 1.05, riskMultiplier: 0.9, positionSizeMultiplier: 1.1 };
    case 'sideways':
      return { confidenceMultiplier: 0.85, riskMultiplier: 1.2, positionSizeMultiplier: 0.7 };
    case 'bear':
      return { confidenceMultiplier: 0.9, riskMultiplier: 1.5, positionSizeMultiplier: 0.6 };
    case 'strong_bear':
      return { confidenceMultiplier: 0.75, riskMultiplier: 2.0, positionSizeMultiplier: 0.4 };
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

// ─── Nifty Breadth Data (from daily_features in Supabase) ───────────

interface NiftyBreadth {
  aboveEma20: boolean;
  aboveEma50: boolean;
  return5d: number;
  return20d: number;
  rsi: number;
  breadthPct: number; // % of key stocks above their EMA20
}

async function fetchNiftyBreadth(): Promise<NiftyBreadth | null> {
  try {
    const db = getServiceClient();
    
    // Get latest daily features for key stocks
    const today = new Date().toISOString().split('T')[0];
    const fiveDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const { data: features } = await db
      .from('daily_features')
      .select('symbol, close, ema20, ema50, rsi, date, nifty_close')
      .gte('date', fiveDaysAgo)
      .order('date', { ascending: false });

    if (!features || features.length === 0) {
      return getDefaultBreadth();
    }

    // Get most recent date
    const latestDate = features[0].date;
    const latestFeatures = features.filter(f => f.date === latestDate);

    if (latestFeatures.length === 0) return getDefaultBreadth();

    // Compute breadth: % of stocks above their EMA20
    let aboveEma20Count = 0;
    for (const f of latestFeatures) {
      if (f.close > f.ema20) aboveEma20Count++;
    }
    const breadthPct = Math.round((aboveEma20Count / latestFeatures.length) * 100);

    // Nifty data from any feature row
    const niftyClose = latestFeatures[0].nifty_close || 0;
    const niftyEma20 = latestFeatures[0].ema20 || niftyClose; // Approximation

    // Compute returns (using average close as Nifty proxy)
    const avgClose = latestFeatures.reduce((s, f) => s + (f.close || 0), 0) / latestFeatures.length;
    
    // Find 5-day-ago features for return calc
    const olderFeatures = features.filter(f => f.date <= fiveDaysAgo);
    const avgOldClose = olderFeatures.length > 0
      ? olderFeatures.reduce((s, f) => s + (f.close || 0), 0) / olderFeatures.length
      : avgClose;

    const return5d = avgOldClose > 0 ? ((avgClose - avgOldClose) / avgOldClose) * 100 : 0;

    // RSI from a representative large-cap
    const reliance = latestFeatures.find(f => f.symbol === 'RELIANCE');
    const avgRsi = latestFeatures.reduce((s, f) => s + (f.rsi || 50), 0) / latestFeatures.length;

    return {
      aboveEma20: avgClose > niftyEma20,
      aboveEma50: true, // Simplified — would need 50-day data
      return5d,
      return20d: return5d * 2.5, // Rough extrapolation
      rsi: avgRsi,
      breadthPct,
    };
  } catch (err) {
    console.warn('[Regime] Failed to fetch Nifty breadth:', err);
    return getDefaultBreadth();
  }
}

function getDefaultBreadth(): NiftyBreadth {
  return {
    aboveEma20: true,
    aboveEma50: true,
    return5d: 0,
    return20d: 0,
    rsi: 50,
    breadthPct: 50,
  };
}
