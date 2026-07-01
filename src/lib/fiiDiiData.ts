// FII/DII (Foreign & Domestic Institutional Investor) Flow Data
// Fetches daily institutional flow data — the single most powerful signal for Indian markets.
// Source: NSE India website (publicly available data)

import { getServiceClient } from './supabase';

export interface FIIDIIFlow {
  date: string;           // YYYY-MM-DD
  fiiBuy: number;         // ₹ Crores
  fiiSell: number;
  fiiNet: number;
  diiBuy: number;
  diiSell: number;
  diiNet: number;
}

// ─── Fetch FII/DII from NSE India ────────────────────────────────────

async function fetchFromNSE(): Promise<FIIDIIFlow | null> {
  try {
    // NSE requires cookies from its base page first
    const baseHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    const baseRes = await fetch('https://www.nseindia.com', { headers: baseHeaders });
    const cookies = baseRes.headers.get('set-cookie');

    // Fetch the FII/DII data with the cookies
    const res = await fetch('https://www.nseindia.com/api/fiidiiTradeReact', {
      headers: {
        ...baseHeaders,
        'Cookie': cookies || '',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com/',
      },
      next: { revalidate: 1800 }, // cache 30 min
    });

    if (!res.ok) {
      console.warn(`[FII/DII] NSE API returned ${res.status}`);
      return null;
    }

    const data = await res.json();

    // NSE returns FII/DII data in a structured format
    // The response contains arrays for FII and DII activity
    let fiiData: any = null;
    let diiData: any = null;

    if (Array.isArray(data)) {
      fiiData = data.find((item: any) =>
        item.category?.toUpperCase().includes('FII') ||
        item.category?.toUpperCase().includes('FPI')
      );
      diiData = data.find((item: any) =>
        item.category?.toUpperCase().includes('DII')
      );
    } else if (data.fpiData || data.diiData) {
      // Alternative response format
      fiiData = data.fpiData;
      diiData = data.diiData;
    }

    if (!fiiData && !diiData) {
      console.warn('[FII/DII] Could not parse NSE response structure');
      return null;
    }

    const parseCr = (val: any): number => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        return parseFloat(val.replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
      }
      return 0;
    };

    const fiiBuy = parseCr(fiiData?.buyValue ?? fiiData?.buyvalue ?? 0);
    const fiiSell = parseCr(fiiData?.sellValue ?? fiiData?.sellvalue ?? 0);
    const diiBuy = parseCr(diiData?.buyValue ?? diiData?.buyvalue ?? 0);
    const diiSell = parseCr(diiData?.sellValue ?? diiData?.sellvalue ?? 0);

    return {
      date: new Date().toISOString().split('T')[0],
      fiiBuy,
      fiiSell,
      fiiNet: parseFloat((fiiBuy - fiiSell).toFixed(2)),
      diiBuy,
      diiSell,
      diiNet: parseFloat((diiBuy - diiSell).toFixed(2)),
    };
  } catch (error) {
    console.warn('[FII/DII] NSE fetch failed:', error);
    return null;
  }
}

// ─── Fallback: Scrape from MoneyControl ──────────────────────────────

async function fetchFromMoneyControl(): Promise<FIIDIIFlow | null> {
  try {
    const res = await fetch(
      'https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/home.php',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        next: { revalidate: 1800 },
      }
    );

    if (!res.ok) return null;

    const html = await res.text();

    // Parse FII/DII values from the MoneyControl HTML
    // The table contains gross purchase, gross sales, net values
    const extractValue = (pattern: RegExp): number => {
      const match = html.match(pattern);
      if (!match) return 0;
      return parseFloat(match[1].replace(/,/g, '')) || 0;
    };

    // MoneyControl renders FII/DII in a table — we look for the specific row patterns
    // This is fragile but serves as a fallback
    const fiiNetMatch = html.match(/FII[^<]*<[^>]*>[^<]*<[^>]*>[^<]*<[^>]*>([-\d,.]+)/i);
    const diiNetMatch = html.match(/DII[^<]*<[^>]*>[^<]*<[^>]*>[^<]*<[^>]*>([-\d,.]+)/i);

    if (!fiiNetMatch && !diiNetMatch) return null;

    const fiiNet = fiiNetMatch ? parseFloat(fiiNetMatch[1].replace(/,/g, '')) : 0;
    const diiNet = diiNetMatch ? parseFloat(diiNetMatch[1].replace(/,/g, '')) : 0;

    return {
      date: new Date().toISOString().split('T')[0],
      fiiBuy: 0, // MoneyControl may not expose gross values easily
      fiiSell: 0,
      fiiNet,
      diiBuy: 0,
      diiSell: 0,
      diiNet,
    };
  } catch {
    return null;
  }
}

// ─── Main fetch function with fallback chain ─────────────────────────

export async function fetchFIIDIIFlows(): Promise<FIIDIIFlow | null> {
  // Try NSE first (primary source)
  let data = await fetchFromNSE();
  if (data && (data.fiiNet !== 0 || data.diiNet !== 0)) {
    return data;
  }

  // Fallback to MoneyControl
  data = await fetchFromMoneyControl();
  if (data) {
    return data;
  }

  return null;
}

// ─── Save to Supabase ────────────────────────────────────────────────

export async function saveFIIDIIFlows(flow: FIIDIIFlow): Promise<boolean> {
  try {
    const db = getServiceClient();
    await db.from('fii_dii_flows').upsert({
      date: flow.date,
      fii_buy: flow.fiiBuy,
      fii_sell: flow.fiiSell,
      fii_net: flow.fiiNet,
      dii_buy: flow.diiBuy,
      dii_sell: flow.diiSell,
      dii_net: flow.diiNet,
    }, {
      onConflict: 'date',
    });
    return true;
  } catch (err) {
    console.warn('[FII/DII] Supabase save failed:', err);
    return false;
  }
}

// ─── Get recent FII/DII history from Supabase ───────────────────────

export async function getRecentFIIDIIFlows(days: number = 30): Promise<FIIDIIFlow[]> {
  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from('fii_dii_flows')
      .select('*')
      .order('date', { ascending: false })
      .limit(days);

    if (error || !data) return [];

    return data.map((row: any) => ({
      date: row.date,
      fiiBuy: row.fii_buy || 0,
      fiiSell: row.fii_sell || 0,
      fiiNet: row.fii_net || 0,
      diiBuy: row.dii_buy || 0,
      diiSell: row.dii_sell || 0,
      diiNet: row.dii_net || 0,
    }));
  } catch {
    return [];
  }
}

// ─── Compute FII/DII-derived features for ML ────────────────────────

export function computeFIIDIIFeatures(flows: FIIDIIFlow[]): {
  fiiNetToday: number;
  fiiNet5DAvg: number;
  fiiTrend: 'buying' | 'selling' | 'neutral';
  diiNetToday: number;
  diiNet5DAvg: number;
  diiTrend: 'buying' | 'selling' | 'neutral';
  fiiDiiDivergence: number; // positive = FII buying while DII selling (strong signal)
  // ─── New: Phase 2 velocity derivatives ───
  fiiVelocity: number;         // 5-day flow acceleration (₹Cr/day change rate)
  flowMomentumDivergence: number; // FII vel × DII vel — negative = diverging (bullish)
  cumFlow10d: number;          // Cumulative 10-day FII net (institutional conviction)
} {
  if (flows.length === 0) {
    return {
      fiiNetToday: 0, fiiNet5DAvg: 0, fiiTrend: 'neutral',
      diiNetToday: 0, diiNet5DAvg: 0, diiTrend: 'neutral',
      fiiDiiDivergence: 0,
      fiiVelocity: 0, flowMomentumDivergence: 0, cumFlow10d: 0,
    };
  }

  const today = flows[0];
  const last5 = flows.slice(0, Math.min(5, flows.length));
  const fiiNet5DAvg = last5.reduce((s, f) => s + f.fiiNet, 0) / last5.length;
  const diiNet5DAvg = last5.reduce((s, f) => s + f.diiNet, 0) / last5.length;

  // FII trend: 4 of last 5 days net positive = buying
  const fiiPositiveDays = last5.filter(f => f.fiiNet > 0).length;
  const fiiTrend: 'buying' | 'selling' | 'neutral' =
    fiiPositiveDays >= 4 ? 'buying' :
    fiiPositiveDays <= 1 ? 'selling' : 'neutral';

  // DII trend
  const diiPositiveDays = last5.filter(f => f.diiNet > 0).length;
  const diiTrend: 'buying' | 'selling' | 'neutral' =
    diiPositiveDays >= 4 ? 'buying' :
    diiPositiveDays <= 1 ? 'selling' : 'neutral';

  // Divergence: FII and DII going opposite directions is a strong signal
  const fiiDiiDivergence = today.fiiNet - today.diiNet;

  // ─── Velocity: how fast is institutional money accelerating? ───
  // Compare recent 5-day average to previous 5-day average
  const prev5 = flows.slice(5, Math.min(10, flows.length));
  const fiiNet5DAvgPrev = prev5.length > 0
    ? prev5.reduce((s, f) => s + f.fiiNet, 0) / prev5.length
    : fiiNet5DAvg;
  const diiNet5DAvgPrev = prev5.length > 0
    ? prev5.reduce((s, f) => s + f.diiNet, 0) / prev5.length
    : diiNet5DAvg;

  // Velocity = change in 5-day average (positive = accelerating buying)
  const fiiVelocity = fiiNet5DAvg - fiiNet5DAvgPrev;
  const diiVelocity = diiNet5DAvg - diiNet5DAvgPrev;

  // Flow Momentum Divergence: FII vel × DII vel
  // Negative = they're going opposite directions (strong directional signal)
  const flowMomentumDivergence = fiiVelocity * diiVelocity;

  // Cumulative 10-day FII net — institutional conviction
  const last10 = flows.slice(0, Math.min(10, flows.length));
  const cumFlow10d = last10.reduce((s, f) => s + f.fiiNet, 0);

  return {
    fiiNetToday: today.fiiNet,
    fiiNet5DAvg: parseFloat(fiiNet5DAvg.toFixed(2)),
    fiiTrend,
    diiNetToday: today.diiNet,
    diiNet5DAvg: parseFloat(diiNet5DAvg.toFixed(2)),
    diiTrend,
    fiiDiiDivergence: parseFloat(fiiDiiDivergence.toFixed(2)),
    fiiVelocity: parseFloat(fiiVelocity.toFixed(2)),
    flowMomentumDivergence: parseFloat(flowMomentumDivergence.toFixed(2)),
    cumFlow10d: parseFloat(cumFlow10d.toFixed(2)),
  };
}

