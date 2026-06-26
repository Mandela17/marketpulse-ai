// NSE Real Market Data — Delivery %, PCR, India VIX
// Fetches real derivative and delivery data from NSE India and Yahoo Finance
// Replaces mock data for F&O stocks with actual market data

import { getServiceClient } from './supabase';

export interface DeliveryData {
  symbol: string;
  date: string;
  deliveryPercent: number;    // 0-100
  tradedQuantity: number;
  deliveredQuantity: number;
}

export interface RealPCRData {
  symbol: string;
  pcr: number;
  totalCallOI: number;
  totalPutOI: number;
  pcrSignal: 'Bullish' | 'Bearish' | 'Neutral';
}

export interface IndiaVIXData {
  value: number;
  change: number;
  changePercent: number;
  signal: 'Low Fear' | 'Normal' | 'Elevated' | 'High Fear' | 'Extreme Fear';
}

// ─── India VIX from Yahoo Finance ────────────────────────────────────

export async function fetchIndiaVIX(): Promise<IndiaVIXData | null> {
  try {
    const endpoints = [
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EINDIAVIX?interval=1d&range=5d',
      'https://query2.finance.yahoo.com/v8/finance/chart/%5EINDIAVIX?interval=1d&range=5d',
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          next: { revalidate: 900 },
        });

        if (!res.ok) continue;

        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (!result) continue;

        const meta = result.meta;
        const closes = result.indicators?.quote?.[0]?.close || [];

        // Filter out null values
        const validCloses = closes.filter((c: any) => c != null);
        if (validCloses.length === 0) continue;

        const currentVIX = meta.regularMarketPrice || validCloses[validCloses.length - 1];
        const prevClose = meta.chartPreviousClose || (validCloses.length >= 2 ? validCloses[validCloses.length - 2] : currentVIX);
        const change = currentVIX - prevClose;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

        // VIX signal classification (India VIX specific thresholds)
        let signal: IndiaVIXData['signal'] = 'Normal';
        if (currentVIX < 12) signal = 'Low Fear';
        else if (currentVIX < 16) signal = 'Normal';
        else if (currentVIX < 22) signal = 'Elevated';
        else if (currentVIX < 30) signal = 'High Fear';
        else signal = 'Extreme Fear';

        return {
          value: parseFloat(currentVIX.toFixed(2)),
          change: parseFloat(change.toFixed(2)),
          changePercent: parseFloat(changePct.toFixed(2)),
          signal,
        };
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Delivery Data from NSE ──────────────────────────────────────────

export async function fetchDeliveryData(symbol: string): Promise<DeliveryData | null> {
  try {
    // NSE delivery data endpoint
    const res = await fetch(
      `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}&section=trade_info`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': `https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`,
          'Accept-Language': 'en-US,en;q=0.9',
        },
        next: { revalidate: 1800 },
      }
    );

    if (!res.ok) {
      console.warn(`[NSE] Delivery data fetch failed for ${symbol}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const marketData = data?.marketDeptOrderBook || data?.securityWiseDP || data;

    // NSE provides delivery percentage in various nested structures
    const tradeInfo = marketData?.tradeInfo || data?.tradeInfo;
    if (tradeInfo) {
      const totalTradedQty = tradeInfo.totalTradedVolume || tradeInfo.totalBuyQuantity || 0;
      const deliveredQty = tradeInfo.deliveryQuantity || tradeInfo.totalDeliveredVolume || 0;
      const delivPct = tradeInfo.deliveryToTradedQuantity || (totalTradedQty > 0 ? (deliveredQty / totalTradedQty) * 100 : 0);

      return {
        symbol,
        date: new Date().toISOString().split('T')[0],
        deliveryPercent: parseFloat(delivPct.toFixed(2)),
        tradedQuantity: totalTradedQty,
        deliveredQuantity: deliveredQty,
      };
    }

    // Fallback: try securityWiseDP format
    const swDP = data?.securityWiseDP;
    if (swDP) {
      return {
        symbol,
        date: new Date().toISOString().split('T')[0],
        deliveryPercent: parseFloat((swDP.deliveryToTradedQuantity || 0).toFixed(2)),
        tradedQuantity: swDP.quantityTraded || 0,
        deliveredQuantity: swDP.deliveryQuantity || 0,
      };
    }

    return null;
  } catch (error) {
    console.warn(`[NSE] Delivery data error for ${symbol}:`, error);
    return null;
  }
}

// ─── PCR from NSE Options Chain ──────────────────────────────────────

export async function fetchRealPCR(symbol: string): Promise<RealPCRData | null> {
  try {
    // NSE options chain endpoint
    const nseSym = symbol === 'NIFTY' ? 'NIFTY' : symbol === 'BANKNIFTY' ? 'BANKNIFTY' : symbol;
    const res = await fetch(
      `https://www.nseindia.com/api/option-chain-equities?symbol=${encodeURIComponent(nseSym)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': `https://www.nseindia.com/option-chain`,
          'Accept-Language': 'en-US,en;q=0.9',
        },
        next: { revalidate: 1800 },
      }
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const records = data?.records?.data || data?.filtered?.data || [];

    if (records.length === 0) return null;

    let totalCallOI = 0;
    let totalPutOI = 0;

    for (const record of records) {
      if (record.CE?.openInterest) totalCallOI += record.CE.openInterest;
      if (record.PE?.openInterest) totalPutOI += record.PE.openInterest;
    }

    if (totalCallOI === 0 && totalPutOI === 0) return null;

    const pcr = totalCallOI > 0 ? parseFloat((totalPutOI / totalCallOI).toFixed(3)) : 0;
    const pcrSignal: RealPCRData['pcrSignal'] =
      pcr > 1.05 ? 'Bullish' :
      pcr < 0.85 ? 'Bearish' : 'Neutral';

    return {
      symbol,
      pcr,
      totalCallOI,
      totalPutOI,
      pcrSignal,
    };
  } catch (error) {
    console.warn(`[NSE] PCR data error for ${symbol}:`, error);
    return null;
  }
}

// ─── F&O Stock Check ─────────────────────────────────────────────────
// List of major F&O stocks that have options available on NSE

const FNO_STOCKS = new Set([
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK',
  'AXISBANK', 'HINDUNILVR', 'ITC', 'BAJFINANCE', 'BHARTIARTL', 'LT', 'ASIANPAINT',
  'MARUTI', 'TATAMOTORS', 'SUNPHARMA', 'WIPRO', 'HCLTECH', 'NTPC', 'ONGC',
  'POWERGRID', 'TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'COALINDIA', 'ADANIENT',
  'ADANIPORTS', 'TITAN', 'NESTLEIND', 'BAJAJFINSV', 'TECHM', 'ULTRACEMCO',
  'DRREDDY', 'CIPLA', 'DIVISLAB', 'GRASIM', 'BPCL', 'IOC', 'INDUSINDBK',
  'EICHERMOT', 'HEROMOTOCO', 'BAJAJ-AUTO', 'M&M', 'BRITANNIA', 'TATACONSUM',
  'APOLLOHOSP', 'DLF', 'PNB', 'BANKBARODA', 'VEDL', 'TATAPOWER', 'HAL',
  'BEL', 'IRCTC', 'SBILIFE', 'HDFCLIFE', 'ICICIPRULI', 'PFC', 'RECLTD',
  'CHOLAFIN', 'SHRIRAMFIN', 'MUTHOOTFIN', 'LUPIN', 'BIOCON', 'PERSISTENT',
  'COFORGE', 'LTIM', 'GODREJPROP', 'OBEROIRLTY', 'PIDILITIND', 'DABUR',
  'MARICO', 'COLPAL', 'VOLTAS', 'DIXON', 'POLYCAB', 'ABB', 'SIEMENS',
  'NIFTY', 'BANKNIFTY', 'FINNIFTY',
]);

export function isFnOStock(symbol: string): boolean {
  return FNO_STOCKS.has(symbol.toUpperCase());
}

// ─── Save daily features to Supabase ─────────────────────────────────

export async function saveDailyFeatures(features: {
  symbol: string;
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  rsi?: number;
  macdHist?: number;
  ema20?: number;
  ema50?: number;
  bollingerUpper?: number;
  bollingerLower?: number;
  volumeRatio?: number;
  sentimentScore?: number;
  articleCount?: number;
  pcr?: number;
  deliveryPct?: number;
  niftyClose?: number;
  indiaVix?: number;
  fiiNet?: number;
  diiNet?: number;
}): Promise<boolean> {
  try {
    const db = getServiceClient();
    await db.from('daily_features').upsert({
      symbol: features.symbol,
      date: features.date,
      close: features.close,
      open: features.open,
      high: features.high,
      low: features.low,
      volume: features.volume,
      rsi: features.rsi,
      macd_hist: features.macdHist,
      ema20: features.ema20,
      ema50: features.ema50,
      bollinger_upper: features.bollingerUpper,
      bollinger_lower: features.bollingerLower,
      volume_ratio: features.volumeRatio,
      sentiment_score: features.sentimentScore,
      article_count: features.articleCount,
      pcr: features.pcr,
      delivery_pct: features.deliveryPct,
      nifty_close: features.niftyClose,
      india_vix: features.indiaVix,
      fii_net: features.fiiNet,
      dii_net: features.diiNet,
    }, {
      onConflict: 'symbol,date',
    });
    return true;
  } catch (err) {
    console.warn(`[NSE] Daily features save failed for ${features.symbol}:`, err);
    return false;
  }
}

// ─── Get historical daily features from Supabase ─────────────────────

export async function getHistoricalFeatures(symbol: string, days: number = 90): Promise<any[]> {
  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from('daily_features')
      .select('*')
      .eq('symbol', symbol)
      .order('date', { ascending: true })
      .limit(days);

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}
