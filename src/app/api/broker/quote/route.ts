// API Route: Upstox Market Quotes
// Fetches live quotes from Upstox when broker is connected
// Falls back gracefully if not connected

import { NextResponse } from 'next/server';
import { getInstrumentKey } from '@/lib/upstoxInstruments';
import { resolveReadUpstoxToken } from '@/lib/upstoxTokenStore';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'NIFTY';
  const rawHeaderToken = request.headers.get('X-Upstox-Token') || '';

  if (rawHeaderToken === 'sandbox' || rawHeaderToken === 'mock') {
    const basePrice = symbol.includes('NIFTY') ? 23500 : symbol.includes('SENSEX') ? 77200 : 1500;
    const change = (Math.random() - 0.45) * (basePrice * 0.01);
    const changePercent = (change / basePrice) * 100;
    return NextResponse.json({
      symbol,
      instrumentKey: 'MOCK_KEY',
      price: Number((basePrice + change).toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      open: basePrice,
      high: Number((basePrice + Math.abs(change) * 1.2).toFixed(2)),
      low: Number((basePrice - Math.abs(change) * 1.2).toFixed(2)),
      previousClose: basePrice,
      volume: 2400000,
      source: 'upstox',
    });
  }

  const accessToken = await resolveReadUpstoxToken(rawHeaderToken);
  if (!accessToken) {
    return NextResponse.json({ error: 'No valid Upstox access token available' }, { status: 401 });
  }

  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };

  try {
    // Resolve instrument key
    let instrumentKey = getInstrumentKey(symbol);

    // If symbol is an index keyword, use index key
    if (!instrumentKey) {
      if (symbol === 'NIFTY' || symbol === 'NIFTY50') {
        instrumentKey = 'NSE_INDEX|Nifty 50';
      } else if (symbol === 'SENSEX' || symbol === 'BSESN') {
        instrumentKey = 'BSE_INDEX|SENSEX';
      } else if (symbol === 'BANKNIFTY') {
        instrumentKey = 'NSE_INDEX|Nifty Bank';
      } else {
        // Try search API
        const searchRes = await fetch(
          `https://api.upstox.com/v2/search?q=${encodeURIComponent(symbol)}&segment=NSE_EQ`,
          { headers }
        );
        if (searchRes.ok) {
          const sd = await searchRes.json();
          instrumentKey = sd.data?.[0]?.instrument_key || null;
        }
      }
    }

    if (!instrumentKey) {
      return NextResponse.json({ error: `Instrument not found: ${symbol}` }, { status: 404 });
    }

    // Fetch live quote
    const quoteRes = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKey)}`,
      { headers, cache: 'no-store' }
    );

    if (!quoteRes.ok) {
      const errData = await quoteRes.json().catch(() => ({}));
      return NextResponse.json({ error: 'Upstox quote failed', details: errData }, { status: quoteRes.status });
    }

    const quoteData = await quoteRes.json();
    const values = Object.values(quoteData.data || {}) as any[];
    const q = values[0];

    if (!q) {
      return NextResponse.json({ error: 'No quote data returned' }, { status: 404 });
    }

    // Note: After market close, q.ohlc.close equals q.last_price (today's close), not yesterday's close.
    // Derive true previous close from last_price - net_change whenever net_change is provided.
    const derivedPrev = q.last_price && typeof q.net_change === 'number' ? q.last_price - q.net_change : 0;
    const prevClose = derivedPrev > 0 ? derivedPrev : (q.close_price || q.ohlc?.close || 0);
    const change = typeof q.net_change === 'number' ? q.net_change : (prevClose > 0 ? q.last_price - prevClose : 0);
    // Prefer API-provided percentage; compute only as fallback
    let changePercent = q.percentage_change ?? 0;
    if (changePercent === 0 && prevClose > 0 && change !== 0) {
      changePercent = (change / prevClose) * 100;
    }

    return NextResponse.json({
      symbol,
      instrumentKey,
      price: q.last_price || 0,
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      open: q.ohlc?.open || 0,
      high: q.ohlc?.high || 0,
      low: q.ohlc?.low || 0,
      previousClose: Number(prevClose.toFixed(2)),
      volume: q.volume || 0,
      averagePrice: q.average_price || 0,
      totalBuyQty: q.total_buy_quantity || 0,
      totalSellQty: q.total_sell_quantity || 0,
      source: 'upstox',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
