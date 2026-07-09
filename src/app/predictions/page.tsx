'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import BacktestCard from '@/components/BacktestCard';
import AccuracyTrendChart from '@/components/AccuracyTrendChart';
import {
  getAutoTradeConfig, saveAutoTradeConfig, runAutoPaperTrade,
  hasAutoTradedToday, getAutoTradeLog, autoClosePositions,
  AutoTradeConfig, AutoTradeResult,
} from '@/lib/paperTradingStore';

// Format prediction timestamp as relative time
function formatPredictionTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  if (diffMins < 5) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 1) return `${diffMins}m ago`;

  // Check if same calendar day
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return `Today ${timeStr}`;
  if (isYesterday) return `Yesterday ${timeStr}`;
  if (diffDays <= 6) return `${diffDays}d ago, ${timeStr}`;
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) + ` ${timeStr}`;
}

export default function PredictionsDashboard() {
  const [activePredictions, setActivePredictions] = useState<any[]>([]);
  const [accuracy, setAccuracy] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<any>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Auto Paper Trading state
  const [autoTradeConfig, setAutoTradeConfig] = useState<AutoTradeConfig | null>(null);
  const [autoTrading, setAutoTrading] = useState(false);
  const [autoTradeResult, setAutoTradeResult] = useState<AutoTradeResult | null>(null);
  const [showAutoConfig, setShowAutoConfig] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const cacheBust = `&_t=${Date.now()}`;
      const fetchOpts = { cache: 'no-store' as RequestCache };
      const [activeRes, accuracyRes, healthRes] = await Promise.all([
        fetch(`/api/predictions?type=active${cacheBust}`, fetchOpts).then(r => r.json()).catch(() => ({ predictions: [] })),
        fetch(`/api/predictions?type=accuracy${cacheBust}`, fetchOpts).then(r => r.json()).catch(() => null),
        fetch(`/api/health?_t=${Date.now()}`, fetchOpts).then(r => r.json()).catch(() => null),
      ]);

      if (activeRes.predictions) setActivePredictions(activeRes.predictions);
      if (accuracyRes) setAccuracy(accuracyRes);
      if (healthRes) setHealth(healthRes);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch predictions data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 5 minutes to prevent stale data
  useEffect(() => {
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Load auto-trade config
  useEffect(() => {
    setAutoTradeConfig(getAutoTradeConfig());
  }, []);

  // Auto-run paper trades when predictions load (if enabled)
  useEffect(() => {
    if (!autoTradeConfig?.enabled || loading || activePredictions.length === 0) return;
    if (hasAutoTradedToday()) return; // already ran today

    const runAuto = async () => {
      setAutoTrading(true);
      try {
        const result = await runAutoPaperTrade(activePredictions);
        setAutoTradeResult(result);
      } catch (err) {
        console.error('[AutoTrade] Error:', err);
      }
      setAutoTrading(false);
    };
    runAuto();
  }, [autoTradeConfig?.enabled, loading, activePredictions]);

  // Auto-close positions every 5 minutes (check SL/Target)
  useEffect(() => {
    if (!autoTradeConfig?.enabled) return;
    const interval = setInterval(async () => {
      await autoClosePositions();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoTradeConfig?.enabled]);

  // Manual trigger for auto-trade
  const handleManualAutoTrade = async () => {
    setAutoTrading(true);
    setAutoTradeResult(null);
    try {
      const result = await runAutoPaperTrade(activePredictions);
      setAutoTradeResult(result);
    } catch (err: any) {
      console.error('[AutoTrade] Error:', err);
    }
    setAutoTrading(false);
  };

  const toggleAutoTrade = (enabled: boolean) => {
    const newConfig = { ...(autoTradeConfig || getAutoTradeConfig()), enabled };
    saveAutoTradeConfig(newConfig);
    setAutoTradeConfig(newConfig);
  };

  const updateAutoConfig = (updates: Partial<AutoTradeConfig>) => {
    const newConfig = { ...(autoTradeConfig || getAutoTradeConfig()), ...updates };
    saveAutoTradeConfig(newConfig);
    setAutoTradeConfig(newConfig);
  };

  const handleSeed = async () => {
    setSeeding(true);
    setSeedResult(null);
    
    let totalOk = 0, totalSkipped = 0, totalErrors = 0, totalStocks = 0;
    const allResults: any[] = [];
    const totalBatches = 5; // 25 stocks / 5 per batch

    try {
      for (let batch = 1; batch <= totalBatches; batch++) {
        // Update UI with progress
        setSeedResult({
          success: true,
          duration: 'in progress...',
          summary: { ok: totalOk, skipped: totalSkipped, errors: totalErrors, total: totalStocks },
          message: `Processing batch ${batch}/${totalBatches}...`,
        });

        const res = await fetch(`/api/seed-predictions?batch=${batch}&_t=${Date.now()}`, { cache: 'no-store' });
        
        // Handle non-JSON responses (e.g., Vercel timeout HTML pages)
        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          setSeedResult({ success: false, error: `Batch ${batch} failed: Server returned non-JSON (HTTP ${res.status}). Likely a timeout — try again.` });
          await fetchData();
          return;
        }
        
        if (!res.ok) {
          setSeedResult({ success: false, error: data.error || `Batch ${batch} failed: HTTP ${res.status}` });
          await fetchData();
          return;
        }

        totalOk += data.summary?.ok || 0;
        totalSkipped += data.summary?.skipped || 0;
        totalErrors += data.summary?.errors || 0;
        totalStocks += data.summary?.total || 0;
        allResults.push(...(data.results || []));
      }

      setSeedResult({
        success: true,
        duration: 'done',
        summary: { ok: totalOk, skipped: totalSkipped, errors: totalErrors, total: totalStocks },
        results: allResults,
      });
      // Re-fetch predictions data
      await fetchData();
    } catch (err: any) {
      setSeedResult({ success: false, error: `Network error: ${err.message}` });
    } finally {
      setSeeding(false);
    }
  };

  const isEmpty = !loading && activePredictions.length === 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in" style={{ width: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
            🤖 AI Predictions Center
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Track active ML model forecasts and historical accuracy scoreboard
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* System Health Badge */}
          {health && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold`}
              style={{
                background: health.status === 'failing' ? 'rgba(255,77,106,0.1)' : 'rgba(0,214,143,0.1)',
                borderColor: health.status === 'failing' ? 'rgba(255,77,106,0.3)' : 'rgba(0,214,143,0.3)',
                color: health.status === 'failing' ? 'var(--accent-red)' : 'var(--accent-green)'
              }}>
              <span className={`w-1.5 h-1.5 rounded-full ${health.status === 'failing' ? 'bg-red-400' : 'bg-green-400 animate-pulse'}`} />
              {health.status === 'failing' ? 'System Down' : 'System Active'}
            </div>
          )}

          {/* Refresh Button */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer hover:bg-white hover:bg-opacity-5"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            <span className={loading ? 'animate-spin' : ''}>↻</span>
            Refresh
          </button>
        </div>
      </div>

      {/* Health Warnings */}
      {health?.warnings?.length > 0 && (
        <div className="p-3 rounded-xl border" style={{ background: 'rgba(255,184,0,0.05)', borderColor: 'rgba(255,184,0,0.2)' }}>
          <p className="text-xs font-bold mb-1" style={{ color: '#fbbf24' }}>⚠️ System Notices</p>
          {health.warnings.map((w: string, i: number) => (
            <p key={i} className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>• {w}</p>
          ))}
        </div>
      )}

      {/* Stale Data Warning */}
      {!loading && activePredictions.length > 0 && (() => {
        // Find the NEWEST prediction timestamp (predictions are sorted by confidence, not time)
        const newestTime = Math.max(...activePredictions.map(p => {
          const t = p.predictedAt || p.predicted_at;
          return t ? new Date(t).getTime() : 0;
        }));
        const hoursOld = (Date.now() - newestTime) / (1000 * 60 * 60);
        if (hoursOld > 24) {
          return (
            <div className="p-4 rounded-xl border animate-fade-in" style={{ background: 'rgba(255,77,106,0.08)', borderColor: 'rgba(255,77,106,0.3)' }}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--accent-red)' }}>
                    ⚠️ Predictions are {Math.floor(hoursOld / 24)} day{Math.floor(hoursOld / 24) > 1 ? 's' : ''} old
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                    The automated cron job may not have run. Click below to generate fresh predictions now.
                  </p>
                </div>
                <button
                  onClick={handleSeed}
                  disabled={seeding}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', color: 'white', opacity: seeding ? 0.7 : 1 }}>
                  {seeding ? (
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
                  ) : (
                    <>🔄 Refresh Predictions Now</>
                  )}
                </button>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Scoreboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-5 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <p className="text-[10px] uppercase font-bold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Overall Accuracy</p>
          <h2 className="text-3xl font-bold" style={{ color: 'var(--accent-blue)' }}>
            {accuracy?.overall?.overallAccuracy ?? '--'}%
          </h2>
          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            {accuracy?.overall?.totalCorrect ?? 0} correct of {accuracy?.overall?.totalResolved ?? 0} resolved
          </p>
        </div>

        <div className="p-5 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <p className="text-[10px] uppercase font-bold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>30-Day Accuracy</p>
          <h2 className="text-3xl font-bold" style={{ color: 'var(--accent-purple)' }}>
            {accuracy?.overall?.accuracy30d ?? '--'}%
          </h2>
          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            Recent 30-day window
          </p>
        </div>

        <div className="p-5 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <p className="text-[10px] uppercase font-bold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Active Predictions</p>
          <h2 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {loading ? '...' : activePredictions.length}
          </h2>
          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Loading...'}
          </p>
        </div>

        {/* Best Stock */}
        <div className="p-5 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <p className="text-[10px] uppercase font-bold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Best Stock</p>
          {accuracy?.overall?.bestStock ? (
            <>
              <Link href={`/stock/${accuracy.overall.bestStock.symbol}`}
                className="text-xl font-bold hover:underline" style={{ color: 'var(--accent-blue)' }}>
                {accuracy.overall.bestStock.symbol}
              </Link>
              <p className="text-2xl font-bold" style={{ color: 'var(--accent-green)' }}>
                {accuracy.overall.bestStock.accuracy}%
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Highest win rate</p>
            </>
          ) : (
            <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>No resolved predictions</p>
          )}
        </div>
      </div>

      {/* Backtest Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AccuracyTrendChart />
        <BacktestCard />
        
        {/* Generate Button + Auto Paper Trading */}
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>⚡ Quick Actions</h3>
          <div className="space-y-3">
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer"
              style={{
                background: seeding ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: 'white', opacity: seeding ? 0.7 : 1,
              }}>
              {seeding ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
              ) : (
                <>🚀 Generate All Predictions</>
              )}
            </button>
            <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
              Generates predictions for top {KEY_STOCKS_COUNT} Nifty stocks. Runs automatically at 8:30 AM IST daily.
            </p>
          </div>

          {/* Auto Paper Trading Section */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                📝 Auto Paper Trading
              </h4>
              {/* Toggle */}
              <button
                onClick={() => toggleAutoTrade(!autoTradeConfig?.enabled)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  position: 'relative', transition: 'all 0.2s ease',
                  background: autoTradeConfig?.enabled ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)',
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', position: 'absolute', top: 3,
                  left: autoTradeConfig?.enabled ? 23 : 3, transition: 'all 0.2s ease',
                  background: autoTradeConfig?.enabled ? '#10b981' : 'rgba(255,255,255,0.3)',
                }} />
              </button>
            </div>

            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
              {autoTradeConfig?.enabled
                ? '✅ Active — Auto-places BUY orders for A/B-grade bullish signals daily with SL & target. Auto-closes when hit.'
                : 'When enabled, automatically places paper trades from AI predictions daily.'}
            </p>

            {/* Config Panel */}
            {autoTradeConfig?.enabled && (
              <>
                <button
                  onClick={() => setShowAutoConfig(!showAutoConfig)}
                  style={{
                    fontSize: 10, color: 'var(--accent-blue)', background: 'none',
                    border: 'none', cursor: 'pointer', fontWeight: 600, marginBottom: 8,
                    padding: 0,
                  }}
                >
                  {showAutoConfig ? '▼ Hide Settings' : '▶ Show Settings'}
                </button>

                {showAutoConfig && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12,
                    padding: 12, borderRadius: 10, background: 'rgba(15,20,42,0.6)',
                    border: '1px solid var(--border-subtle)',
                  }}>
                    {[
                      { label: 'Stop-Loss %', key: 'slPercent' as const, value: autoTradeConfig.slPercent },
                      { label: 'Target %', key: 'targetPercent' as const, value: autoTradeConfig.targetPercent },
                      { label: 'Risk/Trade %', key: 'riskPerTrade' as const, value: autoTradeConfig.riskPerTrade },
                      { label: 'Max Positions', key: 'maxPositions' as const, value: autoTradeConfig.maxPositions },
                    ].map(({ label, key, value }) => (
                      <div key={key}>
                        <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{label}</label>
                        <input
                          type="number" value={value}
                          onChange={e => updateAutoConfig({ [key]: parseFloat(e.target.value) || 0 })}
                          style={{
                            width: '100%', padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                            background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)', outline: 'none',
                          }}
                        />
                      </div>
                    ))}
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, marginTop: 4 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="checkbox" checked={autoTradeConfig.onlyAGrade} onChange={e => updateAutoConfig({ onlyAGrade: e.target.checked })} />
                        A-grade only
                      </label>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="checkbox" checked={autoTradeConfig.autoCloseOnSL} onChange={e => updateAutoConfig({ autoCloseOnSL: e.target.checked })} />
                        Auto-close SL
                      </label>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="checkbox" checked={autoTradeConfig.autoCloseOnTarget} onChange={e => updateAutoConfig({ autoCloseOnTarget: e.target.checked })} />
                        Auto-close Target
                      </label>
                    </div>
                  </div>
                )}

                {/* Run Now Button */}
                <button
                  onClick={handleManualAutoTrade}
                  disabled={autoTrading || activePredictions.length === 0}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
                    fontWeight: 700, fontSize: 12, cursor: autoTrading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    background: autoTrading ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #10b981, #059669)',
                    color: 'white', opacity: autoTrading ? 0.7 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {autoTrading ? (
                    <><span style={{ width: 14, height: 14, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block' }} /> Placing trades...</>
                  ) : hasAutoTradedToday() ? (
                    <>✅ Already ran today — Run again</>
                  ) : (
                    <>📝 Run Auto Paper Trade Now</>
                  )}
                </button>

                {/* Result Banner */}
                {autoTradeResult && (
                  <div style={{
                    marginTop: 8, padding: '10px 12px', borderRadius: 10, fontSize: 11, lineHeight: 1.6,
                    background: autoTradeResult.placed > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(255,184,0,0.08)',
                    border: `1px solid ${autoTradeResult.placed > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(255,184,0,0.2)'}`,
                    color: 'var(--text-secondary)',
                  }}>
                    {autoTradeResult.alreadyRanToday ? (
                      <span style={{ color: 'var(--text-muted)' }}>Already executed today. Will run again tomorrow.</span>
                    ) : (
                      <>
                        <strong style={{ color: '#10b981' }}>
                          📝 {autoTradeResult.placed} orders placed
                        </strong>
                        {autoTradeResult.closed > 0 && (
                          <span> · <strong style={{ color: '#f59e0b' }}>{autoTradeResult.closed} positions closed</strong> ({autoTradeResult.closedDetails.join(', ')})</span>
                        )}
                        {autoTradeResult.skipped > 0 && (
                          <span style={{ color: 'var(--text-muted)' }}> · {autoTradeResult.skipped} skipped</span>
                        )}
                        {autoTradeResult.details.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            {autoTradeResult.details.map(d => (
                              <span key={d.symbol} style={{
                                display: 'inline-block', fontSize: 10, padding: '2px 8px', borderRadius: 6, marginRight: 4, marginTop: 2,
                                background: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 600,
                              }}>
                                {d.symbol} × {d.qty} @ ₹{d.price.toFixed(0)}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* View Trades Link */}
                <Link href="/paper-trading" style={{
                  display: 'block', textAlign: 'center', marginTop: 8,
                  fontSize: 11, fontWeight: 600, color: 'var(--accent-blue)',
                }}>
                  View Paper Trading Dashboard →
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Seed Result Banner */}
      {seedResult && (
        <div className="p-4 rounded-xl border animate-fade-in"
          style={{
            background: seedResult.success ? 'rgba(0,214,143,0.08)' : 'rgba(255,77,106,0.08)',
            borderColor: seedResult.success ? 'rgba(0,214,143,0.3)' : 'rgba(255,77,106,0.3)',
          }}>
          {seedResult.success ? (
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--accent-green)' }}>
                {seedResult.message
                  ? `⏳ ${seedResult.message} (${seedResult.summary?.ok || 0} done so far)`
                  : `✅ Generated ${seedResult.summary?.ok || 0}/${seedResult.summary?.total || 0} predictions`
                }
              </p>
              {(seedResult.summary?.skipped > 0 || seedResult.summary?.errors > 0) && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  ⚠ {seedResult.summary.skipped} skipped, {seedResult.summary.errors} errors
                  {seedResult.results?.filter((r: any) => r.status === 'error').map((r: any) => ` [${r.symbol}: ${r.error}]`).join('')}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--accent-red)' }}>
                ❌ {seedResult.error || 'Unknown error'}
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Check browser console (F12) for details
              </p>
            </div>
          )}
        </div>
      )}

      {/* Predictions Split View */}
      {!loading && !isEmpty && (() => {
        // Helper to get trade grade from features_json
        const getGrade = (pred: any) => pred.features_json?.tradeGrade || pred.featuresJson?.tradeGrade || 'C';
        const getTradeable = (pred: any) => pred.features_json?.tradeable || pred.featuresJson?.tradeable || false;
        const getConfluence = (pred: any) => pred.features_json?.confluenceScore ?? pred.featuresJson?.confluenceScore ?? 0;
        const getBreakdown = (pred: any) => pred.features_json?.confluenceBreakdown || pred.featuresJson?.confluenceBreakdown || {};

        const tradeSignals = activePredictions.filter(p => getTradeable(p));
        const monitoring = activePredictions.filter(p => !getTradeable(p));

        const gradeStyles: Record<string, { bg: string; border: string; color: string; label: string }> = {
          A: { bg: 'rgba(0,214,143,0.12)', border: 'rgba(0,214,143,0.4)', color: '#00d68f', label: 'STRONG' },
          B: { bg: 'rgba(255,184,0,0.10)', border: 'rgba(255,184,0,0.4)', color: '#fbbf24', label: 'MODERATE' },
          C: { bg: 'rgba(255,255,255,0.03)', border: 'var(--border-color)', color: 'var(--text-muted)', label: 'WEAK' },
          D: { bg: 'rgba(255,77,106,0.05)', border: 'rgba(255,77,106,0.2)', color: 'var(--text-muted)', label: 'AVOID' },
          F: { bg: 'rgba(255,77,106,0.05)', border: 'rgba(255,77,106,0.2)', color: 'var(--text-muted)', label: 'NO EDGE' },
        };

        const categories = ['Technical', 'Bollinger', 'Volume', 'Institutional', 'Sentiment', 'Options'];
        const catIcons: Record<string, string> = {
          Technical: '📊', Bollinger: '📏', Volume: '📦', Institutional: '🏛️', Sentiment: '💬', Options: '📋',
        };

        const renderRow = (pred: any, highlight: boolean) => {
          const dir = pred.predictedDirection || pred.predicted_direction;
          const grade = getGrade(pred);
          const confluence = getConfluence(pred);
          const breakdown = getBreakdown(pred);
          const gs = gradeStyles[grade] || gradeStyles.C;

          return (
            <tr key={pred.id}
              className="border-b transition-colors hover:bg-white hover:bg-opacity-[0.02]"
              style={{ borderColor: 'var(--border-color)', opacity: highlight ? 1 : 0.6 }}>
              {/* Grade Badge */}
              <td className="p-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-black"
                  style={{ background: gs.bg, border: `1px solid ${gs.border}`, color: gs.color }}>
                  {grade}
                </span>
              </td>
              {/* Symbol */}
              <td className="p-3">
                <Link href={`/stock/${pred.symbol}`}
                  className="font-bold hover:underline" style={{ color: highlight ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>
                  {pred.symbol}
                </Link>
              </td>
              {/* Direction */}
              <td className="p-3">
                <span className="flex items-center gap-1 text-sm font-bold"
                  style={{ color: dir === 'up' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {dir === 'up' ? '▲ BUY' : '▼ SELL'}
                </span>
              </td>
              {/* Confidence */}
              <td className="p-3">
                <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{pred.probability}%</span>
              </td>
              {/* Confluence Dots */}
              <td className="p-3">
                <div className="flex gap-1" title={`${confluence}/6 signals aligned`}>
                  {categories.map(cat => {
                    const state = breakdown[cat] || 'neutral';
                    const dotColor = state === 'bullish' ? '#00d68f' : state === 'bearish' ? '#ff4d6a' : 'rgba(255,255,255,0.15)';
                    return (
                      <span key={cat} title={`${catIcons[cat]} ${cat}: ${state}`}
                        className="w-3.5 h-3.5 rounded-full inline-block"
                        style={{ background: dotColor, border: '1px solid rgba(255,255,255,0.1)' }} />
                    );
                  })}
                  <span className="text-[10px] ml-1 font-bold" style={{ color: 'var(--text-muted)' }}>{confluence}/6</span>
                </div>
              </td>
              {/* Time */}
              <td className="p-3 text-right">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {(pred.predictedAt || pred.predicted_at) ? formatPredictionTime(pred.predictedAt || pred.predicted_at) : '—'}
                </span>
              </td>
              {/* Action */}
              <td className="p-3 text-right">
                <Link href={`/stock/${pred.symbol}`}
                  className="text-[11px] px-2 py-1 rounded font-bold hover:bg-blue-600 transition-colors"
                  style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                  View →
                </Link>
              </td>
            </tr>
          );
        };

        return (
          <div className="space-y-6">
            {/* Active Trade Signals (A/B) */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-bold" style={{ color: 'var(--accent-green)' }}>
                  🎯 Active Trade Signals
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: 'rgba(0,214,143,0.1)', color: '#00d68f' }}>
                  {tradeSignals.length} of {activePredictions.length}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  High confluence — multiple signals aligned
                </span>
              </div>

              {tradeSignals.length === 0 ? (
                <div className="rounded-xl border p-6 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                  <p className="text-lg mb-1">🔍</p>
                  <p className="text-sm font-bold text-white">No strong trade signals today</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    The system is being selective — no stocks have enough signal confluence for a high-conviction trade right now. This is by design.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'rgba(0,214,143,0.2)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full text-left" style={{ minWidth: 700 }}>
                    <thead>
                      <tr className="border-b" style={{ background: 'rgba(0,214,143,0.04)', borderColor: 'var(--border-color)' }}>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Grade</th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Symbol</th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Signal</th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Confidence</th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Confluence</th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: 'var(--text-muted)' }}>Time</th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: 'var(--text-muted)' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradeSignals.map(pred => renderRow(pred, true))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Monitoring (C/D/F) */}
            {monitoring.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
                    ⚪ Monitoring ({monitoring.length})
                  </h2>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Low confluence — no trade recommended
                  </span>
                </div>
                <div className="rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', opacity: 0.7, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full text-left" style={{ minWidth: 700 }}>
                    <thead>
                      <tr className="border-b" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-color)' }}>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Grade</th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Symbol</th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Direction</th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Conf</th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Confluence</th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: 'var(--text-muted)' }}>Time</th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: 'var(--text-muted)' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitoring.map(pred => renderRow(pred, false))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Loading / Empty states */}
      {loading && (
        <div className="rounded-xl border p-12 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
          <p className="text-sm text-slate-400">Loading predictions...</p>
        </div>
      )}

      {isEmpty && (
        <div className="rounded-xl border p-10 text-center space-y-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <p className="text-4xl">📊</p>
          <div>
            <h3 className="text-lg font-bold text-white mb-1">No Active Predictions Yet</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Click "Generate Predictions" above to create predictions for the top Nifty stocks.
            </p>
          </div>
        </div>
      )}

      {/* Footer note */}
      <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
        AI predictions are for informational purposes only. Not financial advice. Accuracy improves as the model accumulates more historical data.
      </p>
    </div>
  );
}

const KEY_STOCKS_COUNT = 25;
