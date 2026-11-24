// API Route: Quarterly & Annual Financials (Revenue, Profit, Margins, EPS, Cash Flow & Growth)
// Uses Yahoo Finance fundamentals-timeseries API with 6h in-memory caching

import { NextResponse } from 'next/server';
import { fetchFinancialPerformance } from '@/lib/financialData';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const forceRefresh = searchParams.get('refresh') === 'true';

  if (!symbol || !symbol.trim()) {
    return NextResponse.json({ error: 'Symbol parameter required' }, { status: 400 });
  }

  try {
    const data = await fetchFinancialPerformance(symbol, forceRefresh);

    if (!data) {
      return NextResponse.json(
        { error: `No financial statements available for ${symbol.toUpperCase()}` },
        { status: 404 }
      );
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error: any) {
    console.error('[Financials API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch financial data', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
