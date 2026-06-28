'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const SCREENER_STOCKS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL',
  'ITC', 'LT', 'KOTAKBANK', 'AXISBANK', 'TITAN', 'SUNPHARMA', 'BAJFINANCE',
  'MARUTI', 'TATAMOTORS', 'WIPRO', 'HCLTECH', 'NTPC', 'POWERGRID',
  'M&M', 'TATASTEEL', 'JSWSTEEL', 'COALINDIA', 'ADANIENT', 'ADANIPORTS',
  'HINDUNILVR', 'DRREDDY', 'CIPLA', 'NESTLEIND', 'ASIANPAINT', 'HEROMOTOCO',
  'BAJAJ-AUTO', 'EICHERMOT', 'BPCL', 'ONGC', 'ULTRACEMCO', 'GRASIM',
  'BEL', 'HAL', 'TRENT', 'INDUSINDBK',
];

interface ScreenerStock {
  symbol: string;
  price: number;
  changePercent: number;
  prediction?: { direction: string; probability: number } | null;
}

type Filter = 'all' | 'bullish' | 'bearish' | 'gainers' | 'losers' | 'high-confidence';

export default function ScreenerPage() {
  const [stocks, setStocks] = useState<ScreenerStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchAll() {
      const results: ScreenerStock[] = [];
      const batchSize = 8;

      for (let i = 0; i < SCREENER_STOCKS.length; i += batchSize) {
        const batch = SCREENER_STOCKS.slice(i, i + batchSize);
        const promises = batch.map(async (symbol) => {
          try {
            const [stockRes, predRes] = await Promise.all([
              fetch(`/api/stock?symbol=${symbol}`).then(r => r.json()).catch(() => null),
              fetch(`/api/predict?symbol=${symbol}`).then(r => r.json()).catch(() => null),
            ]);
            const q = stockRes?.quote || stockRes;
            if (q?.price > 0) {
              results.push({
                symbol,
                price: q.price,
                changePercent: q.changePercent || 0,
                prediction: predRes?.prediction ? {
                  direction: predRes.prediction.direction,
                  probability: predRes.prediction.probability,
                } : null,
              });
            }
          } catch {}
        });
        await Promise.all(promises);
      }
      setStocks(results);
      setLoading(false);
    }
    fetchAll();
  }, []);

  // Apply filters
  let filtered = stocks.filter(s => {
    if (search && !s.symbol.toLowerCase().includes(search.toLowerCase())) return false;

    switch (filter) {
      case 'bullish': return s.prediction?.direction === 'bullish';
      case 'bearish': return s.prediction?.direction === 'bearish';
      case 'gainers': return s.changePercent > 0;
      case 'losers': return s.changePercent < 0;
      case 'high-confidence': return (s.prediction?.probability || 0) >= 70;
      default: return true;
    }
  });

  // Sort by change
  filtered = filtered.sort((a, b) => b.changePercent - a.changePercent);

  const filters: { key: Filter; label: string; emoji: string }[] = [
    { key: 'all', label: 'All', emoji: '📋' },
    { key: 'bullish', label: 'AI Bullish', emoji: '🟢' },
    { key: 'bearish', label: 'AI Bearish', emoji: '🔴' },
    { key: 'gainers', label: 'Gainers', emoji: '📈' },
    { key: 'losers', label: 'Losers', emoji: '📉' },
    { key: 'high-confidence', label: 'High Confidence', emoji: '🎯' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 animate-fade-in-up">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">🔎 Stock Screener</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Filter {SCREENER_STOCKS.length} stocks by AI predictions, performance & confidence
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5 animate-fade-in-up">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <span>🔍</span>
          <input
            type="text"
            placeholder="Search symbol..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent outline-none text-sm w-full text-white"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filters.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className="text-[10px] px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer"
              style={{
                background: filter === f.key ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
                color: filter === f.key ? '#60a5fa' : 'var(--text-muted)',
                border: `1px solid ${filter === f.key ? 'rgba(59,130,246,0.3)' : 'var(--border-subtle)'}`,
              }}>
              {f.emoji} {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results Count */}
      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Showing {filtered.length} of {stocks.length} stocks
        {loading && ' (loading...)'}
      </p>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Scanning {SCREENER_STOCKS.length} stocks with AI analysis...</p>
        </div>
      )}

      {/* Results Table */}
      {!loading && filtered.length > 0 && (
        <div className="rounded-xl overflow-hidden shadow-xl animate-fade-in-up"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>#</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Stock</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>Price</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Change</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>AI Signal</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>Confidence</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((stock, i) => {
                const isUp = stock.changePercent >= 0;
                const pred = stock.prediction;
                const confColor = (pred?.probability || 0) >= 70 ? '#00d68f' :
                                  (pred?.probability || 0) >= 60 ? '#fbbf24' : '#94a3b8';

                return (
                  <tr key={stock.symbol}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/stock/${stock.symbol}`} className="text-sm font-bold hover:underline" style={{ color: '#60a5fa' }}>
                        {stock.symbol}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      <span className="text-xs font-bold text-white">
                        ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs font-bold" style={{ color: isUp ? '#00d68f' : '#ff4d6a' }}>
                        {isUp ? '+' : ''}{stock.changePercent.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      {pred ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                          style={{
                            background: pred.direction === 'bullish' ? 'rgba(0,214,143,0.12)' : 'rgba(255,77,106,0.12)',
                            color: pred.direction === 'bullish' ? '#00d68f' : '#ff4d6a',
                          }}>
                          {pred.direction === 'bullish' ? '🟢 BULL' : '🔴 BEAR'}
                        </span>
                      ) : (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      {pred ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pred.probability}%`, background: confColor }} />
                          </div>
                          <span className="text-[10px] font-bold" style={{ color: confColor }}>{pred.probability}%</span>
                        </div>
                      ) : (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/stock/${stock.symbol}`}
                        className="text-[10px] px-2.5 py-1 rounded-lg font-bold transition-all hover:brightness-125"
                        style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>
                        Analyze
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <p className="text-3xl mb-2">🔎</p>
          <p className="text-sm text-white font-bold">No stocks match your filter</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Try a different filter or search term</p>
        </div>
      )}
    </div>
  );
}
