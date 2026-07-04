'use client';

import { useEffect, useState } from 'react';

interface GlobalIndex {
  name: string;
  symbol: string;
  flag: string;
  price: number;
  change: number;
  changePercent: number;
}

export default function GlobalMarketsWidget() {
  const [indices, setIndices] = useState<GlobalIndex[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGlobal() {
      try {
        const res = await fetch(`/api/global-markets?_t=${Date.now()}`, { cache: 'no-store' });
        const data = await res.json();
        setIndices(data.indices || []);
      } catch {
        setIndices([]);
      } finally {
        setLoading(false);
      }
    }

    fetchGlobal();
  }, []);

  if (loading) {
    return (
      <div className="glass-card-static rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">🌍 Global Markets</h3>
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
        </div>
      </div>
    );
  }

  // Summary
  const greenCount = indices.filter(i => i.changePercent >= 0).length;
  const total = indices.length || 1;
  const globalSentiment = greenCount >= total / 2 ? 'Risk On' : 'Risk Off';
  const sentimentColor = greenCount >= total / 2 ? '#00d68f' : '#ff4d6a';

  return (
    <div className="glass-card-static rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          🌍 Global Markets
        </h3>
        {indices.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
            style={{ background: `${sentimentColor}15`, color: sentimentColor }}>
            {globalSentiment} ({greenCount}/{indices.length} 🟢)
          </span>
        )}
      </div>

      {indices.length > 0 ? (
        <div className="space-y-1">
          {indices.map((idx) => {
            const isUp = idx.changePercent >= 0;
            return (
              <div key={idx.symbol}
                className="flex items-center justify-between py-1.5 px-1 rounded-lg transition-all"
                style={{ background: 'rgba(255,255,255,0.01)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs">{idx.flag}</span>
                  <div>
                    <p className="text-[11px] font-bold text-white">{idx.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {idx.price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[10px] font-bold" style={{ color: isUp ? '#00d68f' : '#ff4d6a' }}>
                    {isUp ? '+' : ''}{idx.changePercent.toFixed(2)}%
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-center py-4" style={{ color: 'var(--text-muted)' }}>
          Global market data unavailable — try refreshing
        </p>
      )}
    </div>
  );
}
