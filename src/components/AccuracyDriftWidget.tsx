'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, BarChart3 } from 'lucide-react';

interface AccuracyDrift {
  current7d: number | null;
  previous7d: number | null;
  trend: 'improving' | 'declining' | 'stable' | 'insufficient';
  resolved7d: number;
  resolved14d: number;
  byConfidence: Record<string, { count: number; accuracy: number }>;
  modelVersion: string | null;
}

export default function AccuracyDriftWidget() {
  const [drift, setDrift] = useState<AccuracyDrift | null>(null);

  useEffect(() => {
    fetch('/api/accuracy?type=trend')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setDrift(data);
      })
      .catch(() => {});
  }, []);

  if (!drift || drift.trend === 'insufficient') return null;

  const isWarning = drift.trend === 'declining' && drift.current7d !== null && drift.current7d < 50;
  const isGood = drift.current7d !== null && drift.current7d >= 55;

  let TrendIcon: typeof TrendingUp;
  let trendColor: string;
  let trendLabel: string;
  let bgGrad: string;

  if (drift.trend === 'improving') {
    TrendIcon = TrendingUp;
    trendColor = '#00d68f';
    trendLabel = 'Improving';
    bgGrad = 'linear-gradient(135deg, rgba(0,214,143,0.06), rgba(0,214,143,0.02))';
  } else if (drift.trend === 'declining') {
    TrendIcon = TrendingDown;
    trendColor = isWarning ? '#f87171' : '#fbbf24';
    trendLabel = 'Declining';
    bgGrad = isWarning
      ? 'linear-gradient(135deg, rgba(248,113,113,0.06), rgba(248,113,113,0.02))'
      : 'linear-gradient(135deg, rgba(251,191,36,0.06), rgba(251,191,36,0.02))';
  } else {
    TrendIcon = BarChart3;
    trendColor = '#60a5fa';
    trendLabel = 'Stable';
    bgGrad = 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(59,130,246,0.02))';
  }

  return (
    <div
      className="glass-card-static rounded-2xl p-4 animate-fade-in-up"
      style={{ background: bgGrad }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Model Accuracy Drift
        </h3>
        <div className="flex items-center gap-1.5">
          <TrendIcon size={14} style={{ color: trendColor }} />
          <span className="text-[10px] font-bold" style={{ color: trendColor }}>
            {trendLabel}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* Current 7d accuracy */}
        <div>
          <p className="text-2xl font-black" style={{ color: trendColor }}>
            {drift.current7d !== null ? `${drift.current7d}%` : '—'}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Last 7 days ({drift.resolved7d} pred)
          </p>
        </div>

        {/* Previous 7d */}
        {drift.previous7d !== null && (
          <div>
            <p className="text-lg font-bold" style={{ color: 'var(--text-secondary)' }}>
              {drift.previous7d}%
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Prior 7 days
            </p>
          </div>
        )}

        {/* Delta */}
        {drift.current7d !== null && drift.previous7d !== null && (
          <div>
            {(() => {
              const delta = drift.current7d - drift.previous7d;
              return (
                <>
                  <p className="text-lg font-bold" style={{ color: delta >= 0 ? '#00d68f' : '#f87171' }}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Change
                  </p>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Warning banner if accuracy is bad */}
      {isWarning && (
        <div className="mt-3 p-2 rounded-lg flex items-center gap-2"
          style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}
        >
          <AlertTriangle size={12} style={{ color: '#f87171' }} />
          <span className="text-[11px] font-medium" style={{ color: '#f87171' }}>
            Accuracy below 50% — model may need retraining or more data
          </span>
        </div>
      )}

      {/* Confidence bucket mini-chart */}
      {drift.byConfidence && Object.keys(drift.byConfidence).length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Accuracy by Confidence
          </p>
          <div className="flex gap-2">
            {Object.entries(drift.byConfidence)
              .filter(([, v]) => v.count > 0)
              .map(([bucket, { count, accuracy }]) => (
                <div key={bucket} className="flex-1 text-center">
                  <div
                    className="h-8 rounded-md mb-1 flex items-end justify-center"
                    style={{ background: 'var(--bg-card)' }}
                  >
                    <div
                      className="w-full rounded-md transition-all"
                      style={{
                        height: `${Math.max(10, accuracy)}%`,
                        background: accuracy >= 55 ? 'rgba(0,214,143,0.5)' : 'rgba(251,191,36,0.5)',
                      }}
                    />
                  </div>
                  <p className="text-[9px] font-bold" style={{ color: accuracy >= 55 ? '#00d68f' : '#fbbf24' }}>
                    {accuracy}%
                  </p>
                  <p className="text-[8px]" style={{ color: 'var(--text-muted)' }}>
                    {bucket}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

