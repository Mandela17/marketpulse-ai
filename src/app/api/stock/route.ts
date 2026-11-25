import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { fetchStockPrice } from '@/lib/stockData';
import { computeRealTechnicals } from '@/lib/technicalAnalysis';
import { getInstrumentKey } from '@/lib/upstoxInstruments';
import { resolveReadUpstoxToken } from '@/lib/upstoxTokenStore';
import { quoteCache, QUOTE_TTL, techCache, TECH_TTL } from '@/lib/cache';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  // Client can pass a token, but we also auto-check server-side stored token
  const clientToken = request.headers.get('X-Upstox-Token') || '';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter required' }, { status: 400 });
  }
  
  try {
    // ─── Resolve Upstox token: valid client-provided OR server-side stored ───
    const upstoxToken = await resolveReadUpstoxToken(clientToken);
    const tokenSource = upstoxToken && upstoxToken === clientToken ? 'client' : 'server';

    // ─── Try Upstox for real-time quote ───
    let upstoxQuote: any = null;
    
    if (upstoxToken && upstoxToken !== 'sandbox' && upstoxToken !== 'mock') {
      // Check cache first
      const cacheKey = `upstox:${symbol}`;
      const cached = quoteCache.get<any>(cacheKey);
      if (cached) {
        upstoxQuote = cached;
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
                const netChange = typeof q.net_change === 'number'
                  ? q.net_change
                  : (q.last_price - (q.close_price || q.ohlc?.close || q.last_price));
                const derivedPrev = q.last_price - netChange;
                const prevClose = q.close_price > 0
                  ? q.close_price
                  : (typeof q.net_change === 'number' && derivedPrev > 0
                      ? derivedPrev
                      : (q.ohlc?.close || q.last_price));
                const changePercent = prevClose > 0 && netChange !== 0
                  ? (netChange / prevClose) * 100
                  : 0;

                upstoxQuote = {
                  symbol,
                  name: symbol,
                  price: q.last_price,
                  change: Number(netChange.toFixed(2)),
                  changePercent: Number(changePercent.toFixed(2)),
                  previousClose: Number(prevClose.toFixed(2)),
                  dayHigh: q.ohlc?.high || q.last_price,
                  dayLow: q.ohlc?.low || q.last_price,
                  volume: q.volume || 0,
                  currency: 'INR',
                  source: 'upstox',
                };
                // Cache Upstox quote for 2 minutes (more real-time than Yahoo)
                quoteCache.set(cacheKey, upstoxQuote, 2 * 60 * 1000);
              }
            }
          }
        } catch (upstoxErr) {
          console.warn('[Stock API] Upstox quote failed, falling back to Yahoo:', upstoxErr);
        }
      }
    }

    // ─── Fetch Yahoo Finance quote (fallback) + technicals in parallel ───
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
      dataSource: upstoxQuote
        ? `Upstox Real-Time (${tokenSource})`
        : 'Yahoo Finance OHLCV',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
