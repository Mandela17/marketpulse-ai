import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { fetchHistoricalOHLCV } from '@/lib/technicalAnalysis';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const daysStr = searchParams.get('days') || '60';
  const days = parseInt(daysStr, 10);

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter required' }, { status: 400 });
  }

  try {
    const ohlcv = await fetchHistoricalOHLCV(symbol, days);
    
    if (!ohlcv || ohlcv.length === 0) {
      return NextResponse.json({ error: `No historical data found for ${symbol}` }, { status: 404 });
    }

    return NextResponse.json({
      symbol,
      days,
      data: ohlcv,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
