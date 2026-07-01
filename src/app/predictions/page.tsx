'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import BacktestCard from '@/components/BacktestCard';
import AccuracyTrendChart from '@/components/AccuracyTrendChart';

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [activeRes, accuracyRes, healthRes] = await Promise.all([
        fetch('/api/predictions?type=active').then(r => r.json()).catch(() => ({ predictions: [] })),
        fetch('/api/predictions?type=accuracy').then(r => r.json()).catch(() => null),
        fetch('/api/health').then(r => r.json()).catch(() => null),
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

  const handleSeed = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      // Get Supabase access token from localStorage for admin auth
      const headers: Record<string, string> = {};
      try {
        const storageKeys = Object.keys(localStorage);
        const sbKey = storageKeys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (sbKey) {
          const parsed = JSON.parse(localStorage.getItem(sbKey) || '{}');
          const accessToken = parsed?.access_token || parsed?.[0]?.access_token;
          if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
          }
        }
      } catch {}

      const res = await fetch('/api/seed-predictions', { headers });
      const data = await res.json();
      setSeedResult(data);
      // Re-fetch data after seeding
      await fetchData();
    } catch (err) {
      setSeedResult({ success: false, error: 'Failed to seed predictions' });
    } finally {
      setSeeding(false);
    }
  };

  const isEmpty = !loading && activePredictions.length === 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
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

      {/* Scoreboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
        
        {/* Generate Button */}
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
            <p className="text-sm font-bold" style={{ color: 'var(--accent-green)' }}>
              ✅ Generated predictions: {seedResult.summary.ok} stocks predicted, {seedResult.summary.skipped} skipped, {seedResult.summary.errors} errors
            </p>
          ) : (
            <p className="text-sm font-bold" style={{ color: 'var(--accent-red)' }}>
              ❌ {seedResult.error}
            </p>
          )}
        </div>
      )}

      {/* Predictions Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold border-b pb-2 w-full" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}>
            Active Predictions ({activePredictions.length})
          </h2>
        </div>

        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
                style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
              <p className="text-sm text-slate-400">Loading predictions...</p>
            </div>
          ) : isEmpty ? (
            <div className="p-10 text-center space-y-4">
              <p className="text-4xl">📊</p>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">No Active Predictions Yet</h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  The ML engine hasn't run yet. Click the button below to generate predictions for the top 25 Nifty stocks right now, or visit individual stock pages to trigger predictions one at a time.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
                <button
                  onClick={handleSeed}
                  disabled={seeding}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer"
                  style={{
                    background: seeding ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    color: 'white',
                    opacity: seeding ? 0.7 : 1,
                  }}>
                  {seeding ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generating ({KEY_STOCKS_COUNT} stocks)...
                    </>
                  ) : (
                    <>🚀 Generate Predictions Now</>
                  )}
                </button>

                <span className="text-xs text-slate-500">or visit a stock page to trigger individually</span>
              </div>

              <div className="mt-4 p-3 rounded-lg text-left max-w-sm mx-auto"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                  Quick Links — Popular Stocks
                </p>
                <div className="flex flex-wrap gap-2">
                  {['RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'SBIN', 'BHARTIARTL'].map(s => (
                    <Link key={s} href={`/stock/${s}`}
                      className="text-[11px] px-2 py-1 rounded font-medium hover:bg-blue-600 transition-colors"
                      style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                      {s}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--border-color)' }}>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Symbol</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Direction</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Confidence</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Level</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: 'var(--text-muted)' }}>Predicted At</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: 'var(--text-muted)' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activePredictions.map((pred, idx) => (
                    <tr key={pred.id}
                      className="border-b transition-colors hover:bg-white hover:bg-opacity-[0.02]"
                      style={{ borderColor: 'var(--border-color)' }}>
                      <td className="p-4">
                        <Link href={`/stock/${pred.symbol}`}
                          className="font-bold hover:underline" style={{ color: 'var(--accent-blue)' }}>
                          {pred.symbol}
                        </Link>
                      </td>
                      <td className="p-4">
                        <span className="flex items-center gap-1.5 text-sm font-bold"
                          style={{ color: (pred.predictedDirection || pred.predicted_direction) === 'up' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {(pred.predictedDirection || pred.predicted_direction) === 'up' ? '📈 BULLISH' : '📉 BEARISH'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{pred.probability}%</span>
                          {/* Confidence bar */}
                          <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                            <div className="h-full rounded-full transition-all"
                              style={{
                                width: `${pred.probability}%`,
                                background: pred.probability >= 70 ? 'var(--accent-green)' :
                                            pred.probability >= 60 ? 'var(--accent-yellow)' : 'var(--text-muted)',
                              }} />
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-[10px] px-2 py-0.5 rounded capitalize font-medium"
                          style={{
                            background: (pred.confidenceLevel || pred.confidence_level) === 'high' || (pred.confidenceLevel || pred.confidence_level) === 'very_high'
                              ? 'rgba(0,214,143,0.1)' : 'rgba(255,255,255,0.05)',
                            color: (pred.confidenceLevel || pred.confidence_level) === 'high' || (pred.confidenceLevel || pred.confidence_level) === 'very_high'
                              ? 'var(--accent-green)' : 'var(--text-secondary)',
                          }}>
                          {(pred.confidenceLevel || pred.confidence_level)?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {(pred.predictedAt || pred.predicted_at) ? formatPredictionTime(pred.predictedAt || pred.predicted_at) : '—'}
                        </span>
                        {(pred.modelVersion || pred.model_version) && (
                          <p className="text-[9px] mt-0.5" style={{ color: 'rgba(139,92,246,0.7)' }}>
                            {pred.modelVersion || pred.model_version}
                          </p>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <Link href={`/stock/${pred.symbol}`}
                          className="text-[11px] px-2 py-1 rounded font-bold hover:bg-blue-600 transition-colors"
                          style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
        AI predictions are for informational purposes only. Not financial advice. Accuracy improves as the model accumulates more historical data.
      </p>
    </div>
  );
}

const KEY_STOCKS_COUNT = 25;
