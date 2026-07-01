// Global Market Correlations — Pre-market intelligence for Indian market predictions
// Fetches GIFT Nifty, S&P 500, DXY, Brent Crude, US 10Y Treasury from Yahoo Finance
// These global indicators strongly predict Nifty opening gaps and FII flow direction.

import { cachedFetch } from './cache';

// ─── Types ──────────────────────────────────────────────────────────

export interface GlobalInstrument {
  name: string;
  value: number;
  change: number;
  changePercent: number;
  signal: 'Bullish' | 'Bearish' | 'Neutral';
  impactOnIndia: string;        // Human-readable impact description
}

export interface GlobalContext {
  giftNifty: GlobalInstrument | null;
  sp500: GlobalInstrument | null;
  dxy: GlobalInstrument | null;
  brentCrude: GlobalInstrument | null;
  us10Y: GlobalInstrument | null;

  // Computed signals
  gapPrediction: 'Gap Up' | 'Gap Down' | 'Flat Open';
  gapConfidence: number;        // 0-100
  overallBias: 'Bullish' | 'Bearish' | 'Neutral';
  signals: string[];            // Human-readable signal list

  // Normalized ML features
  features: {
    sp500Overnight: number;     // Normalized S&P 500 overnight return
    dxyChange: number;          // Normalized DXY change (inverted: rising DXY = negative)
    crudeChange: number;        // Normalized crude change (inverted: rising crude = negative for India)
    giftNiftyGap: number;       // GIFT Nifty implied gap % (normalized)
    us10YChange: number;        // US 10Y yield change (inverted: rising yield = negative)
  };

  fetchedAt: string;
}

// ─── Yahoo Finance Fetcher (reuses proven pattern) ───────────────────

async function fetchYahooQuote(ticker: string): Promise<{
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
} | null> {
  const encodedTicker = encodeURIComponent(ticker);
  const endpoints = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?interval=1d&range=2d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodedTicker}?interval=1d&range=2d`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        next: { revalidate: 600 }, // Cache 10 min
      });

      if (!res.ok) continue;

      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (!meta) continue;

      const price = meta.regularMarketPrice || 0;
      const previousClose = meta.chartPreviousClose || meta.previousClose || price;
      const change = price - previousClose;
      const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

      if (price > 0) {
        return { price, previousClose, change, changePercent };
      }
    } catch {
      continue;
    }
  }

  return null;
}

// ─── Instrument Builders ─────────────────────────────────────────────

function buildGiftNifty(data: NonNullable<Awaited<ReturnType<typeof fetchYahooQuote>>>): GlobalInstrument {
  const signal: GlobalInstrument['signal'] =
    data.changePercent > 0.3 ? 'Bullish' :
    data.changePercent < -0.3 ? 'Bearish' : 'Neutral';

  const impact = data.changePercent > 0.5
    ? `GIFT Nifty up ${data.changePercent.toFixed(1)}% — expect gap up opening`
    : data.changePercent < -0.5
    ? `GIFT Nifty down ${Math.abs(data.changePercent).toFixed(1)}% — expect gap down opening`
    : 'GIFT Nifty flat — neutral opening expected';

  return {
    name: 'GIFT Nifty',
    value: data.price,
    change: data.change,
    changePercent: parseFloat(data.changePercent.toFixed(2)),
    signal,
    impactOnIndia: impact,
  };
}

function buildSP500(data: NonNullable<Awaited<ReturnType<typeof fetchYahooQuote>>>): GlobalInstrument {
  const signal: GlobalInstrument['signal'] =
    data.changePercent > 0.5 ? 'Bullish' :
    data.changePercent < -0.5 ? 'Bearish' : 'Neutral';

  const impact = data.changePercent > 1
    ? `S&P 500 rallied ${data.changePercent.toFixed(1)}% — strong risk-on sentiment for EMs`
    : data.changePercent < -1
    ? `S&P 500 fell ${Math.abs(data.changePercent).toFixed(1)}% — risk-off may trigger FII selling`
    : 'S&P 500 movement within normal range';

  return {
    name: 'S&P 500',
    value: data.price,
    change: data.change,
    changePercent: parseFloat(data.changePercent.toFixed(2)),
    signal,
    impactOnIndia: impact,
  };
}

function buildDXY(data: NonNullable<Awaited<ReturnType<typeof fetchYahooQuote>>>): GlobalInstrument {
  // DXY has INVERSE correlation with Indian markets
  const signal: GlobalInstrument['signal'] =
    data.changePercent > 0.3 ? 'Bearish' :   // Rising dollar = bearish for India
    data.changePercent < -0.3 ? 'Bullish' :   // Falling dollar = bullish for India
    'Neutral';

  const impact = data.changePercent > 0.5
    ? `Dollar Index rising ${data.changePercent.toFixed(1)}% — INR weakness may trigger FII outflows`
    : data.changePercent < -0.5
    ? `Dollar Index falling ${Math.abs(data.changePercent).toFixed(1)}% — positive for INR and FII flows`
    : 'Dollar Index stable — no significant INR impact expected';

  return {
    name: 'Dollar Index (DXY)',
    value: data.price,
    change: data.change,
    changePercent: parseFloat(data.changePercent.toFixed(2)),
    signal,
    impactOnIndia: impact,
  };
}

function buildBrentCrude(data: NonNullable<Awaited<ReturnType<typeof fetchYahooQuote>>>): GlobalInstrument {
  // Rising crude is BEARISH for India (net importer, 85% dependency)
  const signal: GlobalInstrument['signal'] =
    data.changePercent > 1.5 ? 'Bearish' :
    data.changePercent < -1.5 ? 'Bullish' :
    'Neutral';

  const impact = data.changePercent > 2
    ? `Brent Crude surging ${data.changePercent.toFixed(1)}% — negative for India's current account deficit`
    : data.changePercent < -2
    ? `Brent Crude falling ${Math.abs(data.changePercent).toFixed(1)}% — eases inflation pressure for India`
    : 'Brent Crude within normal range — limited macro impact';

  return {
    name: 'Brent Crude',
    value: data.price,
    change: data.change,
    changePercent: parseFloat(data.changePercent.toFixed(2)),
    signal,
    impactOnIndia: impact,
  };
}

function buildUS10Y(data: NonNullable<Awaited<ReturnType<typeof fetchYahooQuote>>>): GlobalInstrument {
  // Rising US yields = bearish for emerging markets (capital outflows)
  const signal: GlobalInstrument['signal'] =
    data.change > 0.05 ? 'Bearish' :     // Yield up 5+ bps
    data.change < -0.05 ? 'Bullish' :    // Yield down 5+ bps
    'Neutral';

  const impact = data.change > 0.08
    ? `US 10Y yield rising ${(data.change * 100).toFixed(0)} bps — may accelerate FII selling in EMs`
    : data.change < -0.08
    ? `US 10Y yield falling ${Math.abs(data.change * 100).toFixed(0)} bps — positive for EM equity flows`
    : 'US Treasury yields stable — no significant flow impact';

  return {
    name: 'US 10-Year Treasury',
    value: data.price,
    change: parseFloat(data.change.toFixed(3)),
    changePercent: parseFloat(data.changePercent.toFixed(2)),
    signal,
    impactOnIndia: impact,
  };
}

// ─── Main Fetch Function ─────────────────────────────────────────────

export async function fetchGlobalCorrelations(): Promise<GlobalContext> {
  // Fetch all instruments in parallel
  const [giftNiftyRaw, sp500Raw, dxyRaw, crudeRaw, us10YRaw] = await Promise.all([
    // GIFT Nifty — try multiple tickers
    fetchYahooQuote('^GIFTNIFTY')
      .then(d => d || fetchYahooQuote('0700.HK'))  // Fallback
      .catch(() => null),
    // S&P 500 — try index, then futures
    fetchYahooQuote('^GSPC')
      .then(d => d || fetchYahooQuote('ES=F'))
      .catch(() => null),
    // Dollar Index
    fetchYahooQuote('DX-Y.NYB').catch(() => null),
    // Brent Crude Futures
    fetchYahooQuote('BZ=F').catch(() => null),
    // US 10-Year Treasury Yield
    fetchYahooQuote('^TNX').catch(() => null),
  ]);

  // Build typed instruments
  const giftNifty = giftNiftyRaw ? buildGiftNifty(giftNiftyRaw) : null;
  const sp500 = sp500Raw ? buildSP500(sp500Raw) : null;
  const dxy = dxyRaw ? buildDXY(dxyRaw) : null;
  const brentCrude = crudeRaw ? buildBrentCrude(crudeRaw) : null;
  const us10Y = us10YRaw ? buildUS10Y(us10YRaw) : null;

  // ─── Compute Gap Prediction ───────────────────────────────────────

  let gapScore = 0; // -100 to +100
  const signals: string[] = [];

  if (giftNifty) {
    // GIFT Nifty is the strongest gap predictor (weight 3x)
    gapScore += giftNifty.changePercent * 30;
    if (giftNifty.signal !== 'Neutral') {
      signals.push(giftNifty.impactOnIndia);
    }
  }

  if (sp500) {
    // S&P 500 overnight (weight 2x)
    gapScore += sp500.changePercent * 15;
    if (sp500.signal !== 'Neutral') {
      signals.push(sp500.impactOnIndia);
    }
  }

  if (dxy) {
    // DXY — inverse correlation (weight 1.5x)
    gapScore -= dxy.changePercent * 10;
    if (dxy.signal !== 'Neutral') {
      signals.push(dxy.impactOnIndia);
    }
  }

  if (brentCrude) {
    // Crude — inverse for India (weight 1x)
    gapScore -= brentCrude.changePercent * 5;
    if (brentCrude.signal !== 'Neutral') {
      signals.push(brentCrude.impactOnIndia);
    }
  }

  if (us10Y) {
    // US yields — inverse for EM (weight 1x)
    gapScore -= us10Y.change * 100; // basis points impact
    if (us10Y.signal !== 'Neutral') {
      signals.push(us10Y.impactOnIndia);
    }
  }

  // Clamp gap score
  gapScore = Math.max(-100, Math.min(100, gapScore));

  const gapPrediction: GlobalContext['gapPrediction'] =
    gapScore > 15 ? 'Gap Up' :
    gapScore < -15 ? 'Gap Down' : 'Flat Open';

  const gapConfidence = Math.min(95, Math.abs(gapScore));

  const overallBias: GlobalContext['overallBias'] =
    gapScore > 10 ? 'Bullish' :
    gapScore < -10 ? 'Bearish' : 'Neutral';

  // ─── Normalized ML Features ───────────────────────────────────────

  // Normalize to roughly [-1, 1] range
  const features = {
    sp500Overnight: sp500 ? Math.max(-1, Math.min(1, sp500.changePercent / 3)) : 0,
    dxyChange: dxy ? Math.max(-1, Math.min(1, -dxy.changePercent / 2)) : 0,   // Inverted
    crudeChange: brentCrude ? Math.max(-1, Math.min(1, -brentCrude.changePercent / 5)) : 0, // Inverted
    giftNiftyGap: giftNifty ? Math.max(-1, Math.min(1, giftNifty.changePercent / 3)) : 0,
    us10YChange: us10Y ? Math.max(-1, Math.min(1, -us10Y.change * 10)) : 0,   // Inverted
  };

  return {
    giftNifty,
    sp500,
    dxy,
    brentCrude,
    us10Y,
    gapPrediction,
    gapConfidence,
    overallBias,
    signals,
    features,
    fetchedAt: new Date().toISOString(),
  };
}
