'use client';

import { useEffect, useState } from 'react';
import { AccuracyTrendPoint } from '@/lib/predictionHistory';

export default function AccuracyTrendChart() {
  const [trend, setTrend] = useState<AccuracyTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'weekly' | 'cumulative'>('cumulative');

  useEffect(() => {
    fetch('/api/predictions?type=trend&weeks=12')
      .then(r => r.json())
      .then(d => {
        if (d.trend) setTrend(d.trend);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold mb-4 text-white">📈 Accuracy Trend</h3>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
        </div>
      </div>
    );
  }

  if (trend.length === 0) {
    return (
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold mb-3 text-white">📈 Accuracy Trend</h3>
        <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>
          No resolved predictions yet. Trend data will appear after predictions are resolved.
        </p>
      </div>
    );
  }

  const data = trend.map(t => ({
    label: new Date(t.weekStart + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    accuracy: mode === 'weekly' ? t.accuracy : t.cumulativeAccuracy,
    total: mode === 'weekly' ? t.total : t.cumulativeTotal,
    correct: mode === 'weekly' ? t.correct : t.cumulativeCorrect,
  }));

  const maxAcc = Math.max(...data.map(d => d.accuracy), 100);
  const minAcc = Math.min(...data.map(d => d.accuracy), 0);
  const chartH = 140;
  const range = Math.max(maxAcc - minAcc, 20);

  // Latest stats
  const latest = trend[trend.length - 1];
  const isImproving = trend.length >= 2 && trend[trend.length - 1].cumulativeAccuracy > trend[trend.length - 2].cumulativeAccuracy;

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          📈 Accuracy Trend
          {isImproving && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
              style={{ background: 'rgba(0,214,143,0.12)', color: '#00d68f' }}>
              ↑ IMPROVING
            </span>
          )}
        </h3>
        <div className="flex gap-1">
          <button onClick={() => setMode('cumulative')}
            className="text-[10px] px-2 py-1 rounded-lg font-bold cursor-pointer transition-all"
            style={{
              background: mode === 'cumulative' ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: mode === 'cumulative' ? '#60a5fa' : 'var(--text-muted)',
            }}>
            Cumulative
          </button>
          <button onClick={() => setMode('weekly')}
            className="text-[10px] px-2 py-1 rounded-lg font-bold cursor-pointer transition-all"
            style={{
              background: mode === 'weekly' ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: mode === 'weekly' ? '#60a5fa' : 'var(--text-muted)',
            }}>
            Weekly
          </button>
        </div>
      </div>

      {/* Summary Row */}
      <div className="flex gap-4 mb-4">
        <div>
          <p className="text-[9px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Current</p>
          <p className="text-lg font-black" style={{ color: latest.cumulativeAccuracy >= 60 ? '#00d68f' : latest.cumulativeAccuracy >= 50 ? '#fbbf24' : '#ff4d6a' }}>
            {latest.cumulativeAccuracy}%
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Resolved</p>
          <p className="text-lg font-black text-white">{latest.cumulativeTotal}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Correct</p>
          <p className="text-lg font-black" style={{ color: '#00d68f' }}>{latest.cumulativeCorrect}</p>
        </div>
      </div>

      {/* SVG Line Chart */}
      <div className="relative" style={{ height: chartH + 30 }}>
        <svg width="100%" height={chartH + 30} viewBox={`0 0 ${data.length * 60} ${chartH + 30}`} preserveAspectRatio="none">
          {/* 50% reference line */}
          <line
            x1="0" y1={chartH - ((50 - minAcc) / range) * chartH}
            x2={data.length * 60} y2={chartH - ((50 - minAcc) / range) * chartH}
            stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4"
          />

          {/* Area fill */}
          <defs>
            <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`M ${data.map((d, i) => `${i * 60 + 30} ${chartH - ((d.accuracy - minAcc) / range) * chartH}`).join(' L ')} L ${(data.length - 1) * 60 + 30} ${chartH} L 30 ${chartH} Z`}
            fill="url(#accGrad)"
          />

          {/* Line */}
          <polyline
            points={data.map((d, i) => `${i * 60 + 30},${chartH - ((d.accuracy - minAcc) / range) * chartH}`).join(' ')}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dots */}
          {data.map((d, i) => {
            const x = i * 60 + 30;
            const y = chartH - ((d.accuracy - minAcc) / range) * chartH;
            const color = d.accuracy >= 60 ? '#00d68f' : d.accuracy >= 50 ? '#fbbf24' : '#ff4d6a';
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="4" fill={color} stroke="var(--bg-card)" strokeWidth="2" />
                {/* Value label */}
                <text x={x} y={y - 10} textAnchor="middle" fill={color} fontSize="9" fontWeight="bold">
                  {d.accuracy}%
                </text>
              </g>
            );
          })}
        </svg>

        {/* X-axis labels */}
        <div className="flex justify-between absolute bottom-0 left-0 right-0 px-2">
          {data.map((d, i) => (
            <span key={i} className="text-[8px]" style={{ color: 'var(--text-muted)', width: 60, textAlign: 'center' }}>
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
