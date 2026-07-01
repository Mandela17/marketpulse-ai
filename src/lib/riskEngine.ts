// Advanced Risk Engine v3 — Kelly Criterion + VIX-Aware Adaptive Stops
// Computes entry, two targets, stop-loss, invalidation, and position sizing.
// Adjusts dynamically based on India VIX, model confidence, and historical win rate.

import { getServiceClient } from './supabase';

export interface RiskReward {
  entry: number;
  target1: number;
  target1Pct: string;           // "+1.2%" — conservative target
  target2: number;
  target2Pct: string;           // "+2.5%" — aggressive target
  stopLoss: number;
  stopLossPct: string;          // "-1.5%"
  invalidation: number;
  invalidationPct: string;      // Price where thesis breaks
  riskRewardRatio: number;      // Based on target2 vs stopLoss
  kellyFraction: number;        // Raw Kelly %
  positionSizePct: number;      // Quarter-Kelly, clamped (0.5% to 5%)
  positionSizeHint: string;     // "Conservative (2-3% of capital)"
  riskLevel: 'low' | 'moderate' | 'high';
  vixAdjusted: boolean;         // Whether VIX widened the stop-loss
}

// ─── Fetch Rolling Win Rate from Supabase ───────────────────────────

async function getRollingWinRate(symbol?: string): Promise<{
  winRate: number; avgWinPct: number; avgLossPct: number; totalResolved: number;
}> {
  try {
    const db = getServiceClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let query = db.from('predictions')
      .select('is_correct, actual_return')
      .not('resolved_at', 'is', null)
      .gte('resolved_at', thirtyDaysAgo);

    if (symbol) {
      query = query.eq('symbol', symbol);
    }

    const { data } = await query;

    if (!data || data.length < 5) {
      // Not enough data — return conservative defaults
      return { winRate: 0.55, avgWinPct: 1.5, avgLossPct: 1.2, totalResolved: 0 };
    }

    const wins = data.filter(d => d.is_correct);
    const losses = data.filter(d => !d.is_correct);
    const winRate = wins.length / data.length;

    const avgWinPct = wins.length > 0
      ? wins.reduce((s, d) => s + Math.abs(d.actual_return || 0), 0) / wins.length
      : 1.5;

    const avgLossPct = losses.length > 0
      ? losses.reduce((s, d) => s + Math.abs(d.actual_return || 0), 0) / losses.length
      : 1.2;

    return {
      winRate: parseFloat(winRate.toFixed(3)),
      avgWinPct: parseFloat(avgWinPct.toFixed(2)),
      avgLossPct: parseFloat(avgLossPct.toFixed(2)),
      totalResolved: data.length,
    };
  } catch {
    return { winRate: 0.55, avgWinPct: 1.5, avgLossPct: 1.2, totalResolved: 0 };
  }
}

// ─── Kelly Criterion ────────────────────────────────────────────────

function computeKellyFraction(winRate: number, avgWinPct: number, avgLossPct: number): number {
  // Kelly = (W × avgWin - (1-W) × avgLoss) / avgWin
  // where W = win rate
  if (avgWinPct <= 0) return 0;

  const kelly = (winRate * avgWinPct - (1 - winRate) * avgLossPct) / avgWinPct;

  // Quarter-Kelly for safety (industry standard)
  return Math.max(0, kelly * 0.25);
}

// ─── VIX-Aware Stop-Loss Multiplier ─────────────────────────────────

function getVixStopMultiplier(vix: number): { multiplier: number; vixAdjusted: boolean } {
  if (vix <= 12) return { multiplier: 0.8, vixAdjusted: false };   // Very calm — tight stops
  if (vix <= 15) return { multiplier: 1.0, vixAdjusted: false };   // Normal
  if (vix <= 18) return { multiplier: 1.2, vixAdjusted: true };    // Slightly elevated
  if (vix <= 22) return { multiplier: 1.5, vixAdjusted: true };    // High fear
  if (vix <= 28) return { multiplier: 1.8, vixAdjusted: true };    // Very high fear
  return { multiplier: 2.2, vixAdjusted: true };                    // Panic
}

// ─── Main Risk/Reward Computation ───────────────────────────────────

export async function computeRiskReward(
  currentPrice: number,
  direction: 'up' | 'down',
  confidence: number,
  context: {
    bollingerUpper: number;
    bollingerLower: number;
    atr: number;
    ema20: number;
    indiaVix?: number;
  },
  symbol?: string
): Promise<RiskReward> {
  const { bollingerUpper, bollingerLower, atr, ema20 } = context;
  const vix = context.indiaVix || 14;

  // Fetch rolling win rate for Kelly Criterion
  const winStats = await getRollingWinRate(symbol);

  // VIX-aware stop multiplier
  const { multiplier: vixMultiplier, vixAdjusted } = getVixStopMultiplier(vix);

  // Effective ATR
  const effectiveATR = atr > 0 ? atr : currentPrice * 0.015;

  // Kelly fraction
  const kellyFraction = computeKellyFraction(winStats.winRate, winStats.avgWinPct, winStats.avgLossPct);

  // Position size: Kelly adjusted by confidence
  const confidenceMultiplier = Math.max(0.3, (confidence - 50) / 50); // 0.3 at 50% conf, 1.0 at 100%
  let positionSizePct = kellyFraction * 100 * confidenceMultiplier;

  // Clamp position size: 0.5% to 5%
  positionSizePct = Math.max(0.5, Math.min(5.0, positionSizePct));

  // VIX > 25 caps confidence and reduces position
  if (vix > 25) {
    positionSizePct = Math.min(positionSizePct, 2.0);
  }

  if (direction === 'up') {
    // ─── Bullish ───
    // Target 1: 1x ATR (conservative — take 50% profit)
    const target1 = currentPrice + effectiveATR;
    // Target 2: 2x ATR (aggressive — trailing stop on remainder)
    const rawTarget2 = currentPrice + effectiveATR * 2;
    const target2 = Math.min(rawTarget2, bollingerUpper * 1.02);

    // Stop-loss: 1x ATR below, widened by VIX
    const rawStopLoss = currentPrice - effectiveATR * vixMultiplier;
    const stopLoss = Math.max(rawStopLoss, bollingerLower * 0.98);

    // Invalidation: below Bollinger Lower — thesis broken
    const invalidation = bollingerLower * 0.97;

    return formatResult(currentPrice, target1, target2, stopLoss, invalidation,
      kellyFraction, positionSizePct, confidence, vixAdjusted);
  } else {
    // ─── Bearish ───
    const target1 = currentPrice - effectiveATR;
    const rawTarget2 = currentPrice - effectiveATR * 2;
    const target2 = Math.max(rawTarget2, bollingerLower * 0.98);

    const rawStopLoss = currentPrice + effectiveATR * vixMultiplier;
    const stopLoss = Math.min(rawStopLoss, bollingerUpper * 1.02);

    const invalidation = bollingerUpper * 1.03;

    return formatResult(currentPrice, target1, target2, stopLoss, invalidation,
      kellyFraction, positionSizePct, confidence, vixAdjusted);
  }
}

// ─── Format Result ──────────────────────────────────────────────────

function formatResult(
  entry: number, target1: number, target2: number,
  stopLoss: number, invalidation: number,
  kellyFraction: number, positionSizePct: number,
  confidence: number, vixAdjusted: boolean
): RiskReward {
  const pct = (from: number, to: number) => ((to - from) / from) * 100;

  const t1Pct = pct(entry, target1);
  const t2Pct = pct(entry, target2);
  const slPct = pct(entry, stopLoss);
  const invPct = pct(entry, invalidation);
  const rrRatio = Math.abs(t2Pct) / Math.abs(slPct || 0.1);

  return {
    entry: parseFloat(entry.toFixed(2)),
    target1: parseFloat(target1.toFixed(2)),
    target1Pct: `${t1Pct >= 0 ? '+' : ''}${t1Pct.toFixed(1)}%`,
    target2: parseFloat(target2.toFixed(2)),
    target2Pct: `${t2Pct >= 0 ? '+' : ''}${t2Pct.toFixed(1)}%`,
    stopLoss: parseFloat(stopLoss.toFixed(2)),
    stopLossPct: `${slPct >= 0 ? '+' : ''}${slPct.toFixed(1)}%`,
    invalidation: parseFloat(invalidation.toFixed(2)),
    invalidationPct: `${invPct >= 0 ? '+' : ''}${invPct.toFixed(1)}%`,
    riskRewardRatio: parseFloat(rrRatio.toFixed(2)),
    kellyFraction: parseFloat(kellyFraction.toFixed(4)),
    positionSizePct: parseFloat(positionSizePct.toFixed(1)),
    positionSizeHint: getPositionSizeHint(positionSizePct, confidence),
    riskLevel: getRiskLevel(rrRatio, confidence),
    vixAdjusted,
  };
}

function getRiskLevel(rrRatio: number, confidence: number): 'low' | 'moderate' | 'high' {
  if (rrRatio >= 1.5 && confidence >= 70) return 'low';
  if (rrRatio >= 1.0 && confidence >= 60) return 'moderate';
  return 'high';
}

function getPositionSizeHint(sizePct: number, confidence: number): string {
  if (sizePct >= 4.0 && confidence >= 75) return 'Aggressive (4-5% of capital)';
  if (sizePct >= 3.0 && confidence >= 70) return 'Standard (3-4% of capital)';
  if (sizePct >= 2.0 && confidence >= 65) return 'Conservative (2-3% of capital)';
  if (sizePct >= 1.0) return 'Small (1-2% of capital)';
  return 'Minimal (0.5-1% of capital) — low conviction';
}
