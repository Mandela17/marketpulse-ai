'use client';

import { useEffect, useState } from 'react';
import { getSentimentColor, getSentimentLabel, SectorData, NewsArticle } from '@/lib/types';
import SectorCard from '@/components/SectorCard';
import SentimentGauge from '@/components/SentimentGauge';
import NewsCard from '@/components/NewsCard';
import { DEMO_SECTORS, DEMO_NEWS, DEMO_MARKET_OVERVIEW, DEMO_GEOPOLITICAL_EVENTS } from '@/lib/mockData';

interface MarketData {
  nifty50: { value: number; change: number; changePercent: number };
  sensex: { value: number; change: number; changePercent: number };
  marketStatus: string;
}

export default function Dashboard() {
  const [sectors, setSectors] = useState<SectorData[]>(DEMO_SECTORS);
  const [news, setNews] = useState<NewsArticle[]>(DEMO_NEWS);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch real news + sentiment in parallel with market data
        const [newsRes, marketRes] = await Promise.all([
          fetch('/api/news').then(r => r.json()).catch(() => null),
          fetch('/api/market').then(r => r.json()).catch(() => null),
        ]);

        if (newsRes && newsRes.articles) {
          setNews(newsRes.articles);
          setIsLive(true);

          // Convert sectorSentiments to SectorData array
          if (newsRes.sectorSentiments) {
            const sectorArray: SectorData[] = Object.values(newsRes.sectorSentiments);
            // Sort by priority sectors first
            const priorityOrder = ['defense', 'power', 'gold', 'energy', 'ev', 'auto', 'banking', 'realestate', 'it', 'pharma', 'metals', 'fmcg'];
            sectorArray.sort((a: SectorData, b: SectorData) => {
              const aIdx = priorityOrder.indexOf(a.id);
              const bIdx = priorityOrder.indexOf(b.id);
              return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
            });
            setSectors(sectorArray);
          }

          setLastUpdated(newsRes.lastUpdated || new Date().toISOString());
        }

        if (marketRes && !marketRes.error) {
          setMarketData(marketRes);
        }
      } catch (error) {
        console.error('Failed to fetch live data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Auto-refresh every 10 minutes
    const interval = setInterval(fetchData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const overview = DEMO_MARKET_OVERVIEW;
  const geoEvents = DEMO_GEOPOLITICAL_EVENTS;
  const nifty = marketData?.nifty50 || overview.nifty50;
  const sensex = marketData?.sensex || overview.sensex;
  const mktStatus = marketData?.marketStatus || overview.marketStatus;

  // Compute overall sentiment from sectors
  const overallSentiment = sectors.length > 0
    ? Math.round(sectors.reduce((sum, s) => sum + s.sentiment, 0) / sectors.length)
    : overview.overallSentiment;

  // Biggest movers
  const biggestMovers = [...sectors].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 5);

  return (
    <div className="p-6">
      {/* Market Overview Header */}
      <div className="mb-6 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Market Dashboard
            </h1>
            <p className="text-sm mt-1 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              AI-powered sentiment analysis for Indian markets
              {isLive && (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: 'var(--accent-green-dim)', color: 'var(--accent-green)' }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-green)' }} />
                  LIVE DATA
                </span>
              )}
              {loading && (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: 'var(--accent-yellow-dim)', color: 'var(--accent-yellow)' }}>
                  ⏳ Loading live data...
                </span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {lastUpdated
                ? `Updated: ${new Date(lastUpdated).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
                : `Last updated: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
              }
            </p>
          </div>
        </div>

        {/* Market Summary Strip */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Overall Sentiment */}
          <div className="rounded-xl p-4 flex items-center gap-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <SentimentGauge score={overallSentiment} size="sm" showLabel={false} />
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
                Overall Sentiment
              </p>
              <p className="text-lg font-bold" style={{ color: getSentimentColor(overallSentiment) }}>
                {getSentimentLabel(overallSentiment)}
              </p>
            </div>
          </div>

          {/* NIFTY 50 */}
          <div className="rounded-xl p-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
              NIFTY 50 {mktStatus === 'open' ? '🟢' : '🔴'}
            </p>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {nifty.value > 0 ? nifty.value.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
            </p>
            {nifty.value > 0 && (
              <p className="text-sm font-medium" style={{
                color: nifty.change >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
              }}>
                {nifty.change >= 0 ? '+' : ''}{nifty.change.toFixed(2)} ({nifty.changePercent >= 0 ? '+' : ''}{nifty.changePercent.toFixed(2)}%)
              </p>
            )}
          </div>

          {/* SENSEX */}
          <div className="rounded-xl p-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
              SENSEX {mktStatus === 'open' ? '🟢' : '🔴'}
            </p>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {sensex.value > 0 ? sensex.value.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
            </p>
            {sensex.value > 0 && (
              <p className="text-sm font-medium" style={{
                color: sensex.change >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
              }}>
                {sensex.change >= 0 ? '+' : ''}{sensex.change.toFixed(2)} ({sensex.changePercent >= 0 ? '+' : ''}{sensex.changePercent.toFixed(2)}%)
              </p>
            )}
          </div>

          {/* Geo Alerts + Article Count */}
          <div className="rounded-xl p-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
              News Sentiment
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-green)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--accent-green)' }}>
                  {news.filter(n => n.sentimentLabel === 'positive').length}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Bull</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-yellow)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--accent-yellow)' }}>
                  {news.filter(n => n.sentimentLabel === 'neutral').length}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Neut</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-red)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--accent-red)' }}>
                  {news.filter(n => n.sentimentLabel === 'negative').length}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Bear</span>
              </div>
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {news.length} articles analyzed
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Sector Grid - 2 columns */}
        <div className="xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Sector Sentiment {isLive ? '(Live)' : ''}
            </h2>
            <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-green)' }} />
                Bullish (60+)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-yellow)' }} />
                Neutral (40-60)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-red)' }} />
                Bearish (&lt;40)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {sectors.map((sector, i) => (
              <SectorCard key={sector.id} sector={sector} index={i} />
            ))}
          </div>

          {/* Biggest Sentiment Movers */}
          <div className="mb-6">
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              🔥 Sector Sentiment Rankings
            </h2>
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Sector</th>
                    <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Score</th>
                    <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Articles</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Key Driver</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sectors].sort((a, b) => b.sentiment - a.sentiment).map((sector) => (
                    <tr key={sector.id} className="transition-colors"
                      style={{ borderBottom: '1px solid var(--border-color)' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{sector.icon}</span>
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{sector.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-bold" style={{ color: getSentimentColor(sector.sentiment) }}>
                          {sector.sentiment}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {(sector as any).articleCount || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {sector.keyDriver.substring(0, 80)}{sector.keyDriver.length > 80 ? '...' : ''}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Geopolitical Alerts */}
          <div>
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              🌍 Global Events Impacting India
            </h2>
            <div className="space-y-3">
              {geoEvents.map((event) => {
                const severityConfig = {
                  hot: { color: 'var(--accent-red)', bg: 'var(--accent-red-dim)', label: '🔴 HOT' },
                  watch: { color: 'var(--accent-yellow)', bg: 'var(--accent-yellow-dim)', label: '🟡 WATCH' },
                  calm: { color: 'var(--accent-green)', bg: 'var(--accent-green-dim)', label: '🟢 CALM' },
                };
                const cfg = severityConfig[event.severity];

                return (
                  <div key={event.id} className="card-hover rounded-xl p-4"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                          style={{ background: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                        <span className="text-xs font-medium" style={{ color: 'var(--accent-blue)' }}>
                          {event.region}
                        </span>
                      </div>
                    </div>
                    <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                      {event.title}
                    </h3>
                    <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                      {event.description}
                    </p>
                    <div className="flex gap-1 flex-wrap">
                      {event.impactedSectors.map((s) => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded capitalize"
                          style={{ background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)' }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column - News Feed */}
        <div className="xl:col-span-1">
          <div className="sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                📰 Live News Feed
              </h2>
              {isLive && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: 'var(--accent-green-dim)', color: 'var(--accent-green)' }}>
                  LIVE
                </span>
              )}
            </div>

            {/* News List */}
            <div className="space-y-0 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
              {news.slice(0, 15).map((article) => (
                <NewsCard key={article.id} article={article} />
              ))}
              {news.length === 0 && loading && (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-3 rounded-full animate-spin mx-auto mb-3"
                    style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Fetching live news & analyzing sentiment...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
