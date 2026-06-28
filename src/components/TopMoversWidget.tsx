'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Key Nifty stocks to check
const KEY_SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL',
  'ITC', 'LT', 'KOTAKBANK', 'AXISBANK', 'TITAN', 'SUNPHARMA', 'BAJFINANCE',
  'MARUTI', 'TATAMOTORS', 'WIPRO', 'HCLTECH', 'ADANIENT', 'NTPC',
  'M&M', 'TATASTEEL', 'JSWSTEEL', 'COALINDIA', 'POWERGRID',
];

interface StockMove {
  symbol: string;
  price: number;
  changePercent: number;
}

export default function TopMoversWidget() {
  const [movers, setMovers] = useState<StockMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'gainers' | 'losers'>('gainers');

  useEffect(() => {
    async function fetchMovers() {
      const results: StockMove[] = [];
      const batchSize = 8;

      for (let i = 0; i < KEY_SYMBOLS.length; i += batchSize) {
        const batch = KEY_SYMBOLS.slice(i, i + batchSize);
        const promises = batch.map(symbol =>
          fetch(`/api/stock?symbol=${symbol}`)
            .then(r => r.json())
            .then(data => {
              if (data && data.price > 0) {
                results.push({
                  symbol,
                  price: data.price,
                  changePercent: data.changePercent || 0,
                });
              }
            })
            .catch(() => {})
        );
        await Promise.all(promises);
      }

      setMovers(results);
      setLoading(false);
    }

    fetchMovers();
  }, []);

  const sorted = [...movers].sort((a, b) =>
    tab === 'gainers' ? b.changePercent - a.changePercent : a.changePercent - b.changePercent
  );
  const top5 = sorted.slice(0, 5);

  if (loading) {
    return (
      <div className="glass-card-static rounded-2xl p-5">
        <h3 className="text-sm font-bold mb-4 text-white flex items-center gap-2">
          🔥 Top Movers
        </h3>
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card-static rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          🔥 Top Movers
        </h3>
        <div className="flex gap-1">
          <button onClick={() => setTab('gainers')}
            className="text-[10px] px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer"
            style={{
              background: tab === 'gainers' ? 'rgba(0,214,143,0.15)' : 'transparent',
              color: tab === 'gainers' ? '#00d68f' : 'var(--text-muted)',
            }}>
            Gainers
          </button>
          <button onClick={() => setTab('losers')}
            className="text-[10px] px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer"
            style={{
              background: tab === 'losers' ? 'rgba(255,77,106,0.15)' : 'transparent',
              color: tab === 'losers' ? '#ff4d6a' : 'var(--text-muted)',
            }}>
            Losers
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {top5.map((stock, i) => {
          const isPositive = stock.changePercent >= 0;
          const barWidth = Math.min(Math.abs(stock.changePercent) * 20, 100);

          return (
            <Link key={stock.symbol} href={`/stock/${stock.symbol}`}
              className="flex items-center justify-between py-2 px-2 rounded-lg transition-all hover:brightness-125"
              style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-bold w-4 text-center" style={{ color: 'var(--text-muted)' }}>
                  {i + 1}
                </span>
                <div>
                  <p className="text-xs font-bold text-white">{stock.symbol}</p>
                  <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Mini bar */}
                <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${barWidth}%`,
                      background: isPositive ? '#00d68f' : '#ff4d6a',
                    }} />
                </div>
                <span className="text-xs font-black w-14 text-right"
                  style={{ color: isPositive ? '#00d68f' : '#ff4d6a' }}>
                  {isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {movers.length === 0 && (
        <p className="text-[10px] text-center py-4" style={{ color: 'var(--text-muted)' }}>
          Market data not available
        </p>
      )}
    </div>
  );
}
