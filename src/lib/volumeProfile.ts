// Volume Profile Analysis — POC, Value Area High/Low
// Computes volume-at-price distribution from OHLCV data to identify
// real support/resistance zones (institutional footprint).
// No external API needed — works entirely from historical candle data.

import { OHLCV } from './technicalAnalysis';

export interface VolumeProfileResult {
  poc: number;               // Point of Control — price with highest volume
  vah: number;               // Value Area High — upper 70% volume boundary
  val: number;               // Value Area Low — lower 70% volume boundary
  pocVolume: number;          // Volume at POC
  totalVolume: number;        // Total volume across all levels
  positionVsPOC: 'above' | 'below' | 'at_poc';  // Current price vs POC
  pocDistancePct: number;     // % distance from current price to POC
  valueAreaWidth: number;     // VAH - VAL as % of POC
  distribution: VolumeLevel[];  // Full distribution for visualization
}

export interface VolumeLevel {
  priceLevel: number;
  volume: number;
  percentage: number;         // % of total volume
}

// ─── Compute Volume Profile ─────────────────────────────────────────

export function computeVolumeProfile(
  candles: OHLCV[],
  currentPrice: number,
  buckets: number = 30
): VolumeProfileResult | null {
  if (candles.length < 10) return null;

  // Find price range
  let priceMin = Infinity;
  let priceMax = -Infinity;
  let totalVolume = 0;

  for (const c of candles) {
    priceMin = Math.min(priceMin, c.low);
    priceMax = Math.max(priceMax, c.high);
    totalVolume += c.volume;
  }

  if (priceMax <= priceMin || totalVolume === 0) return null;

  const bucketSize = (priceMax - priceMin) / buckets;
  const volumeAtPrice = new Array(buckets).fill(0);

  // Distribute each candle's volume across the price buckets it spans
  for (const candle of candles) {
    const candleRange = candle.high - candle.low;
    if (candleRange <= 0) {
      // Single-tick candle — all volume goes to one bucket
      const bucket = Math.min(buckets - 1, Math.floor((candle.close - priceMin) / bucketSize));
      volumeAtPrice[bucket] += candle.volume;
      continue;
    }

    // Distribute volume proportionally across touched buckets
    const lowBucket = Math.max(0, Math.floor((candle.low - priceMin) / bucketSize));
    const highBucket = Math.min(buckets - 1, Math.floor((candle.high - priceMin) / bucketSize));

    const bucketsSpanned = highBucket - lowBucket + 1;
    const volumePerBucket = candle.volume / bucketsSpanned;

    for (let b = lowBucket; b <= highBucket; b++) {
      volumeAtPrice[b] += volumePerBucket;
    }
  }

  // Find POC — bucket with highest volume
  let pocBucket = 0;
  let pocVolume = 0;
  for (let b = 0; b < buckets; b++) {
    if (volumeAtPrice[b] > pocVolume) {
      pocVolume = volumeAtPrice[b];
      pocBucket = b;
    }
  }

  const poc = priceMin + (pocBucket + 0.5) * bucketSize;

  // Compute Value Area (70% of total volume centered around POC)
  const valueAreaTarget = totalVolume * 0.70;
  let valueAreaVolume = volumeAtPrice[pocBucket];
  let vaLowBucket = pocBucket;
  let vaHighBucket = pocBucket;

  while (valueAreaVolume < valueAreaTarget && (vaLowBucket > 0 || vaHighBucket < buckets - 1)) {
    const expandLow = vaLowBucket > 0 ? volumeAtPrice[vaLowBucket - 1] : 0;
    const expandHigh = vaHighBucket < buckets - 1 ? volumeAtPrice[vaHighBucket + 1] : 0;

    if (expandLow >= expandHigh && vaLowBucket > 0) {
      vaLowBucket--;
      valueAreaVolume += volumeAtPrice[vaLowBucket];
    } else if (vaHighBucket < buckets - 1) {
      vaHighBucket++;
      valueAreaVolume += volumeAtPrice[vaHighBucket];
    } else if (vaLowBucket > 0) {
      vaLowBucket--;
      valueAreaVolume += volumeAtPrice[vaLowBucket];
    } else {
      break;
    }
  }

  const val = priceMin + vaLowBucket * bucketSize;
  const vah = priceMin + (vaHighBucket + 1) * bucketSize;

  // Position vs POC
  const pocDistancePct = poc > 0 ? ((currentPrice - poc) / poc) * 100 : 0;
  let positionVsPOC: 'above' | 'below' | 'at_poc' = 'at_poc';
  if (pocDistancePct > 0.5) positionVsPOC = 'above';
  else if (pocDistancePct < -0.5) positionVsPOC = 'below';

  // Value Area Width
  const valueAreaWidth = poc > 0 ? ((vah - val) / poc) * 100 : 0;

  // Build distribution for visualization
  const distribution: VolumeLevel[] = [];
  for (let b = 0; b < buckets; b++) {
    distribution.push({
      priceLevel: parseFloat((priceMin + (b + 0.5) * bucketSize).toFixed(2)),
      volume: Math.round(volumeAtPrice[b]),
      percentage: totalVolume > 0 ? parseFloat(((volumeAtPrice[b] / totalVolume) * 100).toFixed(1)) : 0,
    });
  }

  return {
    poc: parseFloat(poc.toFixed(2)),
    vah: parseFloat(vah.toFixed(2)),
    val: parseFloat(val.toFixed(2)),
    pocVolume: Math.round(pocVolume),
    totalVolume: Math.round(totalVolume),
    positionVsPOC,
    pocDistancePct: parseFloat(pocDistancePct.toFixed(2)),
    valueAreaWidth: parseFloat(valueAreaWidth.toFixed(2)),
    distribution,
  };
}
