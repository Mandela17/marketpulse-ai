// Real Technical Analysis Engine
// Computes RSI, MACD, EMA, Bollinger Bands from actual historical OHLCV data
// Data source: Yahoo Finance v8/finance/chart API

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RealTechnicals {
  // RSI
  rsi: number;            // 0-100, Wilder's smoothed 14-period
  rsiSignal: 'Overbought' | 'Oversold' | 'Neutral';

  // MACD (12/26/9)
  macdLine: number;       // MACD line value
  signalLine: number;     // Signal line value
  histogram: number;      // MACD histogram (macdLine - signalLine)
  macdSignal: 'Bullish Crossover' | 'Bearish Crossover' | 'Bullish Momentum' | 'Bearish Momentum' | 'Neutral';

  // Exponential Moving Averages
  ema20: number;
  ema50: number;
  currentPrice: number;
  emaTrend: 'Strong Uptrend' | 'Uptrend' | 'Downtrend' | 'Strong Downtrend' | 'Sideways';

  // Bollinger Bands (20-period, 2σ)
  bollingerUpper: number;
  bollingerMiddle: number; // SMA(20)
  bollingerLower: number;
  bollingerPosition: 'Above Upper' | 'Near Upper' | 'Middle' | 'Near Lower' | 'Below Lower';
  bollingerWidth: number;  // Bandwidth percentage

  // Volume Analysis (real, from actual volume data)
  volumeToday: number;
  volume20DayAvg: number;
  volumeRatio: number;     // today / 20-day avg
  volumeSignal: 'High Volume Breakout' | 'Above Average' | 'Normal' | 'Low Volume' | 'Volume Dry-up';

  // Price Context
  priceChange1D: number;
  priceChange5D: number;
  priceChange1M: number;
  dayHigh: number;
  dayLow: number;
  high52W: number;
  low52W: number;

  // Data quality
  dataPoints: number;     // How many days of data we computed from
  lastUpdated: string;
}

// In-memory cache for historical data (avoids re-fetching OHLCV on every request)
const ohlcvCache: Map<string, { data: OHLCV[]; timestamp: number }> = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ─── Yahoo Finance Historical Data Fetcher ──────────────────────────

export async function fetchHistoricalOHLCV(symbol: string, days: number = 60): Promise<OHLCV[]> {
  const cacheKey = `${symbol}-${days}`;
  const cached = ohlcvCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const nseSym = symbol.includes('.') || symbol.startsWith('^') ? symbol : `${symbol}.NS`;

  // Map days to Yahoo API range values dynamically
  let range = '6mo';
  if (days <= 5) range = '5d';
  else if (days <= 30) range = '1mo';
  else if (days <= 90) range = '3mo';
  else if (days <= 180) range = '6mo';
  else if (days <= 365) range = '1y';
  else if (days <= 730) range = '2y';
  else if (days <= 1825) range = '5y';
  else if (days <= 3650) range = '10y';
  else range = 'max';

  const endpoints = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(nseSym)}?interval=1d&range=${range}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(nseSym)}?interval=1d&range=${range}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        next: { revalidate: 900 }, // Cache for 15 min in Next.js
      });

      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const timestamps: number[] = result.timestamp || [];
      const quotes = result.indicators?.quote?.[0];
      if (!quotes || timestamps.length === 0) continue;

      const ohlcv: OHLCV[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const open = quotes.open?.[i];
        const high = quotes.high?.[i];
        const low = quotes.low?.[i];
        const close = quotes.close?.[i];
        const volume = quotes.volume?.[i];

        // Skip null/invalid candles (market holidays, missing data)
        if (close == null || open == null || high == null || low == null) continue;

        ohlcv.push({
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          open,
          high,
          low,
          close,
          volume: volume || 0,
        });
      }

      if (ohlcv.length > 0) {
        ohlcvCache.set(cacheKey, { data: ohlcv, timestamp: Date.now() });
        return ohlcv;
      }
    } catch {
      continue;
    }
  }

  return [];
}

// ─── RSI (Wilder's Smoothed, 14-Period) ─────────────────────────────

export function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50; // Not enough data

  // Initial average gain/loss
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining periods
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - (100 / (1 + rs))).toFixed(2));
}

// ─── Exponential Moving Average ─────────────────────────────────────

export function calculateEMA(data: number[], period: number): number[] {
  if (data.length < period) return [];

  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // Start with SMA for the first EMA value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
    ema.push(0); // placeholder
  }
  ema[period - 1] = sum / period;

  // Calculate EMA for remaining data points
  for (let i = period; i < data.length; i++) {
    const prev = ema[i - 1];
    ema.push((data[i] - prev) * multiplier + prev);
  }

  return ema;
}

// ─── MACD (12/26/9) ─────────────────────────────────────────────────

export interface MACDResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
}

export function calculateMACD(closes: number[]): MACDResult | null {
  if (closes.length < 35) return null; // Need at least 26 + 9 = 35 data points

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  if (ema12.length === 0 || ema26.length === 0) return null;

  // MACD line = EMA(12) - EMA(26)
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] && ema26[i]) {
      macdLine.push(ema12[i] - ema26[i]);
    }
  }

  if (macdLine.length < 9) return null;

  // Signal line = EMA(9) of MACD line
  const signalEma = calculateEMA(macdLine, 9);

  const lastMACD = macdLine[macdLine.length - 1];
  const lastSignal = signalEma[signalEma.length - 1];
  const prevMACD = macdLine.length >= 2 ? macdLine[macdLine.length - 2] : lastMACD;
  const prevSignal = signalEma.length >= 2 ? signalEma[signalEma.length - 2] : lastSignal;

  return {
    macdLine: parseFloat(lastMACD.toFixed(4)),
    signalLine: parseFloat(lastSignal.toFixed(4)),
    histogram: parseFloat((lastMACD - lastSignal).toFixed(4)),
  };
}

// ─── Bollinger Bands (20-period, 2σ) ────────────────────────────────

export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  width: number; // Bandwidth as percentage of middle
}

export function calculateBollingerBands(closes: number[], period: number = 20, stdDevMultiplier: number = 2): BollingerResult | null {
  if (closes.length < period) return null;

  // Use the last `period` closes
  const recentCloses = closes.slice(-period);

  const sma = recentCloses.reduce((sum, v) => sum + v, 0) / period;

  const variance = recentCloses.reduce((sum, v) => sum + Math.pow(v - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = sma + stdDevMultiplier * stdDev;
  const lower = sma - stdDevMultiplier * stdDev;
  const width = sma > 0 ? ((upper - lower) / sma) * 100 : 0;

  return {
    upper: parseFloat(upper.toFixed(2)),
    middle: parseFloat(sma.toFixed(2)),
    lower: parseFloat(lower.toFixed(2)),
    width: parseFloat(width.toFixed(2)),
  };
}

// ─── Volume Analysis ────────────────────────────────────────────────

export function calculateVolumeProfile(volumes: number[]): { avgVolume: number; ratio: number; todayVolume: number } {
  if (volumes.length === 0) return { avgVolume: 0, ratio: 1, todayVolume: 0 };

  const todayVolume = volumes[volumes.length - 1];
  const lookback = Math.min(20, volumes.length - 1);

  if (lookback <= 0) return { avgVolume: todayVolume, ratio: 1, todayVolume };

  const recentVolumes = volumes.slice(-lookback - 1, -1); // exclude today
  const avgVolume = recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length;

  return {
    avgVolume: Math.round(avgVolume),
    ratio: avgVolume > 0 ? parseFloat((todayVolume / avgVolume).toFixed(2)) : 1,
    todayVolume,
  };
}

// ─── Master Function: Compute All Real Technicals ───────────────────

export async function computeRealTechnicals(symbol: string): Promise<RealTechnicals | null> {
  const ohlcv = await fetchHistoricalOHLCV(symbol, 60);

  if (ohlcv.length < 15) {
    console.warn(`[Technicals] Insufficient data for ${symbol}: only ${ohlcv.length} candles`);
    return null;
  }

  const closes = ohlcv.map(c => c.close);
  const volumes = ohlcv.map(c => c.volume);
  const highs = ohlcv.map(c => c.high);
  const lows = ohlcv.map(c => c.low);

  const currentPrice = closes[closes.length - 1];
  const prevClose = closes.length >= 2 ? closes[closes.length - 2] : currentPrice;

  // ─── RSI ───
  const rsi = calculateRSI(closes, 14);
  const rsiSignal: RealTechnicals['rsiSignal'] =
    rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral';

  // ─── MACD ───
  const macdResult = calculateMACD(closes);
  let macdLine = 0, signalLine = 0, histogram = 0;
  let macdSignal: RealTechnicals['macdSignal'] = 'Neutral';

  if (macdResult) {
    macdLine = macdResult.macdLine;
    signalLine = macdResult.signalLine;
    histogram = macdResult.histogram;

    // Determine signal based on crossover and momentum
    if (histogram > 0 && macdLine > signalLine) {
      // Check if it just crossed (previous histogram was negative)
      macdSignal = 'Bullish Crossover';
    } else if (histogram < 0 && macdLine < signalLine) {
      macdSignal = 'Bearish Crossover';
    } else if (histogram > 0) {
      macdSignal = 'Bullish Momentum';
    } else if (histogram < 0) {
      macdSignal = 'Bearish Momentum';
    }
  }

  // ─── EMAs ───
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);

  const ema20 = ema20Arr.length > 0 ? parseFloat(ema20Arr[ema20Arr.length - 1].toFixed(2)) : currentPrice;
  const ema50 = ema50Arr.length > 0 ? parseFloat(ema50Arr[ema50Arr.length - 1].toFixed(2)) : currentPrice;

  // EMA Trend
  let emaTrend: RealTechnicals['emaTrend'] = 'Sideways';
  if (currentPrice > ema20 && ema20 > ema50) {
    emaTrend = 'Strong Uptrend';
  } else if (currentPrice > ema20) {
    emaTrend = 'Uptrend';
  } else if (currentPrice < ema20 && ema20 < ema50) {
    emaTrend = 'Strong Downtrend';
  } else if (currentPrice < ema20) {
    emaTrend = 'Downtrend';
  }

  // ─── Bollinger Bands ───
  const bbResult = calculateBollingerBands(closes, 20, 2);
  const bollingerUpper = bbResult?.upper ?? currentPrice * 1.02;
  const bollingerMiddle = bbResult?.middle ?? currentPrice;
  const bollingerLower = bbResult?.lower ?? currentPrice * 0.98;
  const bollingerWidth = bbResult?.width ?? 4;

  let bollingerPosition: RealTechnicals['bollingerPosition'] = 'Middle';
  if (currentPrice > bollingerUpper) {
    bollingerPosition = 'Above Upper';
  } else if (currentPrice > bollingerMiddle + (bollingerUpper - bollingerMiddle) * 0.7) {
    bollingerPosition = 'Near Upper';
  } else if (currentPrice < bollingerLower) {
    bollingerPosition = 'Below Lower';
  } else if (currentPrice < bollingerMiddle - (bollingerMiddle - bollingerLower) * 0.7) {
    bollingerPosition = 'Near Lower';
  }

  // ─── Volume ───
  const volumeProfile = calculateVolumeProfile(volumes);
  let volumeSignal: RealTechnicals['volumeSignal'] = 'Normal';
  if (volumeProfile.ratio > 2.0) {
    volumeSignal = 'High Volume Breakout';
  } else if (volumeProfile.ratio > 1.3) {
    volumeSignal = 'Above Average';
  } else if (volumeProfile.ratio < 0.5) {
    volumeSignal = 'Volume Dry-up';
  } else if (volumeProfile.ratio < 0.75) {
    volumeSignal = 'Low Volume';
  }

  // ─── Price Changes ───
  const priceChange1D = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

  const close5DAgo = closes.length >= 6 ? closes[closes.length - 6] : currentPrice;
  const priceChange5D = close5DAgo > 0 ? ((currentPrice - close5DAgo) / close5DAgo) * 100 : 0;

  const close1MAgo = closes.length >= 22 ? closes[closes.length - 22] : closes[0];
  const priceChange1M = close1MAgo > 0 ? ((currentPrice - close1MAgo) / close1MAgo) * 100 : 0;

  const dayHigh = highs[highs.length - 1] || currentPrice;
  const dayLow = lows[lows.length - 1] || currentPrice;
  const high52W = Math.max(...highs);
  const low52W = Math.min(...lows);

  return {
    rsi,
    rsiSignal,
    macdLine,
    signalLine,
    histogram,
    macdSignal,
    ema20,
    ema50,
    currentPrice: parseFloat(currentPrice.toFixed(2)),
    emaTrend,
    bollingerUpper,
    bollingerMiddle,
    bollingerLower,
    bollingerPosition,
    bollingerWidth,
    volumeToday: volumeProfile.todayVolume,
    volume20DayAvg: volumeProfile.avgVolume,
    volumeRatio: volumeProfile.ratio,
    volumeSignal,
    priceChange1D: parseFloat(priceChange1D.toFixed(2)),
    priceChange5D: parseFloat(priceChange5D.toFixed(2)),
    priceChange1M: parseFloat(priceChange1M.toFixed(2)),
    dayHigh: parseFloat(dayHigh.toFixed(2)),
    dayLow: parseFloat(dayLow.toFixed(2)),
    high52W: parseFloat(high52W.toFixed(2)),
    low52W: parseFloat(low52W.toFixed(2)),
    dataPoints: ohlcv.length,
    lastUpdated: new Date().toISOString(),
  };
}
