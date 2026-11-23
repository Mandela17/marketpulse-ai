// API Route: Run walk-forward backtests
// Provides endpoints for single-stock and all-stock backtesting
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const minTrain = parseInt(searchParams.get('minTrain') || '60', 10);

  try {
    // Dynamic import to avoid loading backtester on every route
    const { runBacktest, runBacktestAll } = await import('@/lib/backtester');

    if (symbol) {
      // Single stock backtest
      const result = await runBacktest(symbol, { minTrainDays: minTrain });
      if (!result) {
        return NextResponse.json(
          { error: `Insufficient data for ${symbol} backtest` },
          { status: 404 }
        );
      }
      return NextResponse.json(result);
    }

    // All stocks backtest
    const results = await runBacktestAll();
    return NextResponse.json(results);
  } catch (error: any) {
    console.error('[Backtest API]', error);
    return NextResponse.json(
      { error: 'Backtest failed', details: error.message },
      { status: 500 }
    );
  }
}

