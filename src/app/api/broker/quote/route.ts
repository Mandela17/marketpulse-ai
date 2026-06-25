// API Route: Upstox Market Quotes
// Fetches live quotes from Upstox when broker is connected
// Falls back gracefully if not connected

import { NextResponse } from 'next/server';
import { getInstrumentKey } from '@/lib/upstoxInstruments';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'NIFTY';
  const accessToken = request.headers.get('X-Upstox-Token') || '';

  if (!accessToken) {
    return NextResponse.json({ error: 'No Upstox access token provided' }, { status: 401 });
  }

  if (accessToken === 'sandbox' || accessToken === 'mock') {
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
      { headers }
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

    return NextResponse.json({
      symbol,
      instrumentKey,
      price: q.last_price || 0,
      change: q.net_change || (q.last_price - q.close_price) || 0,
      changePercent: q.close_price > 0 ? ((q.last_price - q.close_price) / q.close_price) * 100 : 0,
      open: q.ohlc?.open || 0,
      high: q.ohlc?.high || 0,
      low: q.ohlc?.low || 0,
      previousClose: q.close_price || 0,
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
