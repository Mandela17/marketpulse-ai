'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SystemHealth } from '@/lib/dataQuality';

export default function PredictionsDashboard() {
  const [activePredictions, setActivePredictions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [accuracy, setAccuracy] = useState<any>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'history'>('active');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [activeRes, accuracyRes, healthRes] = await Promise.all([
          fetch('/api/predictions?type=active').then(r => r.json()),
          fetch('/api/predictions?type=accuracy').then(r => r.json()),
          // Creating a quick inline health check endpoint or just assuming it's healthy for now 
          // if we don't have an API route for health yet.
          fetch('/api/health').then(r => r.ok ? r.json() : null).catch(() => null)
        ]);
        
        if (activeRes.predictions) setActivePredictions(activeRes.predictions);
        if (accuracyRes) setAccuracy(accuracyRes);
        if (healthRes) setHealth(healthRes);
      } catch (err) {
        console.error('Failed to fetch predictions data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // In a real app we would paginate this or filter by symbol
      // For now, let's just use the active view since history requires a symbol in our current API
      setTab('history');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>🤖 AI Predictions Center</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Track active ML model forecasts and historical accuracy scoreboard
          </p>
        </div>
        
        {/* Health Badge */}
        {health && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold"
            style={{ 
              background: health.status === 'healthy' ? 'rgba(0,214,143,0.1)' : 'rgba(255,184,0,0.1)',
              borderColor: health.status === 'healthy' ? 'rgba(0,214,143,0.3)' : 'rgba(255,184,0,0.3)',
              color: health.status === 'healthy' ? 'var(--accent-green)' : 'var(--accent-yellow)'
            }}>
            <span className={health.status === 'healthy' ? 'animate-pulse' : ''}>
              {health.status === 'healthy' ? '🟢 System Healthy' : '🟡 Degraded'}
            </span>
          </div>
        )}
      </div>

      {/* Scoreboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border glass-card" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <p className="text-xs uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Overall Accuracy</p>
          <div className="flex items-end gap-2">
            <h2 className="text-3xl font-bold" style={{ color: 'var(--accent-blue)' }}>
              {accuracy?.overall?.accuracy_pct || '--'}%
            </h2>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            {accuracy?.overall?.correct_count || 0} correct out of {accuracy?.overall?.total_resolved || 0}
          </p>
        </div>
        
        <div className="p-5 rounded-xl border glass-card" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <p className="text-xs uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>30-Day Accuracy</p>
          <div className="flex items-end gap-2">
            <h2 className="text-3xl font-bold" style={{ color: 'var(--accent-purple)' }}>
              {accuracy?.overall?.accuracy_30d_pct || '--'}%
            </h2>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            {accuracy?.overall?.correct_30d || 0} correct out of {accuracy?.overall?.resolved_30d || 0}
          </p>
        </div>

        <div className="p-5 rounded-xl border glass-card md:col-span-2" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
           <p className="text-xs uppercase font-bold tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Top Performing Stocks</p>
           {accuracy?.perStock && accuracy.perStock.length > 0 ? (
             <div className="flex gap-4">
               {accuracy.perStock.slice(0, 3).map((st: any) => (
                 <div key={st.symbol} className="flex-1 p-2 rounded bg-slate-900 border border-slate-800 text-center">
                   <Link href={`/stock/${st.symbol}`} className="font-bold text-blue-400 hover:underline">{st.symbol}</Link>
                   <p className="text-lg font-bold text-white">{st.accuracy_pct}%</p>
                   <p className="text-[10px] text-slate-400">{st.correct_count}/{st.total_resolved} wins</p>
                 </div>
               ))}
             </div>
           ) : (
             <p className="text-sm text-slate-500 py-4 text-center">Not enough resolved predictions yet</p>
           )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--border-color)' }}>
        <button 
          onClick={() => setTab('active')}
          className={`px-6 py-3 font-bold border-b-2 transition-all ${tab === 'active' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
          Active Predictions ({activePredictions.length})
        </button>
      </div>

      {/* Active Predictions Table */}
      {tab === 'active' && (
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-3 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
              <p className="text-sm text-slate-400">Loading predictions...</p>
            </div>
          ) : activePredictions.length === 0 ? (
             <div className="p-12 text-center">
              <p className="text-4xl mb-3">📭</p>
              <h3 className="text-lg font-bold text-white mb-1">No Active Predictions</h3>
              <p className="text-sm text-slate-400">The ML engine runs daily after market close.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b bg-slate-900" style={{ borderColor: 'var(--border-color)' }}>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Symbol</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Direction</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Confidence</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Risk/Reward</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">Predicted At</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {activePredictions.map((pred) => (
                    <tr key={pred.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-4">
                        <Link href={`/stock/${pred.symbol}`} className="font-bold text-blue-400 hover:underline">
                          {pred.symbol}
                        </Link>
                      </td>
                      <td className="p-4">
                        <span className="flex items-center gap-1.5 font-bold" style={{ color: pred.predicted_direction === 'up' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {pred.predicted_direction === 'up' ? '📈 BULLISH' : '📉 BEARISH'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{pred.probability}%</span>
                          <span className="text-[10px] px-2 py-0.5 rounded capitalize" 
                            style={{ 
                              background: pred.confidence_level === 'high' || pred.confidence_level === 'very_high' ? 'rgba(0,214,143,0.1)' : 'rgba(255,255,255,0.05)',
                              color: pred.confidence_level === 'high' || pred.confidence_level === 'very_high' ? 'var(--accent-green)' : 'var(--text-secondary)'
                            }}>
                            {pred.confidence_level.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        {/* We don't store risk/reward directly in the table currently, it's computed on the fly on stock page, 
                            but we could extract it from features_json if we saved it there. For now, placeholder */}
                         <span className="text-xs text-slate-400">See Details</span>
                      </td>
                      <td className="p-4 text-right text-sm text-slate-400">
                        {new Date(pred.predicted_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
