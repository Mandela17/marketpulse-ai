'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { getStockBySymbol } from '@/lib/sectorData';
import { DEMO_SECTORS, DEMO_NEWS, DEMO_SENTIMENT_HISTORY } from '@/lib/mockData';
import { getSentimentColor, getSentimentLabel } from '@/lib/types';
import SentimentGauge from '@/components/SentimentGauge';
import NewsCard from '@/components/NewsCard';

// Generate mock stock-level sentiment based on sector data
function getStockSentiment(symbol: string, sectorId: string) {
  const sector = DEMO_SECTORS.find(s => s.id === sectorId);
  if (!sector) return null;

  // Create a pseudo-random but deterministic offset based on symbol
  const hash = symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const offset = ((hash % 20) - 10);
  const score = Math.max(5, Math.min(95, sector.sentiment + offset));

  return {
    overall: score,
    news: Math.max(5, Math.min(95, score + ((hash % 10) - 5))),
    social: Math.max(5, Math.min(95, score + ((hash % 14) - 7))),
    geopolitical: Math.max(5, Math.min(95, score + ((hash % 8) - 4))),
    technical: Math.max(5, Math.min(95, score + ((hash % 12) - 6))),
  };
}

function getOutlook(score: number): 'bullish' | 'bearish' | 'neutral' {
  if (score > 60) return 'bullish';
  if (score < 40) return 'bearish';
  return 'neutral';
}

export default function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const decodedSymbol = decodeURIComponent(symbol).toUpperCase();
  const stock = getStockBySymbol(decodedSymbol);
  
  const [inWatchlist, setInWatchlist] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('marketpulse_watchlist');
    if (saved) {
      try {
        const list = JSON.parse(saved);
        setInWatchlist(list.includes(decodedSymbol));
      } catch (e) {
        console.error(e);
      }
    }
  }, [decodedSymbol]);

  const toggleWatchlist = () => {
    const saved = localStorage.getItem('marketpulse_watchlist');
    let list: string[] = [];
    if (saved) {
      try {
        list = JSON.parse(saved);
      } catch (e) {
        list = [];
      }
    }

    let updated: string[];
    if (list.includes(decodedSymbol)) {
      updated = list.filter(s => s !== decodedSymbol);
      setInWatchlist(false);
    } else {
      updated = [...list, decodedSymbol];
      setInWatchlist(true);
    }
    localStorage.setItem('marketpulse_watchlist', JSON.stringify(updated));
  };

  if (!stock) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-4xl mb-4">🔍</p>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Stock Not Found
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            We couldn&apos;t find sentiment data for &quot;{decodedSymbol}&quot;
          </p>
          <Link href="/search"
            className="text-sm px-4 py-2 rounded-lg font-medium"
            style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)' }}>
            Search Stocks
          </Link>
        </div>
      </div>
    );
  }

  const sentiment = getStockSentiment(stock.symbol, stock.sector);
  if (!sentiment) return null;

  const sector = DEMO_SECTORS.find(s => s.id === stock.sector);
  const relatedNews = DEMO_NEWS.filter(n =>
    n.relatedStocks.includes(stock.symbol) || n.relatedSectors.includes(stock.sector)
  ).slice(0, 5);

  const history = DEMO_SENTIMENT_HISTORY[stock.sector] || [50, 50, 50, 50, 50, 50, 50];

  // Risk factors
  const risks = [
    sector?.globalExposure || 'Global market volatility',
    `Sector sentiment at ${sector?.sentiment || 50} (${getSentimentLabel(sector?.sentiment || 50)})`,
    'Earnings announcement pending next quarter',
    'Regulatory changes in sector being monitored',
  ];

  const outlookConfig = {
    bullish: { icon: '▲', color: 'var(--accent-green)', bg: 'var(--accent-green-dim)', label: 'Bullish' },
    bearish: { icon: '▼', color: 'var(--accent-red)', bg: 'var(--accent-red-dim)', label: 'Bearish' },
    neutral: { icon: '—', color: 'var(--accent-yellow)', bg: 'var(--accent-yellow-dim)', label: 'Neutral' },
  };

  const day1 = getOutlook(sentiment.overall + 2);
  const week1 = getOutlook(sentiment.overall);
  const month1 = getOutlook(sentiment.overall - 3);

  return (
    <div className="p-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        <Link href="/" className="hover:underline" style={{ color: 'var(--accent-blue)' }}>Dashboard</Link>
        <span>/</span>
        <Link href={`/sector/${stock.sector}`} className="hover:underline capitalize" style={{ color: 'var(--accent-blue)' }}>
          {stock.sector}
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--text-primary)' }}>{stock.symbol}</span>
      </div>

      {/* Stock Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {stock.symbol}
            </h1>
            <button
              onClick={toggleWatchlist}
              className="text-lg p-1 rounded-lg transition-all hover:bg-opacity-10 hover:bg-white cursor-pointer"
              title={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
              style={{ color: inWatchlist ? 'var(--accent-yellow)' : 'var(--text-muted)' }}
            >
              {inWatchlist ? '★' : '☆'}
            </button>
            <span className="text-xs px-2 py-0.5 rounded-full capitalize font-medium"
              style={{ background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)' }}>
              {stock.sector}
            </span>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{stock.name}</p>
        </div>
        <SentimentGauge score={sentiment.overall} size="lg" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="xl:col-span-2 space-y-6">
          {/* Sentiment Breakdown */}
          <div className="rounded-xl p-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Sentiment Breakdown
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: '📰 News', score: sentiment.news, weight: '40%' },
                { label: '🐦 Social', score: sentiment.social, weight: '20%' },
                { label: '🌍 Geopolitical', score: sentiment.geopolitical, weight: '25%' },
                { label: '📈 Technical', score: sentiment.technical, weight: '15%' },
              ].map((item) => (
                <div key={item.label} className="text-center p-3 rounded-lg"
                  style={{ background: 'var(--bg-primary)' }}>
                  <SentimentGauge score={item.score} size="sm" showLabel={false} />
                  <p className="text-xs font-medium mt-2" style={{ color: 'var(--text-primary)' }}>
                    {item.label}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Weight: {item.weight}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Near-Term Outlook */}
          <div className="rounded-xl p-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Near-Term Outlook
            </h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: '1 Day', outlook: day1 },
                { label: '1 Week', outlook: week1 },
                { label: '1 Month', outlook: month1 },
              ].map((item) => {
                const cfg = outlookConfig[item.outlook];
                return (
                  <div key={item.label} className="text-center p-4 rounded-lg"
                    style={{ background: cfg.bg }}>
                    <p className="text-2xl mb-1">{cfg.icon}</p>
                    <p className="text-sm font-bold" style={{ color: cfg.color }}>{cfg.label}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sentiment History */}
          <div className="rounded-xl p-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Sector Sentiment History (7 Days)
            </h2>
            <div className="h-40 flex items-end gap-2">
              {history.map((val, i) => {
                const color = getSentimentColor(val);
                const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-medium" style={{ color }}>{val}</span>
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{
                        height: `${(val / 100) * 120}px`,
                        background: `linear-gradient(to top, ${color}40, ${color})`,
                      }}
                    />
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {dayLabels[i]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Risk Factors */}
          <div className="rounded-xl p-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-base font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              ⚠️ Key Risk Factors
            </h2>
            <div className="space-y-2">
              {risks.map((risk, i) => (
                <div key={i} className="flex items-start gap-2 text-sm"
                  style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--accent-yellow)' }}>•</span>
                  {risk}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Related News */}
        <div className="xl:col-span-1">
          <div className="sticky top-6">
            <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              📰 Related News
            </h2>
            <div className="space-y-0">
              {relatedNews.length > 0 ? (
                relatedNews.map((article) => (
                  <NewsCard key={article.id} article={article} />
                ))
              ) : (
                <p className="text-sm p-4 text-center rounded-xl"
                  style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
                  No recent news for this stock
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
