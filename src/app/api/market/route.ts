// API Route: Fetch real market data (NIFTY, SENSEX, stock prices)
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { fetchNifty50, fetchSensex, fetchStockPrice } from '@/lib/stockData';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  try {
    if (symbol) {
      // Fetch single stock
      const data = await fetchStockPrice(symbol);
      if (!data) {
        return NextResponse.json({ error: `Stock ${symbol} not found` }, { status: 404 });
      }
      return NextResponse.json(data);
    }

    // Fetch index data
    const [nifty, sensex] = await Promise.all([
      fetchNifty50(),
      fetchSensex(),
    ]);

    return NextResponse.json({
      nifty50: nifty,
      sensex: sensex,
      marketStatus: isMarketOpen() ? 'open' : 'closed',
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Market API] Error:', error);
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
