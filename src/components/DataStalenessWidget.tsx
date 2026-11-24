'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, Database, Clock, Activity, Calendar } from 'lucide-react';

interface CronHealth {
  cronStatus: string;
  lastRun: string | null;
  lastRunDuration: string | null;
  stocksProcessed: number;
  modelsTrained: number;
  errorMessage: string | null;
  marketStatus?: {
    isOpen: boolean;
    status: string;
    reason: string;
    holidayName: string | null;
    isUpToDateWithMarket: boolean;
    expectedTradingDate: string;
  };
  dataFreshness: {
    latestFeatureDate: string | null;
    dataAgeHours: number | null;
    isStale: boolean;
    isUpToDateWithMarket?: boolean;
    totalFeatureRows: number;
  };
  accuracy7d: {
    resolved: number;
    correct: number;
    accuracy: number | null;
  };
}

export default function DataStalenessWidget() {
  const [health, setHealth] = useState<CronHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/cron-health')
      .then(r => r.json())
      .then(data => {
        setHealth(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) return null; // Don't show skeleton — keep dashboard clean
  if (error || !health) return null; // Silently fail — not critical

  const { dataFreshness, cronStatus, accuracy7d, marketStatus } = health;
  const isStale = dataFreshness.isStale;
  const isError = cronStatus === 'failed';

  // Only genuinely "never run" if status is never_run AND no data exists in daily_features
  const isNeverRun = cronStatus === 'never_run' && dataFreshness.totalFeatureRows === 0 && !dataFreshness.latestFeatureDate;
  const ageHours = dataFreshness.dataAgeHours;
  const isMarketClosed = marketStatus?.isOpen === false;
  const isUpToDate = dataFreshness.isUpToDateWithMarket ?? (ageHours !== null && ageHours < 24);

  // If everything is healthy, no errors, and data is up-to-date with market (or market is closed on holiday/weekend):
  // Hide banner to keep dashboard pristine
  if (!isStale && !isError && !isNeverRun && (isUpToDate || (isMarketClosed && ageHours !== null && ageHours < 72))) {
    return null;
  }

  // Determine banner style
  let bgGrad: string;
  let borderColor: string;
  let iconColor: string;
  let StatusIcon: typeof CheckCircle;
  let statusText: string;
  let statusDetail: string;

  if (isNeverRun) {
    bgGrad = 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.04))';
    borderColor = 'rgba(59,130,246,0.25)';
    iconColor = '#60a5fa';
    StatusIcon = Database;
    statusText = 'Pipeline Initializing';
    statusDetail = 'No historical feature records found. Daily data collection will run at the next scheduled time (8:30 AM IST).';
  } else if (isError) {
    bgGrad = 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.04))';
    borderColor = 'rgba(239,68,68,0.25)';
    iconColor = '#f87171';
    StatusIcon = AlertTriangle;
    statusText = 'Pipeline Error';
    statusDetail = health.errorMessage
      ? `Last run failed: ${health.errorMessage.substring(0, 120)}`
      : 'The last cron run failed. Predictions may use previous session data.';
  } else if (isStale) {
    bgGrad = 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(251,191,36,0.04))';
    borderColor = 'rgba(251,191,36,0.25)';
    iconColor = '#fbbf24';
    StatusIcon = AlertTriangle;
    statusText = 'Data May Be Stale';
    statusDetail = ageHours !== null
      ? `Last data update was ${ageHours} hours ago. Market traded without new feature updates.`
      : 'Unable to determine data freshness.';
  } else {
    // 24-48 hour range on active trading days
    bgGrad = 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(59,130,246,0.03))';
    borderColor = 'rgba(59,130,246,0.2)';
    iconColor = '#60a5fa';
    StatusIcon = Clock;
    statusText = 'Awaiting Market Refresh';
    statusDetail = marketStatus?.reason
      ? `${marketStatus.reason} • Next scheduled refresh at 8:30 AM IST.`
      : `Data is ${ageHours} hours old. Next refresh at 8:30 AM IST.`;
  }

  return (
    <div
      className="mb-4 p-3 sm:p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center gap-3 animate-fade-in-up"
      style={{ background: bgGrad, border: `1px solid ${borderColor}` }}
    >
      <StatusIcon size={18} style={{ color: iconColor, flexShrink: 0, marginTop: 2 }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">{statusText}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {statusDetail}
        </p>
      </div>

      {/* Quick stats pills */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        {marketStatus?.holidayName && (
          <span className="text-[10px] px-2 py-1 rounded-md font-semibold flex items-center gap-1"
            style={{ background: 'rgba(234,179,8,0.12)', color: '#eab308' }}
          >
            <Calendar size={10} />
            {marketStatus.holidayName}
          </span>
        )}
        {ageHours !== null && (
          <span className="text-[10px] px-2 py-1 rounded-md font-semibold flex items-center gap-1"
            style={{
              background: isStale ? 'rgba(251,191,36,0.12)' : 'rgba(0,214,143,0.12)',
              color: isStale ? '#fbbf24' : '#00d68f',
            }}
          >
            <RefreshCw size={10} />
            {ageHours}h ago
          </span>
        )}
        {dataFreshness.totalFeatureRows > 0 && (
          <span className="text-[10px] px-2 py-1 rounded-md font-semibold flex items-center gap-1"
            style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}
          >
            <Database size={10} />
            {dataFreshness.totalFeatureRows.toLocaleString()} rows
          </span>
        )}
        {accuracy7d.accuracy !== null && (
          <span className="text-[10px] px-2 py-1 rounded-md font-semibold flex items-center gap-1"
            style={{
              background: accuracy7d.accuracy >= 55 ? 'rgba(0,214,143,0.12)' : 'rgba(251,191,36,0.12)',
              color: accuracy7d.accuracy >= 55 ? '#00d68f' : '#fbbf24',
            }}
          >
            <Activity size={10} />
            {accuracy7d.accuracy}% 7d
          </span>
        )}
      </div>
    </div>
  );
}
