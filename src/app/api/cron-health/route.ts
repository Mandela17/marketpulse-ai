// API Route: Cron Health Check
// Returns the last cron run status and data freshness info for monitoring

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getServiceClient();

    // Get last cron run
    const { data: cronRun } = await db
      .from('cron_runs')
      .select('*')
      .eq('job_name', 'daily-collect')
      .limit(1)
      .maybeSingle();

    // Get latest daily_features date to check data freshness
    const { data: latestFeature } = await db
      .from('daily_features')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get total feature rows and unique stocks
    const { count: totalRows } = await db
      .from('daily_features')
      .select('*', { count: 'exact', head: true });

    // Count resolved predictions in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recentPredictions } = await db
      .from('predictions')
      .select('is_correct')
      .not('resolved_at', 'is', null)
      .gte('resolved_at', sevenDaysAgo);

    const resolved7d = recentPredictions?.length || 0;
    const correct7d = recentPredictions?.filter(p => p.is_correct).length || 0;

    // Compute data age
    const latestDate = latestFeature?.date || null;
    let dataAgeHours = null;
    if (latestDate) {
      const latestMs = new Date(latestDate + 'T15:30:00+05:30').getTime(); // Market close IST
      dataAgeHours = Math.round((Date.now() - latestMs) / 3600000);
    }

    return NextResponse.json({
      cronStatus: cronRun?.status || 'never_run',
      lastRun: cronRun?.ran_at || null,
      lastRunDuration: cronRun?.duration_ms ? `${(cronRun.duration_ms / 1000).toFixed(1)}s` : null,
      stocksProcessed: cronRun?.stocks_processed || 0,
      modelsTrained: cronRun?.models_trained || 0,
      errorMessage: cronRun?.error_message || null,
      dataFreshness: {
        latestFeatureDate: latestDate,
        dataAgeHours,
        isStale: dataAgeHours !== null && dataAgeHours > 48,
        totalFeatureRows: totalRows || 0,
      },
      accuracy7d: {
        resolved: resolved7d,
        correct: correct7d,
        accuracy: resolved7d > 0 ? parseFloat(((correct7d / resolved7d) * 100).toFixed(1)) : null,
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      cronStatus: 'error',
      error: error.message,
    }, { status: 500 });
  }
}

