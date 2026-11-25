// API Route: Fetch real market data (NIFTY, SENSEX, stock prices)
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { fetchNifty50, fetchSensex, fetchStockPrice, type IndexData } from '@/lib/stockData';
import { isMarketOpenNow } from '@/lib/marketHolidays';
import { getUpstoxToken } from '@/lib/upstoxTokenStore';

// Short cache during market hours for live ticks; longer off-hours
let indexCache: { data: any; timestamp: number } | null = null;
const LIVE_INDEX_TTL = 15 * 1000;      // 15 seconds while market open
const CLOSED_INDEX_TTL = 2 * 60 * 1000; // 2 minutes off-hours

function parseUpstoxIndex(q: any): IndexData | null {
  if (!q || !q.last_price || q.last_price <= 0) return null;
  const price = Number(q.last_price);
  const change = typeof q.net_change === 'number' ? q.net_change : 0;
  const prevClose = price - change;
  const changePercent =
    typeof q.percentage_change === 'number' && q.percentage_change !== 0
      ? q.percentage_change
      : prevClose > 0 && change !== 0
        ? Number(((change / prevClose) * 100).toFixed(2))
        : 0;
  return { value: price, change: Number(change.toFixed(2)), changePercent };
}

async function fetchLiveIndicesFromUpstox(): Promise<{ nifty: IndexData | null; sensex: IndexData | null }> {
  try {
    const tokenInfo = await getUpstoxToken();
    if (!tokenInfo?.accessToken) return { nifty: null, sensex: null };

    const keys = 'NSE_INDEX|Nifty 50,BSE_INDEX|SENSEX';
    const res = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(keys)}`,
      {
        headers: { Accept: 'application/json', Authorization: `Bearer ${tokenInfo.accessToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return { nifty: null, sensex: null };
    const json = await res.json();
    const map = json?.data || {};
    return {
      nifty: parseUpstoxIndex(map['NSE_INDEX:Nifty 50']),
      sensex: parseUpstoxIndex(map['BSE_INDEX:SENSEX']),
    };
  } catch {
    return { nifty: null, sensex: null };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  try {
    if (symbol) {
      // Fetch single stock — no caching needed (individual lookups are fast)
      const data = await fetchStockPrice(symbol);
      if (!data) {
        return NextResponse.json({ error: `Stock ${symbol} not found` }, { status: 404 });
      }
      return NextResponse.json(data);
    }

    const marketOpen = isMarketOpenNow();
    const ttl = marketOpen ? LIVE_INDEX_TTL : CLOSED_INDEX_TTL;

    // Return cached index data if still fresh
    if (indexCache && Date.now() - indexCache.timestamp < ttl) {
      return NextResponse.json(indexCache.data);
    }

    // Prefer live Upstox quotes for both NIFTY 50 & SENSEX; fill any missing side via Yahoo/Google
    const upstox = await fetchLiveIndicesFromUpstox();
    const [nifty, sensex] = await Promise.all([
      upstox.nifty && upstox.nifty.value > 0 ? Promise.resolve(upstox.nifty) : fetchNifty50(),
      upstox.sensex && upstox.sensex.value > 0 ? Promise.resolve(upstox.sensex) : fetchSensex(),
    ]);

    const responseData = {
      nifty50: nifty,
      sensex: sensex,
      marketStatus: marketOpen ? 'open' : 'closed',
      source: upstox.nifty || upstox.sensex ? 'upstox' : 'yahoo',
      lastUpdated: new Date().toISOString(),
    };

    // Cache the result
    indexCache = { data: responseData, timestamp: Date.now() };

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error('[Market API] Error:', error);

    // Return stale cache as fallback
    if (indexCache) {
      return NextResponse.json(indexCache.data);
    }

    return NextResponse.json(
      { error: 'Failed to fetch market data', details: error.message },
      { status: 500 }
    );
  }
}

function isMarketOpen(): boolean {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
  
  const day = ist.getDay();
  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // Market open: Mon-Fri, 9:15 AM - 3:30 PM IST
  if (day === 0 || day === 6) return false;
  if (timeInMinutes >= 555 && timeInMinutes <= 930) return true;
  return false;
}
