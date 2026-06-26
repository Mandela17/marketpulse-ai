// Risk Engine — Computes target prices, stop-loss levels, and risk/reward ratios
// Based on ATR (Average True Range), Bollinger Bands, and support/resistance levels.

export interface RiskReward {
  targetPrice: number;
  targetPct: string;           // "+2.3%"
  stopLoss: number;
  stopLossPct: string;         // "-1.5%"
  riskRewardRatio: number;     // e.g. 1.53
  riskLevel: 'low' | 'moderate' | 'high';
  positionSizeHint: string;    // "Conservative (2-3% of capital)"
}

export function computeRiskReward(
  currentPrice: number,
  direction: 'up' | 'down',
  confidence: number,
  context: {
    bollingerUpper: number;
    bollingerLower: number;
    atr: number;  // Average True Range (can be simplified as day high - day low)
    ema20: number;
  }
): RiskReward {
  const { bollingerUpper, bollingerLower, atr, ema20 } = context;

  // Fallback ATR if not provided
  const effectiveATR = atr > 0 ? atr : currentPrice * 0.015; // ~1.5% default

  if (direction === 'up') {
    // Target: 1.5-2x ATR above current price, capped at Bollinger Upper
    const rawTarget = currentPrice + effectiveATR * 1.5;
    const targetPrice = Math.min(rawTarget, bollingerUpper * 1.01); // Don't target beyond upper band + 1%

    // Stop-loss: 1x ATR below, or below Bollinger Lower, whichever is tighter
    const rawStopLoss = currentPrice - effectiveATR;
    const stopLoss = Math.max(rawStopLoss, bollingerLower * 0.99); // Don't stop below lower band - 1%

    const targetPctVal = ((targetPrice - currentPrice) / currentPrice) * 100;
    const stopLossPctVal = ((stopLoss - currentPrice) / currentPrice) * 100;
    const riskRewardRatio = Math.abs(targetPctVal) / Math.abs(stopLossPctVal || 0.1);

    return {
      targetPrice: parseFloat(targetPrice.toFixed(2)),
      targetPct: `+${targetPctVal.toFixed(1)}%`,
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      stopLossPct: `${stopLossPctVal.toFixed(1)}%`,
      riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
      riskLevel: getRiskLevel(riskRewardRatio, confidence),
      positionSizeHint: getPositionSizeHint(confidence, riskRewardRatio),
    };
  } else {
    // Bearish prediction — targets are inverted
    const rawTarget = currentPrice - effectiveATR * 1.5;
    const targetPrice = Math.max(rawTarget, bollingerLower * 0.99);

    const rawStopLoss = currentPrice + effectiveATR;
    const stopLoss = Math.min(rawStopLoss, bollingerUpper * 1.01);

    const targetPctVal = ((targetPrice - currentPrice) / currentPrice) * 100;
    const stopLossPctVal = ((stopLoss - currentPrice) / currentPrice) * 100;
    const riskRewardRatio = Math.abs(targetPctVal) / Math.abs(stopLossPctVal || 0.1);

    return {
      targetPrice: parseFloat(targetPrice.toFixed(2)),
      targetPct: `${targetPctVal.toFixed(1)}%`,
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      stopLossPct: `+${stopLossPctVal.toFixed(1)}%`,
      riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
      riskLevel: getRiskLevel(riskRewardRatio, confidence),
      positionSizeHint: getPositionSizeHint(confidence, riskRewardRatio),
    };
  }
}

function getRiskLevel(rrRatio: number, confidence: number): 'low' | 'moderate' | 'high' {
  if (rrRatio >= 1.5 && confidence >= 70) return 'low';
  if (rrRatio >= 1.0 && confidence >= 60) return 'moderate';
  return 'high';
}

function getPositionSizeHint(confidence: number, rrRatio: number): string {
  if (confidence >= 75 && rrRatio >= 1.5) return 'Standard (3-5% of capital)';
  if (confidence >= 65 && rrRatio >= 1.2) return 'Conservative (2-3% of capital)';
  if (confidence >= 60) return 'Small (1-2% of capital)';
  return 'Minimal (0.5-1% of capital) — low confidence';
}
