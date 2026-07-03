'use client';

import { useEffect, useState } from 'react';
import { RegimeAnalysis } from '@/lib/marketRegime';

export default function MarketRegimeWidget() {
  const [regime, setRegime] = useState<RegimeAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/regime?_t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d && !d.error) setRegime(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="glass-card-static rounded-2xl p-5">
        <h3 className="text-sm font-bold mb-4 text-white flex items-center gap-2">
          🎯 Market Regime
        </h3>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
        </div>
      </div>
    );
  }

  if (!regime) return null;

  const components = regime.components;
  const componentData = [
    { label: 'Trend', score: components.trendScore, icon: '📈' },
    { label: 'Momentum', score: components.momentumScore, icon: '⚡' },
    { label: 'Volatility', score: components.volatilityScore, icon: '🌊' },
    { label: 'Breadth', score: components.breadthScore, icon: '📊' },
    { label: 'FII Flow', score: components.flowScore, icon: '🏛️' },
  ];

  return (
    <div className="glass-card-static rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          🎯 Market Regime
        </h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
          style={{ background: `${regime.color}20`, color: regime.color }}>
          {regime.confidence}% conf
        </span>
      </div>

      {/* Regime Badge */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-xl"
        style={{ background: `${regime.color}10`, border: `1px solid ${regime.color}25` }}>
        <span className="text-3xl">{regime.emoji}</span>
        <div>
          <p className="text-base font-black" style={{ color: regime.color }}>
            {regime.label}
          </p>
          <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {regime.description}
          </p>
        </div>
      </div>

      {/* Component Scores */}
      <div className="space-y-2 mb-3">
        {componentData.map(c => {
          const normalized = (c.score + 100) / 2; // 0-100 range
          const color = c.score > 20 ? '#00d68f' : c.score < -20 ? '#ff4d6a' : '#fbbf24';

          return (
            <div key={c.label} className="flex items-center gap-2">
              <span className="text-xs w-4">{c.icon}</span>
              <span className="text-[10px] w-16 shrink-0 font-medium" style={{ color: 'var(--text-muted)' }}>
                {c.label}
              </span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${normalized}%`,
                    background: `linear-gradient(90deg, ${color}88, ${color})`,
                  }}
                />
              </div>
              <span className="text-[10px] font-bold w-8 text-right" style={{ color }}>
                {c.score > 0 ? '+' : ''}{c.score}
              </span>
            </div>
          );
        })}
      </div>

      {/* ML Adjustments */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 text-center p-2 rounded-lg" style={{ background: 'rgba(59,130,246,0.06)' }}>
          <p className="text-[9px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Confidence</p>
          <p className="text-xs font-bold" style={{ color: 'var(--accent-blue)' }}>
            ×{regime.adjustments.confidenceMultiplier.toFixed(2)}
          </p>
        </div>
        <div className="flex-1 text-center p-2 rounded-lg" style={{ background: 'rgba(255,77,106,0.06)' }}>
          <p className="text-[9px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Risk</p>
          <p className="text-xs font-bold" style={{ color: '#ff4d6a' }}>
            ×{regime.adjustments.riskMultiplier.toFixed(1)}
          </p>
        </div>
        <div className="flex-1 text-center p-2 rounded-lg" style={{ background: 'rgba(0,214,143,0.06)' }}>
          <p className="text-[9px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Size</p>
          <p className="text-xs font-bold" style={{ color: '#00d68f' }}>
            ×{regime.adjustments.positionSizeMultiplier.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Signals Toggle */}
      {regime.signals.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full text-left text-[10px] font-bold px-2 py-1.5 rounded-lg transition-all cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}
          >
            {expanded ? '▼' : '▶'} {regime.signals.length} signals detected
          </button>
          {expanded && (
            <div className="mt-2 space-y-1 pl-2 animate-fade-in">
              {regime.signals.map((s, i) => (
                <p key={i} className="text-[10px] flex items-start gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--accent-blue)' }}>•</span> {s}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
