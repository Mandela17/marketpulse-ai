'use client';

import { use } from 'react';
import Link from 'next/link';
import { SECTORS, getStocksBySector } from '@/lib/sectorData';
import { DEMO_SECTORS, DEMO_NEWS, DEMO_SENTIMENT_HISTORY } from '@/lib/mockData';
import { getSentimentColor, getSentimentLabel } from '@/lib/types';
import SentimentGauge from '@/components/SentimentGauge';
import NewsCard from '@/components/NewsCard';

export default function SectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sectorConfig = SECTORS[id as keyof typeof SECTORS];
  const sectorData = DEMO_SECTORS.find(s => s.id === id);
  const stocks = getStocksBySector(id);
  const history = DEMO_SENTIMENT_HISTORY[id] || [50, 50, 50, 50, 50, 50, 50];

  if (!sectorConfig || !sectorData) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-4xl mb-4">📊</p>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Sector Not Found
          </h2>
          <Link href="/" className="text-sm" style={{ color: 'var(--accent-blue)' }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const relatedNews = DEMO_NEWS.filter(n => n.relatedSectors.includes(id)).slice(0, 5);

  return (
    <div className="p-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        <Link href="/" className="hover:underline" style={{ color: 'var(--accent-blue)' }}>Dashboard</Link>
        <span>/</span>
        <span style={{ color: 'var(--text-primary)' }}>{sectorData.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">{sectorData.icon}</span>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {sectorData.name}
            </h1>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {sectorData.keyDriver}
          </p>
        </div>
        <SentimentGauge score={sectorData.sentiment} size="lg" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                24h Change
              </p>
              <p className="text-xl font-bold" style={{
                color: sectorData.change24h >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
              }}>
                {sectorData.change24h >= 0 ? '+' : ''}{sectorData.change24h.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Trend
              </p>
              <p className="text-xl font-bold" style={{
                color: sectorData.trend === 'up' ? 'var(--accent-green)' :
                  sectorData.trend === 'down' ? 'var(--accent-red)' : 'var(--accent-yellow)',
              }}>
                {sectorData.trend === 'up' ? '↑ Up' : sectorData.trend === 'down' ? '↓ Down' : '→ Flat'}
              </p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Stocks Tracked
              </p>
              <p className="text-xl font-bold" style={{ color: 'var(--accent-blue)' }}>
                {stocks.length}
              </p>
            </div>
          </div>

          {/* Global Exposure */}
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-base font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              🌍 Global Exposure
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {sectorConfig.globalExposure}
            </p>
          </div>

          {/* Sentiment History */}
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Sentiment Trend (7 Days)
            </h2>
            <div className="h-40 flex items-end gap-3">
              {history.map((val, i) => {
                const color = getSentimentColor(val);
                const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-bold" style={{ color }}>{val}</span>
                    <div className="w-full rounded-t-lg transition-all"
                      style={{
                        height: `${(val / 100) * 120}px`,
                        background: `linear-gradient(to top, ${color}30, ${color})`,
                      }} />
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{dayLabels[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stocks in Sector */}
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Stocks in {sectorData.name}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {stocks.map((stock) => {
                const hash = stock.symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                const mockSentiment = Math.max(10, Math.min(90, sectorData.sentiment + ((hash % 20) - 10)));
                const color = getSentimentColor(mockSentiment);

                return (
                  <Link key={stock.symbol} href={`/stock/${stock.symbol}`}>
                    <div className="card-hover rounded-lg p-3 cursor-pointer"
                      style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold" style={{ color: 'var(--accent-blue)' }}>
                          {stock.symbol}
                        </span>
                        <span className="text-xs font-bold" style={{ color }}>
                          {mockSentiment}
                        </span>
                      </div>
                      <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                        {stock.name}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="xl:col-span-1">
          <div className="sticky top-6">
            <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              📰 Sector News
            </h2>
            {relatedNews.length > 0 ? (
              relatedNews.map((article) => (
                <NewsCard key={article.id} article={article} />
              ))
            ) : (
              <p className="text-sm p-4 rounded-xl text-center"
                style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
                No recent news for this sector
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
