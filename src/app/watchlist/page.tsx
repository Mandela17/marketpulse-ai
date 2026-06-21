'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DEMO_SECTORS } from '@/lib/mockData';
import { getSentimentColor, getSentimentLabel } from '@/lib/types';

const defaultWatchlist = [
  'RELIANCE', 'TATAMOTORS', 'ADANIGREEN', 'HAL', 'TITAN',
  'HDFCBANK', 'TCS', 'NTPC', 'OLECTRA', 'MARUTI',
];

export default function WatchlistPage() {
  const [watchlist] = useState(defaultWatchlist);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          ⭐ My Watchlist
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Track sentiment for your favorite stocks
        </p>
      </div>

      <div className="rounded-xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Stock</th>
              <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Sector</th>
              <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Sentiment</th>
              <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Label</th>
              <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {watchlist.map((symbol) => {
              // Find which sector this stock belongs to
              const sector = DEMO_SECTORS.find(s => s.stocks.includes(symbol));
              const hash = symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
              const score = sector ? Math.max(10, Math.min(90, sector.sentiment + ((hash % 20) - 10))) : 50;
              const color = getSentimentColor(score);

              return (
                <tr key={symbol}
                  className="transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid var(--border-color)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td className="px-4 py-3">
                    <Link href={`/stock/${symbol}`}>
                      <span className="text-sm font-bold" style={{ color: 'var(--accent-blue)' }}>
                        {symbol}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                      style={{ background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)' }}>
                      {sector?.id || 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-bold" style={{ color }}>
                      {score}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-medium" style={{ color }}>
                      {getSentimentLabel(score)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link href={`/stock/${symbol}`}
                      className="text-[10px] px-2 py-1 rounded font-medium"
                      style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)' }}>
                      Analyze
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
