// API Route: Proven Strategies Stock Screener
// Screens ~500 NSE stocks against 14 quantitative swing trading strategies
// using REAL OHLCV + fundamental + shareholding data from Yahoo Finance & Upstox

import { NextResponse } from 'next/server';
import {
  fetchHistoricalOHLCV,
  calculateRSI,
  calculateEMA,
  calculateMACD,
  calculateBollingerBands,
  calculateVolumeProfile,
  type OHLCV,
} from '@/lib/technicalAnalysis';
import { getLatestShareholding } from '@/lib/shareholdingData';
import { toYahooTicker } from '@/lib/symbolMap';
import { getInstrumentKey } from '@/lib/upstoxInstruments';
import { getUpstoxToken } from '@/lib/upstoxTokenStore';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ─── Stock Universe: ~500 NSE Stocks ────────────────────────────────
// Covers Nifty 50, Next 50, Midcap 150, Smallcap 250, PSU Banks, Defence, etc.
const SCREEN_STOCKS = [
  // ── Nifty 50 (Large Cap) ──
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL',
  'ITC', 'LT', 'KOTAKBANK', 'AXISBANK', 'TITAN', 'SUNPHARMA', 'BAJFINANCE',
  'MARUTI', 'TATAMOTORS', 'WIPRO', 'HCLTECH', 'NTPC', 'POWERGRID',
  'M&M', 'TATASTEEL', 'JSWSTEEL', 'COALINDIA', 'ADANIENT', 'ADANIPORTS',
  'HINDUNILVR', 'DRREDDY', 'CIPLA', 'NESTLEIND', 'ASIANPAINT', 'HEROMOTOCO',
  'BAJAJ-AUTO', 'EICHERMOT', 'BPCL', 'ONGC', 'ULTRACEMCO', 'GRASIM',
  'BEL', 'HAL', 'TRENT', 'INDUSINDBK', 'BRITANNIA', 'TATACONSUM',
  'APOLLOHOSP', 'BAJAJFINSV', 'TECHM', 'DIVISLAB', 'SHRIRAMFIN', 'JSWENERGY',

  // ── Nifty Next 50 / Large-Mid ──
  'DLF', 'GODREJCP', 'PIDILITIND', 'DABUR', 'MARICO', 'COLPAL',
  'HAVELLS', 'VOLTAS', 'SIEMENS', 'ABB', 'BOSCHLTD', 'CUMMINSIND',
  'TORNTPHARM', 'LUPIN', 'BIOCON', 'AUROPHARMA', 'ALKEM', 'IPCALAB',
  'PERSISTENT', 'COFORGE', 'LTIM', 'MPHASIS', 'NAUKRI', 'ZOMATO',
  'POLICYBZR', 'SBILIFE', 'HDFCLIFE', 'ICICIPRULI', 'MUTHOOTFIN', 'CHOLAFIN',
  'PFC', 'RECLTD', 'IRFC', 'VEDL', 'HINDALCO', 'NMDC', 'NATIONALUM', 'HINDCOPPER',
  'TATAPOWER', 'NHPC', 'SJVN', 'IREDA', 'ADANIGREEN',

  // ── Banks — PSU ──
  'PNB', 'BANKBARODA', 'CANBK', 'UNIONBANK', 'BANKINDIA', 'IOB',
  'CENTRALBK', 'UCOBANK', 'INDIANB', 'PSB', 'MAHABANK',
  'IDBI', 'J&KBANK', 'KARURVYSYA',

  // ── Banks — Private & Small Finance ──
  'IDFCFIRSTB', 'FEDERALBNK', 'BANDHANBNK', 'RBLBANK', 'SOUTHBANK',
  'UJJIVANSFB', 'EQUITASBNK', 'AUBANK', 'CUB', 'CSB', 'DCBBANK',
  'KARNATKABNK', 'TMB', 'ESAFSFB',

  // ── NBFCs & Finance ──
  'MANAPPURAM', 'IIFL', 'LICHSGFIN', 'CANFINHOME', 'HUDCO',
  'CREDITACC', 'AAVAS', 'POONAWALLA', 'SBFC', 'APTUS',
  'HOMEFIRST', 'EDELWEISS', 'JMFINANCIL', 'MOTILALOFS', 'ANGELONE',
  'FIVESTAR', 'SUNDARMFIN',

  // ── Insurance ──
  'LICI', 'NIACL', 'GICRE', 'STARHEALTH', 'ICICIPRULI',

  // ── IT & Tech ──
  'HAPPSTMNDS', 'KPITTECH', 'TATAELXSI', 'ZENSAR', 'MASTEK',
  'SONATA', 'NIITLTD', 'NEWGEN', 'ROUTE', 'INTELLECT',
  'CYIENT', 'BIRLASOFT', 'AFFLE', 'TANLA', 'LATENTVIEW',
  'DATAPATTNS', 'RATEGAIN', 'MAPMYINDIA',

  // ── Pharma & Healthcare ──
  'LALPATHLAB', 'METROPOLIS', 'SYNGENE', 'GLAND', 'LAURUSLABS',
  'GRANULES', 'NATCOPHARM', 'AARTIIND', 'ASTRAZEN', 'PFIZER',
  'AJANTPHARM', 'STAR', 'MEDANTA', 'MAXHEALTH', 'RAINBOW',
  'GLENMARK', 'IPCALAB', 'ABBOTINDIA', 'SANOFI', 'GLAXO',
  'ERIS', 'SUNCLAYERG', 'SUVEN', 'MANKIND',

  // ── FMCG & Consumer ──
  'GODREJIND', 'EMAMILTD', 'JYOTHYLAB', 'VGUARD', 'CROMPTON',
  'WHIRLPOOL', 'BATAINDIA', 'RELAXO', 'PAGEIND', 'TTKPRESTIG',
  'RADICO', 'UBL', 'UNITDSPR', 'DEVYANI', 'JUBLFOOD',
  'TATAELXSI', 'BIKAJI', 'SAPPHIRE', 'GODFRYPHLP',

  // ── Auto & Auto Ancillary ──
  'ASHOKLEY', 'ESCORTS', 'TVSMOTORS', 'BALKRISIND', 'CEATLTD',
  'APOLLOTYRE', 'MRF', 'MOTHERSON', 'ENDURANCE', 'EXIDEIND',
  'AMARAJABAT', 'TIINDIA', 'SUNDRMFAST', 'BHARATFORG', 'KALYANKJIL',
  'OLECTRA', 'JBMA', 'CRAFTSMAN', 'GABRIEL', 'SUBROS',

  // ── Infra & Construction ──
  'NBCC', 'IRCON', 'RVNL', 'ENGINERSIN', 'KEC',
  'KALPATPOWR', 'LTTS', 'JKCEMENT', 'RAMCOCEM', 'DALBHARAT',
  'SHREECEM', 'AMBUJACEM', 'JKLAKSHMI', 'HEIDELBERG', 'STARCEMENT',
  'NCC', 'KPIL', 'HCC', 'PNCINFRA', 'AHLUCONT',
  'JSWINFRA', 'GPPL',

  // ── Chemicals & Materials ──
  'SRF', 'DEEPAKNTR', 'ATUL', 'NAVINFLUOR',
  'FINEORG', 'CLEAN', 'GALAXYSURF', 'SUDARSCHEM', 'VINATIORGA',
  'ALKYLAMINE', 'LXCHEM', 'TATACHEM', 'ROSSARI', 'ANURAS',

  // ── Energy, Power & Gas ──
  'GAIL', 'IGL', 'MGL', 'PETRONET', 'HINDPETRO',
  'IOC', 'OIL', 'MRPL', 'CESC', 'TORNTPOWER',
  'JSL', 'JINDALSTEL', 'SAIL', 'WELCORP', 'RATNAMANI',
  'ADANIENSOL', 'ADANITRANS', 'TATAPOWER', 'JPPOWER', 'RPOWER',

  // ── Defence & Aerospace ──
  'BDL', 'GRSE', 'COCHINSHIP', 'MAZAGONDOCK', 'GARDENREACH',
  'SOLARINDS', 'PARAS', 'DCAL', 'MIDHANI', 'BEML',
  'ASTRA', 'ZENTEC', 'DATAPATTNS',

  // ── Railways & Logistics ──
  'IRCTC', 'RITES', 'RAILTEL', 'TITAGARH', 'JUPITERWAG',
  'TEXRAIL', 'CONCOR', 'BLUEDART', 'TCI', 'MAHLOG',
  'DELHIVERY', 'ALLCARGO', 'GESHIP',

  // ── Real Estate ──
  'GODREJPROP', 'OBEROIRLTY', 'PRESTIGE', 'BRIGADE', 'SOBHA',
  'MAHLIFE', 'LODHA', 'RAYMOND', 'PHOENIXLTD', 'SUNTECK',

  // ── Telecom & Media ──
  'IDEA', 'TTML', 'HFCL', 'STLTECH', 'SUNTV',
  'PVRINOX', 'ZEEL', 'TV18BRDCST', 'NETWORK18',

  // ── Textiles & Apparel ──
  'ARVIND', 'TRIDENT', 'WELSPUNLIV', 'KPRMILL', 'GOKALDAS',
  'SOMANYCERA', 'ORIENTELEC', 'PGHL',

  // ── Sugar & Agri ──
  'BALRAMCHIN', 'RENUKA', 'DWARIKESH', 'EIDPARRY', 'TRIVENI',
  'DHANUKA', 'UPL', 'PI', 'RALLIS', 'BAYER',

  // ── Fertilizers & Chemicals ──
  'CHAMBLFERT', 'GNFC', 'GSFC', 'RCF', 'NFL',
  'FACT', 'COROMANDEL', 'DEEPAKFERT',

  // ── Capital Goods & Engineering ──
  'THERMAX', 'ISGEC', 'ELGIEQUIP', 'PRAJIND', 'AIAENG',
  'KENNAMET', 'SCHAEFFLER', 'TIMKEN', 'SKFINDIA',
  'GRINDWELL', 'CARBORUNIV', 'SUPRAJIT', 'CUMMINSIND',
  'CGPOWER', 'SUZLON', 'INOXWIND', 'TDPOWERSYS',

  // ── PSU Misc (High Promoter) ──
  'BHEL', 'CONCOR', 'NLCINDIA', 'MMTC', 'MOIL',
  'IRCON', 'NBCC', 'RVNL', 'HUDCO', 'HSCL',
  'OFSS', 'MAZDOCK', 'SJVN',

  // ── Exchanges & Market Infra ──
  'CDSL', 'BSE', 'MCX', 'CAMS',

  // ── Small Cap — Hidden Gems ──
  'POLYCAB', 'DIXON', 'KAYNES', 'RAJESHEXPO', 'CCL',
  'ZYDUSLIFE', 'JBCHEPHARM', 'HEMIPROP',
  'LTFOODS', 'KRBL', 'BSOFT', 'HAPPIEST',
  'FINCABLES', 'IIFLWAM', 'TARSONS', 'CLEAN',
  'CAMPUS', 'MAPMYINDIA', 'YATHARTH',

  // ── Jewellery & Retail ──
  'TITAN', 'KALYANKJIL', 'SENCO', 'THANGAMAYIL',
  'DMART', 'SHOPERSTOP', 'VMART', 'TRENT',
].filter((v, i, a) => a.indexOf(v) === i); // Deduplicate

// ─── In-memory strategy results cache ───────────────────────────────
const strategyCache: Map<string, { data: any; ts: number }> = new Map();
const STRATEGY_CACHE_TTL = 20 * 60 * 1000; // 20 min (longer for 250-stock scan)

// ─── Real Fundamental Data from Yahoo Finance ──────────────────────
// Uses quoteSummary endpoint for ROE, D/E, PE, profit margins, etc.

interface RealFundamentals {
  roe: number;           // Return on Equity %
  debtToEquity: number;  // Debt-to-Equity ratio
  peRatio: number;       // Trailing P/E
  profitMargin: number;  // Net profit margin %
  revenueGrowth: number; // YoY revenue growth %
  currentRatio: number;  // Current assets / Current liabilities
  source: 'yahoo';
}

const fundamentalsCache: Map<string, { data: RealFundamentals | null; ts: number }> = new Map();
const FUNDAMENTALS_CACHE_TTL = 60 * 60 * 1000; // 1 hour (fundamentals don't change intraday)

async function fetchRealFundamentals(symbol: string): Promise<RealFundamentals | null> {
  const cacheKey = `fund:${symbol}`;
  const cached = fundamentalsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < FUNDAMENTALS_CACHE_TTL) return cached.data;

  const yahooTicker = toYahooTicker(symbol);
  const encodedTicker = encodeURIComponent(yahooTicker);
  const modules = 'financialData,defaultKeyStatistics';

  const endpoints = [
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodedTicker}?modules=${modules}`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodedTicker}?modules=${modules}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });
      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.quoteSummary?.result?.[0];
      if (!result) continue;

      const fin = result.financialData || {};
      const stats = result.defaultKeyStatistics || {};

      const fundamentals: RealFundamentals = {
        roe: parseFloat(((fin.returnOnEquity?.raw ?? 0) * 100).toFixed(1)),
        debtToEquity: parseFloat(((fin.debtToEquity?.raw ?? 0) / 100).toFixed(2)), // Yahoo returns as %, divide by 100
        peRatio: parseFloat((stats.trailingPE?.raw ?? stats.forwardPE?.raw ?? 0).toFixed(1)),
        profitMargin: parseFloat(((fin.profitMargins?.raw ?? 0) * 100).toFixed(1)),
        revenueGrowth: parseFloat(((fin.revenueGrowth?.raw ?? 0) * 100).toFixed(1)),
        currentRatio: parseFloat((fin.currentRatio?.raw ?? 0).toFixed(2)),
        source: 'yahoo',
      };

      fundamentalsCache.set(cacheKey, { data: fundamentals, ts: Date.now() });
      return fundamentals;
    } catch {
      continue;
    }
  }

  fundamentalsCache.set(cacheKey, { data: null, ts: Date.now() });
  return null;
}

// ─── Dynamic Shareholding from Upstox API ───────────────────────────
// Tries Upstox fundamentals API for real shareholding data,
// falls back to local curated data if unavailable

interface ShareholdingSnapshot {
  promoter: number;
  mutualFund: number;
  dii: number;
  retail: number;
}

const shareholdingCache: Map<string, { data: ShareholdingSnapshot | null; ts: number }> = new Map();
const SHAREHOLDING_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours (quarterly data)

function mapUpstoxCat(cat: string): keyof ShareholdingSnapshot | null {
  const lower = cat.toLowerCase();
  if (lower.includes('promoter')) return 'promoter';
  if (lower.includes('mutual_fund') || lower.includes('mutual fund')) return 'mutualFund';
  if (lower.includes('dii') || lower.includes('domestic_institutional') || lower.includes('other_dii')) return 'dii';
  if (lower.includes('public') || lower.includes('retail')) return 'retail';
  return null;
}

async function fetchDynamicShareholding(symbol: string): Promise<ShareholdingSnapshot | null> {
  const cacheKey = `sh:${symbol}`;
  const cached = shareholdingCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SHAREHOLDING_CACHE_TTL) return cached.data;

  // Try Upstox API first
  try {
    const storedToken = await getUpstoxToken();
    if (storedToken) {
      const instrumentKey = getInstrumentKey(symbol);
      if (instrumentKey) {
        const isin = instrumentKey.split('|')[1];
        if (isin) {
          const res = await fetch(`https://api.upstox.com/v2/fundamentals/${isin}/share-holdings`, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${storedToken.accessToken}` },
          });
          if (res.ok) {
            const json = await res.json();
            if (json.status === 'success' && Array.isArray(json.data)) {
              const snapshot: ShareholdingSnapshot = { promoter: 0, mutualFund: 0, dii: 0, retail: 0 };
              for (const cat of json.data) {
                const field = mapUpstoxCat(cat.category);
                if (field && Array.isArray(cat.history) && cat.history.length > 0) {
                  // Latest period's value
                  const latest = cat.history.sort((a: any, b: any) =>
                    new Date(b.period).getTime() - new Date(a.period).getTime()
                  )[0];
                  snapshot[field] += latest.value;
                }
              }
              if (snapshot.promoter > 0 || snapshot.mutualFund > 0) {
                shareholdingCache.set(cacheKey, { data: snapshot, ts: Date.now() });
                return snapshot;
              }
            }
          }
        }
      }
    }
  } catch {
    // Fall through to local data
  }

  // Fallback: local static data
  const local = getLatestShareholding(symbol);
  if (local) {
    const snapshot: ShareholdingSnapshot = {
      promoter: local.promoter,
      mutualFund: local.mutualFund,
      dii: local.dii,
      retail: local.retail,
    };
    shareholdingCache.set(cacheKey, { data: snapshot, ts: Date.now() });
    return snapshot;
  }

  shareholdingCache.set(cacheKey, { data: null, ts: Date.now() });
  return null;
}

// ─── Compute extended technicals for strategy screening ─────────────
interface ScreenData {
  symbol: string;
  price: number;
  ohlcv: OHLCV[];
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  rsi: number;
  ema10: number;
  ema20: number;
  ema50: number;
  macdLine: number;
  signalLine: number;
  histogram: number;
  prevHistogram: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbWidth: number;
  volumeRatio: number;
  avgVolume: number;
  high52W: number;
  low52W: number;
  priceChange1D: number;
  priceChange5D: number;
  dayHigh: number;
  dayLow: number;
  fundamentals: RealFundamentals | null;
  // Shareholding data
  promoterHolding: number;
  mutualFundHolding: number;
  diiHolding: number;
  retailHolding: number;
  // Multi-timeframe returns
  return6M: number;  // 6-month return %
  return1Y: number;  // 1-year return %
}

async function computeScreenData(symbol: string): Promise<ScreenData | null> {
  try {
    const ohlcv = await fetchHistoricalOHLCV(symbol, 250); // ~1 year for 52W high/low
    if (ohlcv.length < 30) return null;

    const closes = ohlcv.map(c => c.close);
    const highs = ohlcv.map(c => c.high);
    const lows = ohlcv.map(c => c.low);
    const volumes = ohlcv.map(c => c.volume);

    const price = closes[closes.length - 1];
    const prevClose = closes.length >= 2 ? closes[closes.length - 2] : price;
    const close5DAgo = closes.length >= 6 ? closes[closes.length - 6] : price;

    const rsi = calculateRSI(closes, 14);
    const ema10Arr = calculateEMA(closes, 10);
    const ema20Arr = calculateEMA(closes, 20);
    const ema50Arr = calculateEMA(closes, 50);

    const ema10 = ema10Arr.length > 0 ? ema10Arr[ema10Arr.length - 1] : price;
    const ema20 = ema20Arr.length > 0 ? ema20Arr[ema20Arr.length - 1] : price;
    const ema50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : price;

    const macdResult = calculateMACD(closes);
    const macdLine = macdResult?.macdLine ?? 0;
    const signalLine = macdResult?.signalLine ?? 0;
    const histogram = macdResult?.histogram ?? 0;

    // Compute previous histogram for crossover detection
    let prevHistogram = 0;
    if (closes.length > 35) {
      const prevCloses = closes.slice(0, -1);
      const prevMacd = calculateMACD(prevCloses);
      prevHistogram = prevMacd?.histogram ?? 0;
    }

    const bb = calculateBollingerBands(closes, 20, 2);
    const volProfile = calculateVolumeProfile(volumes);

    const screenData: ScreenData = {
      symbol,
      price: parseFloat(price.toFixed(2)),
      ohlcv,
      closes,
      highs,
      lows,
      volumes,
      rsi,
      ema10: parseFloat(ema10.toFixed(2)),
      ema20: parseFloat(ema20.toFixed(2)),
      ema50: parseFloat(ema50.toFixed(2)),
      macdLine,
      signalLine,
      histogram,
      prevHistogram,
      bbUpper: bb?.upper ?? price * 1.02,
      bbMiddle: bb?.middle ?? price,
      bbLower: bb?.lower ?? price * 0.98,
      bbWidth: bb?.width ?? 4,
      volumeRatio: volProfile.ratio,
      avgVolume: volProfile.avgVolume,
      high52W: Math.max(...highs),
      low52W: Math.min(...lows),
      priceChange1D: prevClose > 0 ? parseFloat((((price - prevClose) / prevClose) * 100).toFixed(2)) : 0,
      priceChange5D: close5DAgo > 0 ? parseFloat((((price - close5DAgo) / close5DAgo) * 100).toFixed(2)) : 0,
      dayHigh: highs[highs.length - 1],
      dayLow: lows[lows.length - 1],
      fundamentals: null,
      promoterHolding: 0,
      mutualFundHolding: 0,
      diiHolding: 0,
      retailHolding: 0,
      return6M: 0,
      return1Y: 0,
    };

    // Populate shareholding: try Upstox API, then fall back to local static data
    const sh = await fetchDynamicShareholding(symbol);
    if (sh) {
      screenData.promoterHolding = sh.promoter;
      screenData.mutualFundHolding = sh.mutualFund;
      screenData.diiHolding = sh.dii;
      screenData.retailHolding = sh.retail;
    }

    // Compute multi-timeframe returns
    const len = closes.length;
    if (len >= 126) {
      screenData.return6M = ((price - closes[len - 126]) / closes[len - 126]) * 100;
    }
    if (len >= 250) {
      screenData.return1Y = ((price - closes[0]) / closes[0]) * 100;
    } else if (len >= 200) {
      screenData.return1Y = ((price - closes[0]) / closes[0]) * 100;
    }

    return screenData;
  } catch {
    return null;
  }
}

// ─── Strategy Filter Functions ──────────────────────────────────────

interface StrategyMatch {
  symbol: string;
  price: number;
  entry: number;
  target: number;
  stopLoss: number;
  signalStrength: number; // 0-100
  signals: string[];
  fundamentals?: RealFundamentals;
}

// Strategy 1: EMA Crossover Momentum
function screenEMACrossover(data: ScreenData): StrategyMatch | null {
  const { symbol, price, ema20, ema50, volumeRatio, rsi, priceChange1D } = data;
  if (ema20 <= ema50) return null; // EMA20 must be above EMA50 (golden cross)
  if (price < ema20) return null;  // Price must be above EMA20
  if (volumeRatio < 1.2) return null; // Volume confirmation
  if (rsi > 75) return null; // Not overbought

  const signals: string[] = [];
  let strength = 50;
  
  if (ema20 > ema50 * 1.01) { signals.push('EMA20 > EMA50 (Golden Cross)'); strength += 15; }
  if (price > ema20) { signals.push(`Price ₹${price} above EMA20 ₹${ema20}`); strength += 10; }
  if (volumeRatio > 1.5) { signals.push(`Volume ${volumeRatio}x avg (strong)`); strength += 15; }
  if (priceChange1D > 0) { signals.push(`Today +${priceChange1D}%`); strength += 10; }

  const atr = data.dayHigh - data.dayLow;
  return {
    symbol, price,
    entry: price,
    target: parseFloat((price + atr * 3).toFixed(2)),
    stopLoss: parseFloat((Math.min(ema20, price - atr * 1.5)).toFixed(2)),
    signalStrength: Math.min(100, strength),
    signals,
  };
}

// Strategy 2: RSI Reversal Hunter
function screenRSIReversal(data: ScreenData): StrategyMatch | null {
  const { symbol, price, rsi, bbLower, bbMiddle, volumeRatio } = data;
  if (rsi > 35) return null; // Must be oversold zone
  if (price > bbLower * 1.02) return null; // Must be near or below lower Bollinger

  const signals: string[] = [];
  let strength = 55;
  
  signals.push(`RSI ${rsi} (Oversold)`);
  if (rsi < 25) strength += 15;
  
  if (price <= bbLower) { signals.push('Price at/below Lower Bollinger'); strength += 15; }
  else { signals.push('Price near Lower Bollinger'); strength += 10; }
  
  if (volumeRatio > 1.5) { signals.push(`High volume ${volumeRatio}x (capitulation)`); strength += 10; }

  return {
    symbol, price,
    entry: price,
    target: parseFloat(bbMiddle.toFixed(2)),
    stopLoss: parseFloat((price * 0.97).toFixed(2)),
    signalStrength: Math.min(100, strength),
    signals,
  };
}

// Strategy 3: Confluence Pullback
function screenConfluencePullback(data: ScreenData): StrategyMatch | null {
  const { symbol, price, ema50, rsi, volumeRatio, ema20 } = data;
  if (price < ema50) return null; // Must be in uptrend (above EMA50)
  if (rsi < 38 || rsi > 58) return null; // RSI in pullback zone (40-55ish)
  if (price > ema20 * 1.02) return null; // Price must have pulled back near EMA20

  const signals: string[] = [];
  let strength = 50;

  signals.push(`Price above EMA50 ₹${ema50} (uptrend intact)`);
  strength += 15;
  
  signals.push(`RSI ${rsi} (healthy pullback zone)`);
  if (rsi >= 40 && rsi <= 50) strength += 15;
  else strength += 10;

  if (Math.abs(price - ema20) / ema20 < 0.015) {
    signals.push('Price touching EMA20 support');
    strength += 15;
  }

  if (volumeRatio < 0.8) {
    signals.push('Low volume pullback (healthy)');
    strength += 10;
  }

  const atr = data.dayHigh - data.dayLow;
  return {
    symbol, price,
    entry: parseFloat(ema20.toFixed(2)),
    target: parseFloat((price + atr * 3).toFixed(2)),
    stopLoss: parseFloat((ema50 * 0.99).toFixed(2)),
    signalStrength: Math.min(100, strength),
    signals,
  };
}

// Strategy 4: Bollinger Squeeze Breakout
function screenBollingerSqueeze(data: ScreenData): StrategyMatch | null {
  const { symbol, price, bbWidth, bbUpper, bbMiddle, volumeRatio, rsi } = data;
  if (bbWidth > 6) return null; // Bandwidth must be tight (squeeze)
  if (price < bbUpper * 0.99) return null; // Price must be breaking upper band
  if (volumeRatio < 1.3) return null; // Volume confirmation

  const signals: string[] = [];
  let strength = 55;

  signals.push(`Bollinger Width ${bbWidth}% (squeeze)`);
  if (bbWidth < 4) strength += 15;
  else strength += 10;

  if (price >= bbUpper) { signals.push('Price breaking above Upper Band'); strength += 15; }
  if (volumeRatio > 1.5) { signals.push(`Volume ${volumeRatio}x (breakout confirmed)`); strength += 15; }
  else { signals.push(`Volume ${volumeRatio}x avg`); strength += 10; }
  
  if (rsi > 55 && rsi < 75) { signals.push(`RSI ${rsi} (momentum)`); strength += 5; }

  const expansion = (bbUpper - bbMiddle) * 2;
  return {
    symbol, price,
    entry: price,
    target: parseFloat((price + expansion).toFixed(2)),
    stopLoss: parseFloat(bbMiddle.toFixed(2)),
    signalStrength: Math.min(100, strength),
    signals,
  };
}

// Strategy 5: Volume Climax Reversal
function screenVolumeClimax(data: ScreenData): StrategyMatch | null {
  const { symbol, price, volumeRatio, rsi, dayLow, dayHigh, closes } = data;
  if (volumeRatio < 2.5) return null; // Must have extreme volume
  if (rsi > 40) return null; // Must be in weakness zone

  // Check for hammer candle (long lower wick)
  const bodySize = Math.abs(price - (closes.length >= 2 ? closes[closes.length - 2] : price));
  const lowerWick = Math.min(price, closes.length >= 2 ? closes[closes.length - 2] : price) - dayLow;
  const isHammer = lowerWick > bodySize * 1.5;

  if (!isHammer && price >= closes[closes.length - 2]) return null;

  const signals: string[] = [];
  let strength = 55;

  signals.push(`Volume ${volumeRatio}x avg (climax)`);
  strength += volumeRatio > 3 ? 20 : 10;

  signals.push(`RSI ${rsi} (oversold zone)`);
  if (rsi < 30) strength += 10;

  if (isHammer) { signals.push('Hammer candle pattern detected'); strength += 15; }

  const atr = dayHigh - dayLow;
  return {
    symbol, price,
    entry: price,
    target: parseFloat((price + atr * 2.5).toFixed(2)),
    stopLoss: parseFloat((dayLow * 0.99).toFixed(2)),
    signalStrength: Math.min(100, strength),
    signals,
  };
}

// Strategy 6: MACD Zero-Line Crossover
function screenMACDZeroCross(data: ScreenData): StrategyMatch | null {
  const { symbol, price, macdLine, histogram, prevHistogram, ema20, volumeRatio } = data;
  
  // MACD must be crossing above zero or just crossed
  if (macdLine < -0.5) return null; // Must be near or above zero line
  if (histogram <= 0) return null; // Histogram must be positive

  // Check for recent crossover: prev histogram was negative, now positive
  const justCrossed = prevHistogram <= 0 && histogram > 0;
  if (!justCrossed && macdLine > 2) return null; // If didn't just cross, must be near zero

  const signals: string[] = [];
  let strength = 50;

  if (justCrossed) { signals.push('MACD just crossed above zero line'); strength += 20; }
  else { signals.push(`MACD near zero (${data.macdLine.toFixed(2)})`); strength += 10; }

  signals.push(`Histogram +${histogram.toFixed(3)} (turning positive)`);
  strength += 10;

  if (price > ema20) { signals.push(`Price above EMA20 ₹${ema20}`); strength += 10; }
  if (volumeRatio > 1.2) { signals.push(`Volume ${volumeRatio}x avg`); strength += 10; }

  const atr = data.dayHigh - data.dayLow;
  return {
    symbol, price,
    entry: price,
    target: parseFloat((price + atr * 3).toFixed(2)),
    stopLoss: parseFloat((price - atr * 2).toFixed(2)),
    signalStrength: Math.min(100, strength),
    signals,
  };
}

// Strategy 7: 52-Week High Breakout
function screen52WeekHigh(data: ScreenData): StrategyMatch | null {
  const { symbol, price, high52W, volumeRatio, rsi } = data;
  
  const distFromHigh = ((high52W - price) / high52W) * 100;
  if (distFromHigh > 5) return null; // Must be within 5% of 52W high
  if (rsi < 50 || rsi > 80) return null; // RSI in momentum zone but not extreme
  if (volumeRatio < 1.2) return null;

  const signals: string[] = [];
  let strength = 55;

  if (distFromHigh < 1) { signals.push(`At 52W High ₹${high52W} 🔥`); strength += 20; }
  else { signals.push(`${distFromHigh.toFixed(1)}% from 52W High ₹${high52W}`); strength += 10; }

  if (volumeRatio > 1.5) { signals.push(`Volume ${volumeRatio}x (breakout volume)`); strength += 15; }
  else { signals.push(`Volume ${volumeRatio}x avg`); strength += 5; }

  signals.push(`RSI ${rsi} (strong momentum)`);
  if (rsi >= 60 && rsi <= 75) strength += 10;

  return {
    symbol, price,
    entry: price,
    target: parseFloat((high52W * 1.08).toFixed(2)),
    stopLoss: parseFloat((high52W * 0.95).toFixed(2)),
    signalStrength: Math.min(100, strength),
    signals,
  };
}

// Strategy 8: Moving Average Ribbon Trend
function screenMARibbon(data: ScreenData): StrategyMatch | null {
  const { symbol, price, ema10, ema20, ema50, volumeRatio, rsi } = data;

  // Perfect ribbon: EMA10 > EMA20 > EMA50, all rising
  if (!(ema10 > ema20 && ema20 > ema50)) return null;
  if (price < ema10) return null; // Price above all EMAs
  if (rsi < 45 || rsi > 78) return null;

  const signals: string[] = [];
  let strength = 60;

  signals.push(`EMA Ribbon: ₹${ema10} > ₹${ema20} > ₹${ema50}`);
  strength += 15;

  signals.push(`Price ₹${price} above all EMAs`);
  
  // Check if EMAs are well separated (strong trend)
  const ema10_20_gap = ((ema10 - ema20) / ema20) * 100;
  if (ema10_20_gap > 1) { signals.push(`EMAs well-separated (${ema10_20_gap.toFixed(1)}% gap)`); strength += 10; }

  if (volumeRatio > 1.2) { signals.push(`Volume ${volumeRatio}x avg`); strength += 5; }
  if (rsi >= 55 && rsi <= 70) { signals.push(`RSI ${rsi} (healthy momentum)`); strength += 5; }

  const atr = data.dayHigh - data.dayLow;
  return {
    symbol, price,
    entry: price,
    target: parseFloat((price + atr * 4).toFixed(2)),
    stopLoss: parseFloat(ema20.toFixed(2)),
    signalStrength: Math.min(100, strength),
    signals,
  };
}

// Strategy 9: Oversold Quality Value (REAL Yahoo Finance fundamentals)
async function screenOversoldQuality(data: ScreenData): Promise<StrategyMatch | null> {
  const { symbol, price, rsi, priceChange5D } = data;
  
  if (rsi > 38) return null; // Must be oversold (fast technical pre-filter)
  if (priceChange5D > -2) return null; // Must have dropped recently

  // Fetch real fundamentals from Yahoo Finance (only for stocks that pass technical filters)
  const fundamentals = await fetchRealFundamentals(symbol);
  if (!fundamentals) return null; // Skip if no fundamental data available
  if (fundamentals.roe < 14) return null; // Quality filter: ROE > 14%
  if (fundamentals.debtToEquity > 1.0) return null; // Low debt

  const signals: string[] = [];
  let strength = 55;

  signals.push(`RSI ${rsi} (oversold quality stock)`);
  if (rsi < 28) strength += 15;
  else strength += 10;

  signals.push(`ROE ${fundamentals.roe}% (Yahoo Finance)`);
  if (fundamentals.roe > 20) strength += 15;
  else strength += 10;

  signals.push(`D/E ${fundamentals.debtToEquity} (low leverage)`);
  strength += 5;

  signals.push(`Dropped ${priceChange5D.toFixed(1)}% in 5 days`);
  if (priceChange5D < -5) strength += 10;
  else strength += 5;

  if (fundamentals.profitMargin > 10) {
    signals.push(`Profit Margin ${fundamentals.profitMargin}%`);
    strength += 5;
  }

  if (fundamentals.currentRatio > 1.5) {
    signals.push(`Current Ratio ${fundamentals.currentRatio} (strong)`);
    strength += 5;
  }

  return {
    symbol, price,
    entry: price,
    target: parseFloat((price * 1.08).toFixed(2)),
    stopLoss: parseFloat((price * 0.95).toFixed(2)),
    signalStrength: Math.min(100, strength),
    signals,
    fundamentals,
  };
}

// Strategy 10: Institutional Accumulation (Pure volume + price action, NO mock data)
function screenInstitutionalAccumulation(data: ScreenData): StrategyMatch | null {
  const { symbol, price, volumeRatio, priceChange1D, ema20, rsi, volumes, closes } = data;
  
  if (volumeRatio < 1.8) return null; // Must have significant volume surge
  if (priceChange1D < 0.3) return null; // Price must be moving up
  if (price < ema20) return null; // Must be above EMA20

  // ── Multi-day accumulation detection (real volume analysis) ──
  // Check if volume has been consistently above average for 3+ of last 5 days
  const recentVolumes = volumes.slice(-5);
  const avgVol20 = data.avgVolume;
  const daysAboveAvg = recentVolumes.filter(v => v > avgVol20 * 1.2).length;
  if (daysAboveAvg < 2) return null; // Need sustained volume, not just 1-day spike

  // ── Price trending up on volume (accumulation signature) ──
  const recentCloses = closes.slice(-5);
  const priceGainingDays = recentCloses.filter((c, i) =>
    i > 0 && c > recentCloses[i - 1]
  ).length;
  if (priceGainingDays < 2) return null; // Price must be rising on the volume

  const signals: string[] = [];
  let strength = 55;

  signals.push(`Volume surge ${volumeRatio}x avg (today)`);
  if (volumeRatio > 2.5) strength += 20;
  else strength += 10;

  signals.push(`${daysAboveAvg}/5 days above-avg volume (sustained)`);
  if (daysAboveAvg >= 4) strength += 15;
  else strength += 10;

  signals.push(`Price +${priceChange1D}% with ${priceGainingDays}/4 up-days`);
  strength += 10;

  if (price > ema20) { signals.push(`Above EMA20 ₹${ema20}`); strength += 5; }
  if (rsi > 50 && rsi < 70) { signals.push(`RSI ${rsi} (momentum without exhaustion)`); strength += 5; }

  const atr = data.dayHigh - data.dayLow;
  return {
    symbol, price,
    entry: price,
    target: parseFloat((price + atr * 3).toFixed(2)),
    stopLoss: parseFloat((ema20 * 0.98).toFixed(2)),
    signalStrength: Math.min(100, strength),
    signals,
  };
}

// ─── Strategy 11: Promoter Conviction Uptrend ──────────────────────
function screenPromoterConviction(data: ScreenData): StrategyMatch | null {
  const { symbol, price, promoterHolding, mutualFundHolding, return6M, return1Y, ema50 } = data;

  // Must have shareholding data
  if (promoterHolding <= 0) return null;

  const signals: string[] = [];
  let score = 0;

  // Rule 1: Promoter > 65%
  if (promoterHolding >= 65) { score += 25; signals.push(`Promoter: ${promoterHolding.toFixed(1)}% (>65%)`); }
  else return null;

  // Rule 2: MF > 10%
  if (mutualFundHolding >= 10) { score += 20; signals.push(`MF Holding: ${mutualFundHolding.toFixed(1)}% (>10%)`); }
  else if (mutualFundHolding >= 7) { score += 10; signals.push(`MF Holding: ${mutualFundHolding.toFixed(1)}% (near 10%)`); }
  else return null;

  // Rule 3: 6M return positive
  if (return6M > 0) { score += 20; signals.push(`6M Return: +${return6M.toFixed(1)}%`); }
  else return null;

  // Rule 4: 1Y return positive
  if (return1Y > 0) { score += 15; signals.push(`1Y Return: +${return1Y.toFixed(1)}%`); }
  else return null;

  // Rule 5: Price above EMA 50
  if (price > ema50) { score += 20; signals.push(`Price ₹${price} > EMA50 ₹${ema50}`); }
  else return null;

  return {
    symbol,
    price,
    entry: price,
    target: parseFloat((price * 1.08).toFixed(2)),
    stopLoss: parseFloat((price * 0.96).toFixed(2)),
    signalStrength: Math.min(100, score),
    signals,
  };
}

// ─── Strategy 12: Smart Money Momentum ─────────────────────────────
function screenSmartMoneyMomentum(data: ScreenData): StrategyMatch | null {
  const { symbol, price, mutualFundHolding, diiHolding, rsi, ema20, ema50, volumeRatio } = data;

  const signals: string[] = [];
  let score = 0;

  // Rule 1: MF > 8%
  if (mutualFundHolding >= 8) { score += 20; signals.push(`MF Holding: ${mutualFundHolding.toFixed(1)}% (>8%)`); }
  else return null;

  // Rule 2: DII > 15%
  if (diiHolding >= 15) { score += 20; signals.push(`DII Holding: ${diiHolding.toFixed(1)}% (>15%)`); }
  else return null;

  // Rule 3: RSI 50-75
  if (rsi >= 50 && rsi <= 75) { score += 20; signals.push(`RSI: ${rsi.toFixed(1)} (momentum zone)`); }
  else return null;

  // Rule 4: EMA 20 > EMA 50
  if (ema20 > ema50) { score += 20; signals.push(`EMA20 ₹${ema20} > EMA50 ₹${ema50} (uptrend)`); }
  else return null;

  // Rule 5: Volume > 1.0x average
  if (volumeRatio >= 1.0) { score += 20; signals.push(`Volume: ${volumeRatio.toFixed(2)}x avg`); }
  else { score += 5; signals.push(`Volume: ${volumeRatio.toFixed(2)}x avg (below avg)`); }

  return {
    symbol,
    price,
    entry: price,
    target: parseFloat((price * 1.06).toFixed(2)),
    stopLoss: parseFloat((price * 0.97).toFixed(2)),
    signalStrength: Math.min(100, score),
    signals,
  };
}

// ─── Strategy 13: High Promoter Breakout ────────────────────────────
function screenHighPromoterBreakout(data: ScreenData): StrategyMatch | null {
  const { symbol, price, promoterHolding, high52W, rsi, volumeRatio, bbWidth } = data;

  // Must have shareholding data
  if (promoterHolding <= 0) return null;

  const signals: string[] = [];
  let score = 0;
  const distFrom52W = ((high52W - price) / high52W) * 100;

  // Rule 1: Promoter > 55%
  if (promoterHolding >= 55) { score += 20; signals.push(`Promoter: ${promoterHolding.toFixed(1)}% (>55%)`); }
  else return null;

  // Rule 2: Within 8% of 52W high
  if (distFrom52W <= 8) { score += 25; signals.push(`${distFrom52W.toFixed(1)}% from 52W High ₹${high52W.toFixed(0)}`); }
  else return null;

  // Rule 3: RSI 55-80
  if (rsi >= 55 && rsi <= 80) { score += 20; signals.push(`RSI: ${rsi.toFixed(1)} (strong momentum)`); }
  else return null;

  // Rule 4: Volume > 1.2x
  if (volumeRatio >= 1.2) { score += 20; signals.push(`Volume: ${volumeRatio.toFixed(2)}x avg (breakout)`); }
  else return null;

  // Rule 5: BB Width < 12%
  if (bbWidth < 12) { score += 15; signals.push(`BB Width: ${bbWidth.toFixed(1)}% (consolidation)`); }
  else { score += 5; signals.push(`BB Width: ${bbWidth.toFixed(1)}%`); }

  return {
    symbol,
    price,
    entry: price,
    target: parseFloat((high52W * 1.05).toFixed(2)),
    stopLoss: parseFloat((price * 0.95).toFixed(2)),
    signalStrength: Math.min(100, score),
    signals,
  };
}
// ─── Strategy 14: Evergreen Compounder ──────────────────────────────
// Async because it needs to fetch 5Y and all-time OHLCV separately
async function screenEvergreenCompounder(data: ScreenData): Promise<StrategyMatch | null> {
  const { symbol, price, promoterHolding, mutualFundHolding, return6M, return1Y } = data;

  // Must have shareholding data
  if (promoterHolding <= 0) return null;

  const signals: string[] = [];
  let score = 0;

  // Rule 1: Promoter > 65%
  if (promoterHolding >= 65) { score += 15; signals.push(`Promoter: ${promoterHolding.toFixed(1)}% (>65%)`); }
  else return null;

  // Rule 2: MF > 10%
  if (mutualFundHolding >= 10) { score += 15; signals.push(`MF Holding: ${mutualFundHolding.toFixed(1)}% (>10%)`); }
  else return null;

  // Rule 3: 6M return positive
  if (return6M > 0) { score += 15; signals.push(`6M Return: +${return6M.toFixed(1)}%`); }
  else return null;

  // Rule 4: 1Y return positive
  if (return1Y > 0) { score += 15; signals.push(`1Y Return: +${return1Y.toFixed(1)}%`); }
  else return null;

  // Rule 5: 5Y return positive (fetch 5-year data)
  try {
    const ohlcv5Y = await fetchHistoricalOHLCV(symbol, 1260); // ~5 years
    if (ohlcv5Y.length >= 1000) {
      const oldPrice5Y = ohlcv5Y[0].close;
      const ret5Y = ((price - oldPrice5Y) / oldPrice5Y) * 100;
      if (ret5Y > 0) { score += 20; signals.push(`5Y Return: +${ret5Y.toFixed(1)}%`); }
      else return null;
    } else if (ohlcv5Y.length >= 500) {
      // Less than 5Y data but at least ~2Y — use what's available
      const oldPrice = ohlcv5Y[0].close;
      const retAvail = ((price - oldPrice) / oldPrice) * 100;
      const years = (ohlcv5Y.length / 252).toFixed(1);
      if (retAvail > 0) { score += 15; signals.push(`${years}Y Return: +${retAvail.toFixed(1)}%`); }
      else return null;
    } else {
      return null; // Not enough history
    }
  } catch {
    return null;
  }

  // Rule 6: All-Time return positive (fetch max data)
  try {
    const ohlcvMax = await fetchHistoricalOHLCV(symbol, 9999); // range=max
    if (ohlcvMax.length >= 1260) {
      const ipo = ohlcvMax[0].close;
      const retAllTime = ((price - ipo) / ipo) * 100;
      if (retAllTime > 0) { score += 20; signals.push(`All-Time Return: +${retAllTime.toFixed(0)}% (since ${ohlcvMax[0].date})`); }
      else return null;
    } else {
      // If max data is same as 5Y data, skip duplicate check
      score += 10; signals.push(`All-Time: limited history available`);
    }
  } catch {
    score += 5; signals.push(`All-Time: data unavailable`);
  }

  return {
    symbol,
    price,
    entry: price,
    target: parseFloat((price * 1.10).toFixed(2)),
    stopLoss: parseFloat((price * 0.95).toFixed(2)),
    signalStrength: Math.min(100, score),
    signals,
  };
}

// ─── Strategy dispatcher ────────────────────────────────────────────
// Strategy 9 is async (fetches real fundamentals), others are sync
const SYNC_STRATEGY_FILTERS: Record<number, (data: ScreenData) => StrategyMatch | null> = {
  1: screenEMACrossover,
  2: screenRSIReversal,
  3: screenConfluencePullback,
  4: screenBollingerSqueeze,
  5: screenVolumeClimax,
  6: screenMACDZeroCross,
  7: screen52WeekHigh,
  8: screenMARibbon,
  10: screenInstitutionalAccumulation,
  11: screenPromoterConviction,
  12: screenSmartMoneyMomentum,
  13: screenHighPromoterBreakout,
};

const ASYNC_STRATEGY_FILTERS: Record<number, (data: ScreenData) => Promise<StrategyMatch | null>> = {
  9: screenOversoldQuality,
  14: screenEvergreenCompounder,
};

function getFilterFn(id: number): ((data: ScreenData) => StrategyMatch | null | Promise<StrategyMatch | null>) | null {
  return SYNC_STRATEGY_FILTERS[id] ?? ASYNC_STRATEGY_FILTERS[id] ?? null;
}

// ─── Main API Handler ───────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const strategyId = parseInt(searchParams.get('strategy') || '0');
  const forceRescan = searchParams.get('force') === 'true';

  if (strategyId < 1 || strategyId > 14) {
    return NextResponse.json(
      { error: 'Invalid strategy ID. Must be 1-14.' },
      { status: 400 }
    );
  }

  // ── If NOT force rescan, try DB cache first, then in-memory ──
  if (!forceRescan) {
    // Try in-memory cache
    const cacheKey = `strategy:${strategyId}`;
    const memCached = strategyCache.get(cacheKey);
    if (memCached && Date.now() - memCached.ts < STRATEGY_CACHE_TTL) {
      return NextResponse.json({ ...memCached.data, cached: true, cacheSource: 'memory' });
    }

    // Try DB cache
    try {
      const db = getServiceClient();
      const { data: dbRow } = await db
        .from('strategy_cache')
        .select('*')
        .eq('strategy_id', strategyId)
        .single();

      if (dbRow && dbRow.matches) {
        const response = {
          strategyId: dbRow.strategy_id,
          matches: dbRow.matches,
          totalScanned: dbRow.total_scanned,
          matchCount: dbRow.match_count,
          scanTime: dbRow.scan_time,
          cached: true,
          cacheSource: 'database',
        };
        // Also populate in-memory cache
        strategyCache.set(cacheKey, { data: response, ts: Date.now() });
        return NextResponse.json(response);
      }
    } catch (dbErr) {
      console.warn('[Strategy Screen] DB cache read failed:', dbErr);
    }
  }

  // ── Fresh scan ──
  const filterFn = getFilterFn(strategyId);
  if (!filterFn) {
    return NextResponse.json({ error: 'Strategy filter not found' }, { status: 500 });
  }

  try {
    const matches: StrategyMatch[] = [];
    const errors: string[] = [];
    const batchSize = 8;

    // Process stocks in batches of 8 to avoid rate limiting
    for (let i = 0; i < SCREEN_STOCKS.length; i += batchSize) {
      const batch = SCREEN_STOCKS.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const data = await computeScreenData(symbol);
            if (!data) return null;
            return await filterFn(data);
          } catch (err: any) {
            errors.push(`${symbol}: ${err.message}`);
            return null;
          }
        })
      );

      results.forEach((r) => { if (r) matches.push(r); });
    }

    // Sort by signal strength descending
    matches.sort((a, b) => b.signalStrength - a.signalStrength);

    const response = {
      strategyId,
      matches,
      totalScanned: SCREEN_STOCKS.length,
      matchCount: matches.length,
      scanTime: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined,
    };

    // Cache in-memory
    const cacheKey = `strategy:${strategyId}`;
    strategyCache.set(cacheKey, { data: response, ts: Date.now() });

    // Cache in DB (upsert)
    try {
      const db = getServiceClient();
      await db.from('strategy_cache').upsert({
        strategy_id: strategyId,
        matches: matches,
        total_scanned: SCREEN_STOCKS.length,
        match_count: matches.length,
        scan_time: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'strategy_id' });
    } catch (dbErr) {
      console.warn('[Strategy Screen] DB cache write failed:', dbErr);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`[Strategy Screen] Error for strategy ${strategyId}:`, error);
    return NextResponse.json(
      { error: error.message || 'Strategy screen failed' },
      { status: 500 }
    );
  }
}
