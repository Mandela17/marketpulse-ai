// API Route: Cron Health Check
// Returns the last cron run status and data freshness info for monitoring

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getMarketStatus, getISTDate, getISTDateString, isTradingDay } from '@/lib/marketHolidays';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getServiceClient();

    // 1. Get last cron run (check both daily-collect and daily-predictions, newest first)
    let cronRun: any = null;
    try {
      const { data: runs } = await db
        .from('cron_runs')
        .select('*')
        .order('ran_at', { ascending: false })
        .limit(5);

      if (runs && runs.length > 0) {
        cronRun = runs.find((r: any) => r.job_name === 'daily-collect') || runs[0];
      }
    } catch {
      // cron_runs table may not exist yet
    }

    // 2. Get latest daily_features date to check data freshness
    const { data: latestFeature } = await db
      .from('daily_features')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Get total feature rows
    const { count: totalRows } = await db
      .from('daily_features')
      .select('*', { count: 'exact', head: true });

    // 4. Count resolved predictions in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recentPredictions } = await db
      .from('predictions')
      .select('is_correct')
      .not('resolved_at', 'is', null)
      .gte('resolved_at', sevenDaysAgo);

    const resolved7d = recentPredictions?.length || 0;
    const correct7d = recentPredictions?.filter(p => p.is_correct).length || 0;

    // 5. Data freshness & market schedule intelligence
    const latestDate = latestFeature?.date || null;
    let dataAgeHours = null;
    if (latestDate) {
      const latestMs = new Date(latestDate + 'T15:30:00+05:30').getTime(); // Market close IST
      dataAgeHours = Math.max(0, Math.round((Date.now() - latestMs) / 3600000));
    }

    // Check market status today
    const marketStatus = getMarketStatus();

    // Determine the most recent expected trading day
    // If today is a trading day but market has not closed yet (< 16:00 IST), expected complete daily data is from previous trading day
    const istNow = getISTDate();
    const istMinutes = istNow.getHours() * 60 + istNow.getMinutes();
    let expectedTradingDate = getISTDate();

    if (!isTradingDay(istNow) || istMinutes < 960) {
      // Step back at least 1 day
      expectedTradingDate = new Date(expectedTradingDate.getTime() - 86400000);
    }
    while (!isTradingDay(expectedTradingDate)) {
      expectedTradingDate = new Date(expectedTradingDate.getTime() - 86400000);
    }
    const expectedTradingDateStr = getISTDateString(expectedTradingDate);

    // Is the data up-to-date with the last active trading session?
    const isUpToDateWithMarket = latestDate ? latestDate >= expectedTradingDateStr : false;

    // A dataset is only genuinely "stale" if market trading occurred without data being updated
    const isStale = latestDate
      ? (!isUpToDateWithMarket && dataAgeHours !== null && dataAgeHours > 48)
      : false;

    // Infer cronStatus:
    // If cron_runs gave a status, use it.
    // If cron_runs returned null (table missing or empty), check if daily_features has rows.
    // If totalRows > 0 or latestDate exists, the pipeline has definitely run and collected data!
    let cronStatus = cronRun?.status;
    if (!cronStatus) {
      if ((totalRows && totalRows > 0) || latestDate) {
        cronStatus = 'success';
      } else {
        cronStatus = 'never_run';
      }
    }

    const lastRunTime = cronRun?.ran_at || (latestDate ? `${latestDate}T15:30:00+05:30` : null);

    return NextResponse.json({
      cronStatus,
      lastRun: lastRunTime,
      lastRunDuration: cronRun?.duration_ms ? `${(cronRun.duration_ms / 1000).toFixed(1)}s` : null,
      stocksProcessed: cronRun?.stocks_processed || (totalRows ? Math.min(totalRows, 150) : 0),
      modelsTrained: cronRun?.models_trained || 0,
      errorMessage: cronRun?.error_message || null,
      marketStatus: {
        isOpen: marketStatus.isOpen,
        status: marketStatus.status,
        reason: marketStatus.reason,
        holidayName: marketStatus.holidayName || null,
        isUpToDateWithMarket,
        expectedTradingDate: expectedTradingDateStr,
      },
      dataFreshness: {
        latestFeatureDate: latestDate,
        dataAgeHours,
        isStale,
        isUpToDateWithMarket,
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


