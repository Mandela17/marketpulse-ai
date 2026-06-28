// API Route: FII/DII Institutional Flow Data
// Returns today's FII/DII flow data + recent history

import { NextResponse } from 'next/server';
import { fetchFIIDIIFlows, getRecentFIIDIIFlows, saveFIIDIIFlows } from '@/lib/fiiDiiData';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Fetch today's data from NSE
    const today = await fetchFIIDIIFlows();

    // Save to Supabase if we got fresh data
    if (today && (today.fiiNet !== 0 || today.diiNet !== 0)) {
      await saveFIIDIIFlows(today).catch(() => {});
    }

    // Get recent history from Supabase
    const recent = await getRecentFIIDIIFlows(30);

    return NextResponse.json({
      today,
      recent,
      source: 'nse',
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[FII/DII API] Error:', error);
    return NextResponse.json({ error: error.message, today: null, recent: [] }, { status: 500 });
  }
}
