import { NextResponse } from 'next/server';
import { fetchStockPrice } from '@/lib/stockData';
import { computeRealTechnicals } from '@/lib/technicalAnalysis';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  
  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter required' }, { status: 400 });
  }
  
  try {
    // Fetch live quote and real technicals in parallel
    const [quote, technicals] = await Promise.all([
      fetchStockPrice(symbol),
      computeRealTechnicals(symbol),
    ]);

    if (!quote) {
      return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
    }
    
    return NextResponse.json({
      quote,
      technicals: technicals || null,
      dataSource: 'Yahoo Finance OHLCV',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
