'use client';

import { useEffect, useState, useRef } from 'react';
import { AccuracyTrendPoint } from '@/lib/predictionHistory';

export default function AccuracyTrendChart() {
  const [trend, setTrend] = useState<AccuracyTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'weekly' | 'cumulative'>('cumulative');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(500);

  useEffect(() => {
    fetch('/api/predictions?type=trend&weeks=12')
      .then(r => r.json())
      .then(d => {
        if (d.trend) setTrend(d.trend);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Measure container width for responsive SVG
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [loading, trend]);

  const cardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
  };

  if (loading) {
    return (
      <div className="rounded-xl p-5" style={cardStyle}>
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
      <div className="rounded-xl p-5" style={cardStyle}>
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

  // Latest stats
  const latest = trend[trend.length - 1];
  const isImproving = trend.length >= 2 && trend[trend.length - 1].cumulativeAccuracy > trend[trend.length - 2].cumulativeAccuracy;

  const getAccuracyColor = (acc: number) =>
    acc >= 60 ? '#00d68f' : acc >= 50 ? '#fbbf24' : '#ff4d6a';

  // Single data point — show a clean card instead of a broken chart
  if (data.length === 1) {
    const d = data[0];
    const color = getAccuracyColor(d.accuracy);
    return (
      <div className="rounded-xl p-5" style={cardStyle}>
        <ChartHeader mode={mode} setMode={setMode} isImproving={isImproving} />
        <SummaryRow latest={latest} />

        <div className="flex flex-col items-center justify-center py-6 gap-3">
          {/* Big accuracy number */}
          <div className="relative flex items-center justify-center">
            <svg width="120" height="120" viewBox="0 0 120 120">
              {/* Background circle */}
              <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              {/* Progress arc */}
              <circle cx="60" cy="60" r="50" fill="none"
                stroke={color} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${(d.accuracy / 100) * 314} 314`}
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dasharray 0.8s ease' }}
              />
            </svg>
            <span className="absolute text-2xl font-black" style={{ color }}>
              {d.accuracy}%
            </span>
          </div>

          {/* Week label */}
          <div className="text-center">
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Week of {d.label}
            </p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {d.correct} correct of {d.total} predictions
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Multi-point chart
  const chartH = 140;
  const padX = 40; // left/right padding for labels
  const padTop = 24; // top padding for value labels
  const padBot = 24; // bottom padding for x-axis labels
  const svgW = containerWidth;
  const svgH = chartH + padTop + padBot;

  const accuracies = data.map(d => d.accuracy);
  const maxAcc = Math.max(...accuracies, 70);
  const minAcc = Math.min(...accuracies, 30);
  const range = Math.max(maxAcc - minAcc, 20);

  // Compute points in pixel-space
  const points = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * (svgW - padX * 2);
    const y = padTop + chartH - ((d.accuracy - minAcc) / range) * chartH;
    return { x, y, ...d };
  });

  // Build polyline and area path strings
  const linePoints = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')} L ${points[points.length - 1].x} ${padTop + chartH} L ${points[0].x} ${padTop + chartH} Z`;

  return (
    <div className="rounded-xl p-5" style={cardStyle}>
      <ChartHeader mode={mode} setMode={setMode} isImproving={isImproving} />
      <SummaryRow latest={latest} />

      {/* SVG Chart */}
      <div ref={containerRef} className="relative" style={{ height: svgH }}>
        <svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet">
          {/* Horizontal grid lines */}
          {[0, 25, 50, 75, 100].map(pct => {
            const val = minAcc + (pct / 100) * range;
            if (val < 0 || val > 100) return null;
            const y = padTop + chartH - ((val - minAcc) / range) * chartH;
            return (
              <g key={pct}>
                <line x1={padX} y1={y} x2={svgW - padX} y2={y}
                  stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                <text x={padX - 6} y={y + 3} textAnchor="end"
                  fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="inherit">
                  {Math.round(val)}%
                </text>
              </g>
            );
          })}

          {/* Area gradient fill */}
          <defs>
            <linearGradient id="accAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#accAreaGrad)" />

          {/* Line */}
          <polyline
            points={linePoints}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dots + value labels */}
          {points.map((p, i) => {
            const color = getAccuracyColor(p.accuracy);
            return (
              <g key={i}>
                {/* Glow */}
                <circle cx={p.x} cy={p.y} r="8" fill={color} opacity="0.15" />
                {/* Dot */}
                <circle cx={p.x} cy={p.y} r="4" fill={color} stroke="var(--bg-card)" strokeWidth="2" />
                {/* Value label above dot */}
                <text x={p.x} y={p.y - 12} textAnchor="middle"
                  fill={color} fontSize="10" fontWeight="700" fontFamily="inherit">
                  {p.accuracy}%
                </text>
              </g>
            );
          })}

          {/* X-axis labels */}
          {points.map((p, i) => (
            <text key={`x-${i}`} x={p.x} y={svgH - 4} textAnchor="middle"
              fill="rgba(255,255,255,0.35)" fontSize="9" fontFamily="inherit">
              {p.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

function ChartHeader({
  mode,
  setMode,
  isImproving,
}: {
  mode: 'weekly' | 'cumulative';
  setMode: (m: 'weekly' | 'cumulative') => void;
  isImproving: boolean;
}) {
  return (
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
        {(['cumulative', 'weekly'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className="text-[10px] px-2 py-1 rounded-lg font-bold cursor-pointer transition-all"
            style={{
              background: mode === m ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: mode === m ? '#60a5fa' : 'var(--text-muted)',
            }}>
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ latest }: { latest: AccuracyTrendPoint }) {
  return (
    <div className="flex gap-6 mb-4">
      <div>
        <p className="text-[9px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Current</p>
        <p className="text-xl font-black" style={{
          color: latest.cumulativeAccuracy >= 60 ? '#00d68f' : latest.cumulativeAccuracy >= 50 ? '#fbbf24' : '#ff4d6a'
        }}>
          {latest.cumulativeAccuracy}%
        </p>
      </div>
      <div>
        <p className="text-[9px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Resolved</p>
        <p className="text-xl font-black text-white">{latest.cumulativeTotal}</p>
      </div>
      <div>
        <p className="text-[9px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Correct</p>
        <p className="text-xl font-black" style={{ color: '#00d68f' }}>{latest.cumulativeCorrect}</p>
      </div>
    </div>
  );
}
