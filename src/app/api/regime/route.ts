// API Route: Market regime detection
// Returns current market regime classification with component scores

import { NextResponse } from 'next/server';
import { detectMarketRegime } from '@/lib/marketRegime';

export const dynamic = 'force-dynamic';
export const revalidate = 1800; // Cache for 30 minutes

export async function GET() {
  try {
    const regime = await detectMarketRegime();
    return NextResponse.json(regime);
  } catch (error: any) {
    console.error('[Regime API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
