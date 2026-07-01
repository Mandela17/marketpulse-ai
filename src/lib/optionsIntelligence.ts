// Options Intelligence — Max Pain, OI Change Analysis, Options-Derived Support/Resistance
// Fetches the full NSE options chain and computes institutional-grade options analytics.
// Max Pain is the #1 most actionable signal for expiry-day trading.

// ─── Types ──────────────────────────────────────────────────────────

export interface OptionStrikeData {
  strikePrice: number;
  callOI: number;
  callOIChange: number;
  callVolume: number;
  callIV: number;
  putOI: number;
  putOIChange: number;
  putVolume: number;
  putIV: number;
}

export interface OptionsIntelligence {
  symbol: string;
  spotPrice: number;
  expiryDate: string;

  // Max Pain
  maxPain: number;              // Strike price where max options expire worthless
  maxPainDistance: number;       // % distance of spot from max pain
  maxPainSignal: 'Price Above Max Pain' | 'Price Below Max Pain' | 'At Max Pain';

  // OI Analysis
  pcrByOI: number;              // Total Put OI / Call OI
  pcrByOIChange: number;        // Fresh positioning: Put OI Change / Call OI Change
  pcrSignal: 'Bullish' | 'Bearish' | 'Neutral';
  freshPcrSignal: 'Bullish' | 'Bearish' | 'Neutral';

  // Support/Resistance from Options
  highestCallOIStrike: number;  // Resistance — writers don't want price here
  highestPutOIStrike: number;   // Support — put writers defend this level
  callWall: number;             // Strongest call resistance
  putWall: number;              // Strongest put support

  // IV Analysis
  avgCallIV: number;
  avgPutIV: number;
  ivSkew: number;               // Put IV - Call IV (positive = fear/hedging)
  ivSkewSignal: 'Puts Expensive' | 'Calls Expensive' | 'Balanced';

  // Expiry context
  isExpiryDay: boolean;
  isExpiryWeek: boolean;
  daysToExpiry: number;

  // ML Features
  features: {
    maxPainDist: number;        // Normalized distance from max pain
    freshPcr: number;           // Normalized PCR by OI change
    ivSkewNorm: number;         // Normalized IV skew
    oiConcentration: number;    // How concentrated OI is (entropy-based)
  };

  signals: string[];
  fetchedAt: string;
}

// ─── NSE Options Chain Fetcher ───────────────────────────────────────

async function fetchNSEOptionsChain(symbol: string): Promise<{
  records: any[];
  spotPrice: number;
  expiryDates: string[];
} | null> {
  // Determine the correct NSE endpoint
  const isIndex = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'].includes(symbol.toUpperCase());
  const endpoint = isIndex
    ? `https://www.nseindia.com/api/option-chain-indices?symbol=${encodeURIComponent(symbol)}`
    : `https://www.nseindia.com/api/option-chain-equities?symbol=${encodeURIComponent(symbol)}`;

  try {
    const res = await fetch(endpoint, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com/option-chain',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 1800 }, // Cache 30 min
    });

    if (!res.ok) return null;

    const data = await res.json();
    const records = data?.records?.data || data?.filtered?.data || [];
    const spotPrice = data?.records?.underlyingValue || data?.filtered?.underlyingValue || 0;
    const expiryDates: string[] = data?.records?.expiryDates || [];

    if (records.length === 0 || spotPrice === 0) return null;

    return { records, spotPrice, expiryDates };
  } catch (error) {
    console.warn(`[Options] Failed to fetch chain for ${symbol}:`, error);
    return null;
  }
}

// ─── Parse Strike Data ───────────────────────────────────────────────

function parseStrikes(records: any[], targetExpiry?: string): OptionStrikeData[] {
  const strikes: OptionStrikeData[] = [];

  for (const record of records) {
    // Filter by expiry if specified
    const ceExpiry = record.CE?.expiryDate;
    const peExpiry = record.PE?.expiryDate;
    if (targetExpiry && ceExpiry !== targetExpiry && peExpiry !== targetExpiry) continue;

    const strikePrice = record.strikePrice;
    if (!strikePrice) continue;

    strikes.push({
      strikePrice,
      callOI: record.CE?.openInterest || 0,
      callOIChange: record.CE?.changeinOpenInterest || 0,
      callVolume: record.CE?.totalTradedVolume || 0,
      callIV: record.CE?.impliedVolatility || 0,
      putOI: record.PE?.openInterest || 0,
      putOIChange: record.PE?.changeinOpenInterest || 0,
      putVolume: record.PE?.totalTradedVolume || 0,
      putIV: record.PE?.impliedVolatility || 0,
    });
  }

  return strikes.sort((a, b) => a.strikePrice - b.strikePrice);
}

// ─── Max Pain Calculator ─────────────────────────────────────────────

function computeMaxPain(strikes: OptionStrikeData[]): number {
  if (strikes.length === 0) return 0;

  let minLoss = Infinity;
  let maxPainStrike = strikes[0].strikePrice;

  // For each potential settlement price, compute total loss to option writers
  for (const candidate of strikes) {
    const settlementPrice = candidate.strikePrice;
    let totalLoss = 0;

    for (const strike of strikes) {
      // Call buyers' gain (= call writers' loss) at this settlement
      if (settlementPrice > strike.strikePrice) {
        totalLoss += (settlementPrice - strike.strikePrice) * strike.callOI;
      }
      // Put buyers' gain (= put writers' loss) at this settlement
      if (settlementPrice < strike.strikePrice) {
        totalLoss += (strike.strikePrice - settlementPrice) * strike.putOI;
      }
    }

    if (totalLoss < minLoss) {
      minLoss = totalLoss;
      maxPainStrike = settlementPrice;
    }
  }

  return maxPainStrike;
}

// ─── Expiry Detection ────────────────────────────────────────────────

function getExpiryContext(expiryDates: string[]): {
  nearestExpiry: string;
  isExpiryDay: boolean;
  isExpiryWeek: boolean;
  daysToExpiry: number;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parse expiry dates and find the nearest future one
  const parsedExpiries = expiryDates
    .map(d => {
      // NSE format: "27-Jun-2026" or "2026-06-27"
      const parsed = new Date(d);
      if (isNaN(parsed.getTime())) return null;
      parsed.setHours(0, 0, 0, 0);
      return parsed;
    })
    .filter((d): d is Date => d !== null && d >= today)
    .sort((a, b) => a.getTime() - b.getTime());

  if (parsedExpiries.length === 0) {
    return { nearestExpiry: '', isExpiryDay: false, isExpiryWeek: false, daysToExpiry: 30 };
  }

  const nearest = parsedExpiries[0];
  const diffMs = nearest.getTime() - today.getTime();
  const daysToExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return {
    nearestExpiry: nearest.toISOString().split('T')[0],
    isExpiryDay: daysToExpiry === 0,
    isExpiryWeek: daysToExpiry <= 5,
    daysToExpiry,
  };
}

// ─── Main Function ───────────────────────────────────────────────────

export async function fetchOptionsIntelligence(symbol: string): Promise<OptionsIntelligence | null> {
  const chainData = await fetchNSEOptionsChain(symbol);
  if (!chainData) return null;

  const { records, spotPrice, expiryDates } = chainData;
  const expiryCtx = getExpiryContext(expiryDates);

  // Parse strikes for nearest expiry
  const strikes = parseStrikes(records, expiryCtx.nearestExpiry);
  if (strikes.length === 0) {
    // Fallback: parse all strikes without expiry filter
    const allStrikes = parseStrikes(records);
    if (allStrikes.length === 0) return null;
    return buildIntelligence(symbol, spotPrice, allStrikes, expiryCtx);
  }

  return buildIntelligence(symbol, spotPrice, strikes, expiryCtx);
}

function buildIntelligence(
  symbol: string,
  spotPrice: number,
  strikes: OptionStrikeData[],
  expiryCtx: ReturnType<typeof getExpiryContext>,
): OptionsIntelligence {
  const signals: string[] = [];

  // ─── Max Pain ─────────────────────────────────────────────────
  const maxPain = computeMaxPain(strikes);
  const maxPainDistance = spotPrice > 0 ? ((spotPrice - maxPain) / spotPrice) * 100 : 0;
  const maxPainSignal: OptionsIntelligence['maxPainSignal'] =
    Math.abs(maxPainDistance) < 0.3 ? 'At Max Pain' :
    maxPainDistance > 0 ? 'Price Above Max Pain' : 'Price Below Max Pain';

  if (expiryCtx.isExpiryWeek) {
    signals.push(
      `Max Pain at ₹${maxPain.toLocaleString('en-IN')} — price is ${Math.abs(maxPainDistance).toFixed(1)}% ${maxPainDistance > 0 ? 'above' : 'below'} (${expiryCtx.daysToExpiry}d to expiry)`
    );
  }

  // ─── PCR Analysis ─────────────────────────────────────────────

  let totalCallOI = 0, totalPutOI = 0;
  let totalCallOIChange = 0, totalPutOIChange = 0;

  for (const s of strikes) {
    totalCallOI += s.callOI;
    totalPutOI += s.putOI;
    totalCallOIChange += s.callOIChange;
    totalPutOIChange += s.putOIChange;
  }

  const pcrByOI = totalCallOI > 0 ? parseFloat((totalPutOI / totalCallOI).toFixed(3)) : 1;
  const pcrByOIChange = totalCallOIChange > 0
    ? parseFloat((totalPutOIChange / totalCallOIChange).toFixed(3))
    : totalPutOIChange > 0 ? 2.0 : 1.0;

  // PCR > 1 = more puts = bullish (put writers confident market won't fall)
  const pcrSignal: OptionsIntelligence['pcrSignal'] =
    pcrByOI > 1.2 ? 'Bullish' : pcrByOI < 0.8 ? 'Bearish' : 'Neutral';
  const freshPcrSignal: OptionsIntelligence['freshPcrSignal'] =
    pcrByOIChange > 1.3 ? 'Bullish' : pcrByOIChange < 0.7 ? 'Bearish' : 'Neutral';

  if (freshPcrSignal !== 'Neutral') {
    signals.push(
      `Fresh PCR (by OI change): ${pcrByOIChange.toFixed(2)} — ${freshPcrSignal === 'Bullish' ? 'fresh put writing (bullish)' : 'fresh call writing (bearish)'}`
    );
  }

  // ─── Support/Resistance from OI ───────────────────────────────

  let highestCallOI = 0, highestCallOIStrike = spotPrice;
  let highestPutOI = 0, highestPutOIStrike = spotPrice;

  for (const s of strikes) {
    if (s.callOI > highestCallOI) {
      highestCallOI = s.callOI;
      highestCallOIStrike = s.strikePrice;
    }
    if (s.putOI > highestPutOI) {
      highestPutOI = s.putOI;
      highestPutOIStrike = s.strikePrice;
    }
  }

  signals.push(
    `Options Support: ₹${highestPutOIStrike.toLocaleString('en-IN')} (highest put OI) | Resistance: ₹${highestCallOIStrike.toLocaleString('en-IN')} (highest call OI)`
  );

  // ─── IV Skew ──────────────────────────────────────────────────

  // Focus on near-ATM strikes for IV analysis
  const atmRange = spotPrice * 0.05; // ±5% of spot
  const atmStrikes = strikes.filter(s =>
    Math.abs(s.strikePrice - spotPrice) <= atmRange &&
    s.callIV > 0 && s.putIV > 0
  );

  let avgCallIV = 0, avgPutIV = 0;
  if (atmStrikes.length > 0) {
    avgCallIV = atmStrikes.reduce((s, x) => s + x.callIV, 0) / atmStrikes.length;
    avgPutIV = atmStrikes.reduce((s, x) => s + x.putIV, 0) / atmStrikes.length;
  }

  const ivSkew = avgPutIV - avgCallIV;
  const ivSkewSignal: OptionsIntelligence['ivSkewSignal'] =
    ivSkew > 3 ? 'Puts Expensive' :
    ivSkew < -3 ? 'Calls Expensive' : 'Balanced';

  if (ivSkewSignal !== 'Balanced') {
    signals.push(
      `IV Skew: ${ivSkew.toFixed(1)}% — ${ivSkewSignal === 'Puts Expensive' ? 'institutions buying put protection (cautious)' : 'call demand elevated (speculative bullishness)'}`
    );
  }

  // ─── OI Concentration (simplified entropy) ────────────────────

  const totalOI = totalCallOI + totalPutOI;
  let oiConcentration = 0;
  if (totalOI > 0) {
    // Find top 3 strikes' share of total OI
    const oiByStrike = strikes.map(s => s.callOI + s.putOI).sort((a, b) => b - a);
    const top3OI = oiByStrike.slice(0, 3).reduce((s, x) => s + x, 0);
    oiConcentration = top3OI / totalOI; // 0-1, higher = more concentrated
  }

  // ─── ML Features ──────────────────────────────────────────────

  const features = {
    maxPainDist: Math.max(-1, Math.min(1, maxPainDistance / 3)),    // Normalize ±3% to ±1
    freshPcr: Math.max(-1, Math.min(1, (pcrByOIChange - 1) * 2)),  // Center on 1.0
    ivSkewNorm: Math.max(-1, Math.min(1, ivSkew / 10)),            // Normalize ±10 to ±1
    oiConcentration,
  };

  return {
    symbol,
    spotPrice,
    expiryDate: expiryCtx.nearestExpiry,
    maxPain,
    maxPainDistance: parseFloat(maxPainDistance.toFixed(2)),
    maxPainSignal,
    pcrByOI,
    pcrByOIChange,
    pcrSignal,
    freshPcrSignal,
    highestCallOIStrike,
    highestPutOIStrike,
    callWall: highestCallOIStrike,
    putWall: highestPutOIStrike,
    avgCallIV: parseFloat(avgCallIV.toFixed(1)),
    avgPutIV: parseFloat(avgPutIV.toFixed(1)),
    ivSkew: parseFloat(ivSkew.toFixed(1)),
    ivSkewSignal,
    isExpiryDay: expiryCtx.isExpiryDay,
    isExpiryWeek: expiryCtx.isExpiryWeek,
    daysToExpiry: expiryCtx.daysToExpiry,
    features,
    signals,
    fetchedAt: new Date().toISOString(),
  };
}
