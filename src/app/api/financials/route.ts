// API Route: Quarterly & Annual Financials (Revenue, Profit, Ratios, Balance Sheet, Cash Flow)
// Primary: Upstox Company Fundamentals API v2 (official Indian exchange filings in Crores)
// Fallback: Yahoo Finance fundamentals-timeseries API

import { NextResponse } from 'next/server';
import { fetchFinancialPerformance, type StatementType } from '@/lib/financialData';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const forceRefresh = searchParams.get('refresh') === 'true';
  const typeParam = searchParams.get('type');
  const statementType: StatementType = typeParam === 'standalone' ? 'standalone' : 'consolidated';
  const clientToken = request.headers.get('X-Upstox-Token') || '';

  if (!symbol || !symbol.trim()) {
    return NextResponse.json({ error: 'Symbol parameter required' }, { status: 400 });
  }

  try {
    const data = await fetchFinancialPerformance(symbol, {
      statementType,
      forceRefresh,
      clientToken,
    });

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
