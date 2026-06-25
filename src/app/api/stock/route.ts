import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { fetchStockPrice } from '@/lib/stockData';
import { computeRealTechnicals } from '@/lib/technicalAnalysis';
import { getInstrumentKey } from '@/lib/upstoxInstruments';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const upstoxToken = request.headers.get('X-Upstox-Token') || '';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter required' }, { status: 400 });
  }
  
  try {
    // Try Upstox first if token provided (more accurate, real-time)
    let upstoxQuote: any = null;
    if (upstoxToken) {
      if (upstoxToken === 'sandbox' || upstoxToken === 'mock') {
        const yahooQuote = await fetchStockPrice(symbol);
        if (yahooQuote) {
          upstoxQuote = {
            ...yahooQuote,
            source: 'upstox',
          };
        }
      } else {
        try {
          const instrumentKey = getInstrumentKey(symbol);
          if (instrumentKey) {
            const upstoxRes = await fetch(
              `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKey)}`,
              { headers: { Accept: 'application/json', Authorization: `Bearer ${upstoxToken}` } }
            );
            if (upstoxRes.ok) {
              const upstoxData = await upstoxRes.json();
              const q = Object.values(upstoxData.data || {})[0] as any;
              if (q && q.last_price) {
                upstoxQuote = {
                  symbol,
                  name: symbol,
                  price: q.last_price,
                  change: q.net_change ?? (q.last_price - (q.close_price || q.last_price)),
                  changePercent: q.close_price > 0
                    ? ((q.last_price - q.close_price) / q.close_price) * 100
                    : 0,
                  previousClose: q.close_price || q.last_price,
                  dayHigh: q.ohlc?.high || q.last_price,
                  dayLow: q.ohlc?.low || q.last_price,
                  volume: q.volume || 0,
                  currency: 'INR',
                  source: 'upstox',
                };
              }
            }
          }
        } catch (upstoxErr) {
          console.warn('[Stock API] Upstox quote failed, falling back to Yahoo:', upstoxErr);
        }
      }
    }

    // Fetch Yahoo Finance quote + technicals in parallel (always compute technicals from OHLCV)
    const [yahooQuote, technicals] = await Promise.all([
      upstoxQuote ? Promise.resolve(null) : fetchStockPrice(symbol),
      computeRealTechnicals(symbol),
    ]);

    const quote = upstoxQuote || yahooQuote;

    if (!quote) {
      return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
    }
    
    return NextResponse.json({
      quote,
      technicals: technicals || null,
      dataSource: upstoxQuote ? 'Upstox Real-Time' : 'Yahoo Finance OHLCV',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
