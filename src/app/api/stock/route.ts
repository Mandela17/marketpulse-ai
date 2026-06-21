import { NextResponse } from 'next/server';
import { fetchStockPrice, computeStockTechnicals } from '@/lib/stockData';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  
  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter required' }, { status: 400 });
  }
  
  try {
    const quote = await fetchStockPrice(symbol);
    if (!quote) {
      return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
    }
    
    const technicals = computeStockTechnicals(symbol, quote.price, quote.changePercent, quote.volume);
    
    return NextResponse.json({ quote, technicals });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
