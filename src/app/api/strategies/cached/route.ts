import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/strategies/cached — returns all cached strategy results from DB
// No scanning, no force, just reads from strategy_cache table
export async function GET() {
  try {
    const db = getServiceClient();
    const { data: rows, error } = await db
      .from('strategy_cache')
      .select('*')
      .order('strategy_id', { ascending: true });

    if (error) {
      console.error('[strategies/cached] DB error:', error);
      return NextResponse.json({ cached: {} });
    }

    // Build a map of strategyId -> result
    const cached: Record<number, any> = {};
    for (const row of rows || []) {
      if (row.matches && row.match_count > 0) {
        cached[row.strategy_id] = {
          strategyId: row.strategy_id,
          matches: row.matches,
          totalScanned: row.total_scanned,
          matchCount: row.match_count,
          scanTime: row.scan_time,
          cached: true,
          cacheSource: 'db',
          cachedAt: row.updated_at,
        };
      }
    }

    return NextResponse.json({ cached });
  } catch (err: any) {
    console.error('[strategies/cached] Error:', err.message);
    return NextResponse.json({ cached: {} });
  }
}
