// API Route: Fetch real market data (NIFTY, SENSEX, stock prices)
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { fetchNifty50, fetchSensex, fetchStockPrice } from '@/lib/stockData';

// In-memory cache for index data to avoid redundant Yahoo Finance calls
let indexCache: { data: any; timestamp: number } | null = null;
const INDEX_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

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

    // Return cached index data if still fresh
    if (indexCache && Date.now() - indexCache.timestamp < INDEX_CACHE_TTL) {
      return NextResponse.json(indexCache.data);
    }

    // Fetch index data in parallel
    const [nifty, sensex] = await Promise.all([
      fetchNifty50(),
      fetchSensex(),
    ]);

    const responseData = {
      nifty50: nifty,
      sensex: sensex,
      marketStatus: isMarketOpen() ? 'open' : 'closed',
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
