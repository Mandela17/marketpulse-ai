// API Route: Predictions CRUD — fetch active, historical, and accuracy data
import { NextResponse } from 'next/server';
import {
  getActivePredictions,
  getPredictions,
  getOverallAccuracy,
  getAccuracyMetrics,
} from '@/lib/predictionHistory';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'active';   // 'active' | 'history' | 'accuracy'
  const symbol = searchParams.get('symbol') || '';

  try {
    switch (type) {
      case 'active': {
        const predictions = await getActivePredictions();
        return NextResponse.json({ predictions });
      }
      case 'history': {
        if (!symbol) {
          return NextResponse.json({ error: 'Symbol required for history' }, { status: 400 });
        }
        const history = await getPredictions(symbol, 30);
        return NextResponse.json({ predictions: history });
      }
      case 'accuracy': {
        const [overall, perStock] = await Promise.all([
          getOverallAccuracy(),
          symbol ? getAccuracyMetrics(symbol) : getAccuracyMetrics(),
        ]);
        return NextResponse.json({ overall, perStock });
      }
      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Predictions API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
