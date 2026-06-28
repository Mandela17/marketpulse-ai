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

const GLOBAL_INDICES = [
  { name: 'S&P 500', symbol: '^GSPC', flag: '🇺🇸' },
  { name: 'NASDAQ', symbol: '^IXIC', flag: '🇺🇸' },
  { name: 'Dow Jones', symbol: '^DJI', flag: '🇺🇸' },
  { name: 'FTSE 100', symbol: '^FTSE', flag: '🇬🇧' },
  { name: 'Nikkei 225', symbol: '^N225', flag: '🇯🇵' },
  { name: 'Hang Seng', symbol: '^HSI', flag: '🇭🇰' },
  { name: 'Shanghai', symbol: '000001.SS', flag: '🇨🇳' },
  { name: 'DAX', symbol: '^GDAXI', flag: '🇩🇪' },
];

export default function GlobalMarketsWidget() {
  const [indices, setIndices] = useState<GlobalIndex[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGlobal() {
      const results: GlobalIndex[] = [];

      // Fetch in parallel
      const promises = GLOBAL_INDICES.map(async (idx) => {
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(idx.symbol)}?range=1d&interval=1d`,
            { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } }
          );
          const data = await res.json();
          const meta = data?.chart?.result?.[0]?.meta;
          if (meta) {
            const price = meta.regularMarketPrice || 0;
            const prevClose = meta.chartPreviousClose || meta.previousClose || price;
            const change = price - prevClose;
            const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
            results.push({
              name: idx.name,
              symbol: idx.symbol,
              flag: idx.flag,
              price,
              change,
              changePercent: changePct,
            });
          }
        } catch {}
      });

      await Promise.all(promises);
      // Sort by the original order
      const ordered = GLOBAL_INDICES.map(idx =>
        results.find(r => r.symbol === idx.symbol)
      ).filter(Boolean) as GlobalIndex[];

      setIndices(ordered);
      setLoading(false);
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
  const globalSentiment = greenCount >= indices.length / 2 ? 'Risk On' : 'Risk Off';
  const sentimentColor = greenCount >= indices.length / 2 ? '#00d68f' : '#ff4d6a';

  return (
    <div className="glass-card-static rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          🌍 Global Markets
        </h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
          style={{ background: `${sentimentColor}15`, color: sentimentColor }}>
          {globalSentiment} ({greenCount}/{indices.length} 🟢)
        </span>
      </div>

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

      {indices.length === 0 && (
        <p className="text-[10px] text-center py-4" style={{ color: 'var(--text-muted)' }}>
          Global market data unavailable
        </p>
      )}
    </div>
  );
}
