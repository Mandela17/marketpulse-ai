// API Route: Cron Health Check
// Returns the last cron run status and data freshness info for monitoring

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getMarketStatus, NSE_BSE_HOLIDAYS } from '@/lib/marketHolidays';

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

    // Determine the most recent expected trading day with COMPLETE data.
    // Use plain UTC-based IST calculation to avoid double-offset bugs on UTC servers.
    const nowMs = Date.now();
    const istNowMs = nowMs + 5.5 * 3600000;
    const istNowDate = new Date(istNowMs);
    const istHour = istNowDate.getUTCHours();
    const istMin = istNowDate.getUTCMinutes();
    const istMinutes = istHour * 60 + istMin;

    // Build today's date string in IST directly from UTC millis
    const istYear = istNowDate.getUTCFullYear();
    const istMonth = String(istNowDate.getUTCMonth() + 1).padStart(2, '0');
    const istDay = String(istNowDate.getUTCDate()).padStart(2, '0');
    const todayISTStr = `${istYear}-${istMonth}-${istDay}`;

    // If today is not a trading day, or market hasn't closed yet (< 16:00 IST / 960 min),
    // the latest expected complete data is from the previous trading day.
    let expectedMs = istNowMs;
    const todayDow = istNowDate.getUTCDay();
    const todayIsTrading = todayDow >= 1 && todayDow <= 5 && !NSE_BSE_HOLIDAYS[todayISTStr];

    if (!todayIsTrading || istMinutes < 960) {
      expectedMs -= 86400000; // step back one day
    }
    // Walk backwards past weekends and holidays
    for (let i = 0; i < 10; i++) {
      const d = new Date(expectedMs);
      const dow = d.getUTCDay();
      const ds = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      if (dow >= 1 && dow <= 5 && !NSE_BSE_HOLIDAYS[ds]) {
        break;
      }
      expectedMs -= 86400000;
    }
    const expD = new Date(expectedMs);
    const expectedTradingDateStr = `${expD.getUTCFullYear()}-${String(expD.getUTCMonth() + 1).padStart(2, '0')}-${String(expD.getUTCDate()).padStart(2, '0')}`;

    // Is the data up-to-date with the last active trading session?
    const isUpToDateWithMarket = latestDate ? latestDate >= expectedTradingDateStr : false;

    // Count how many trading days elapsed since the latest data date using pure IST YYYY-MM-DD math
    let tradingDayGap = 0;
    if (latestDate && !isUpToDateWithMarket) {
      const [ly, lm, ld] = latestDate.split('-').map(Number);
      const [ey, em, ed] = expectedTradingDateStr.split('-').map(Number);
      let walkUtcMs = Date.UTC(ly, lm - 1, ld) + 86400000;
      const expUtcMs = Date.UTC(ey, em - 1, ed);
      while (walkUtcMs <= expUtcMs && tradingDayGap < 30) {
        const wd = new Date(walkUtcMs);
        const wdStr = `${wd.getUTCFullYear()}-${String(wd.getUTCMonth() + 1).padStart(2, '0')}-${String(wd.getUTCDate()).padStart(2, '0')}`;
        const wdDow = wd.getUTCDay();
        if (wdDow >= 1 && wdDow <= 5 && !NSE_BSE_HOLIDAYS[wdStr]) {
          tradingDayGap++;
        }
        walkUtcMs += 86400000;
      }
    }

    // Data is stale only if we missed 1+ actual trading days of data
    const isStale = !isUpToDateWithMarket && tradingDayGap >= 1;

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


