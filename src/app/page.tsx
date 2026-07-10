'use client';

import { useEffect, useState } from 'react';
import { getSentimentColor, getSentimentLabel, SectorData, NewsArticle } from '@/lib/types';
import SectorCard from '@/components/SectorCard';
import SentimentGauge from '@/components/SentimentGauge';
import NewsCard from '@/components/NewsCard';
import { getBrokerConfig, saveBrokerConfig } from '@/lib/brokerApi';
import { Calendar } from 'lucide-react';
import FIIDIIWidget from '@/components/FIIDIIWidget';
import MarketRegimeWidget from '@/components/MarketRegimeWidget';
import TopMoversWidget from '@/components/TopMoversWidget';
import VIXGaugeWidget from '@/components/VIXGaugeWidget';
import GlobalMarketsWidget from '@/components/GlobalMarketsWidget';
import BlockDealsWidget from '@/components/BlockDealsWidget';
import { loadDashboardCache, saveDashboardCache, timeAgo } from '@/lib/dashboardCache';

interface MarketData {
  nifty50: { value: number; change: number; changePercent: number };
  sensex: { value: number; change: number; changePercent: number };
  marketStatus: string;
}

// ─── Skeleton Components ───
function SkeletonCard() {
  return (
    <div className="glass-card-static rounded-2xl p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg" style={{ background: 'var(--border-color)' }} />
        <div className="h-4 w-24 rounded" style={{ background: 'var(--border-color)' }} />
      </div>
      <div className="h-8 w-16 rounded mb-2" style={{ background: 'var(--border-color)' }} />
      <div className="h-3 w-full rounded" style={{ background: 'var(--border-color)' }} />
      <div className="h-3 w-2/3 rounded mt-1.5" style={{ background: 'var(--border-color)' }} />
    </div>
  );
}

function SkeletonMarketStrip() {
  return (
    <div className="glass-card-static rounded-2xl p-5 animate-pulse">
      <div className="h-3 w-16 rounded mb-2" style={{ background: 'var(--border-color)' }} />
      <div className="h-7 w-28 rounded mb-1" style={{ background: 'var(--border-color)' }} />
      <div className="h-4 w-32 rounded" style={{ background: 'var(--border-color)' }} />
    </div>
  );
}

function SkeletonNewsCard() {
  return (
    <div className="p-4 animate-pulse" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="h-4 w-3/4 rounded mb-2" style={{ background: 'var(--border-color)' }} />
      <div className="h-3 w-full rounded mb-1" style={{ background: 'var(--border-color)' }} />
      <div className="h-3 w-1/2 rounded" style={{ background: 'var(--border-color)' }} />
    </div>
  );
}

export default function Dashboard() {
  // ─── Hydrate from localStorage cache (real data from last session) ───
  const cached = typeof window !== 'undefined' ? loadDashboardCache() : null;

  const [sectors, setSectors] = useState<SectorData[]>(cached?.sectors ?? []);
  const [news, setNews] = useState<NewsArticle[]>(cached?.news ?? []);
  const [marketData, setMarketData] = useState<MarketData | null>(cached?.marketData ?? null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>(cached?.lastUpdated ?? '');
  const [isLive, setIsLive] = useState(false);
  const [isCachedView, setIsCachedView] = useState(!!cached);
  const [cacheAge, setCacheAge] = useState<string>(cached ? timeAgo(cached.timestamp) : '');
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [dataSource, setDataSource] = useState<'yahoo' | 'upstox'>('yahoo');
  const [aiAccuracy, setAiAccuracy] = useState<{ overallAccuracy: number; totalResolved: number } | null>(cached?.aiAccuracy ?? null);

  useEffect(() => {
    // Check broker connection status — verify with server, not just localStorage
    const brokerConfig = getBrokerConfig();
    const localConnected = brokerConfig.provider === 'upstox' && brokerConfig.connected && !!brokerConfig.accessToken;
    setBrokerConnected(localConnected); // optimistic from localStorage

    // Verify with server (authoritative)
    fetch('/api/upstox-status')
      .then(r => r.json())
      .then(status => {
        setBrokerConnected(status.connected);
        // If server says disconnected but localStorage says connected, fix localStorage
        if (!status.connected && localConnected) {
          saveBrokerConfig({ ...brokerConfig, connected: false });
        }
      })
      .catch(() => {}); // keep localStorage state on network error

    async function fetchData() {
      try {
        const t = Date.now();
        const opts = { cache: 'no-store' as RequestCache };
        const [newsRes, marketRes, accuracyRes] = await Promise.all([
          fetch(`/api/news?_t=${t}`, opts).then(r => r.json()).catch(() => null),
          fetch(`/api/market?_t=${t}`, opts).then(r => r.json()).catch(() => null),
          fetch(`/api/predictions?type=accuracy&_t=${t}`, opts).then(r => r.json()).catch(() => null),
        ]);

        if (accuracyRes?.overall?.totalResolved > 0) {
          setAiAccuracy(accuracyRes.overall);
        }

        let freshSectors = sectors;
        let freshNews = news;
        let freshLastUpdated = lastUpdated;

        if (newsRes && newsRes.articles) {
          freshNews = newsRes.articles;
          setNews(freshNews);
          setIsLive(true);
          setIsCachedView(false);
          setCacheAge('');

          if (newsRes.sectorSentiments) {
            const sectorArray: SectorData[] = Object.values(newsRes.sectorSentiments);
            const priorityOrder = ['defense', 'power', 'gold', 'energy', 'ev', 'auto', 'banking', 'realestate', 'it', 'pharma', 'metals', 'fmcg'];
            sectorArray.sort((a: SectorData, b: SectorData) => {
              const aIdx = priorityOrder.indexOf(a.id);
              const bIdx = priorityOrder.indexOf(b.id);
              return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
            });
            freshSectors = sectorArray;
            setSectors(freshSectors);
          }

          freshLastUpdated = newsRes.lastUpdated || new Date().toISOString();
          setLastUpdated(freshLastUpdated);
        }

        let freshMarketData = marketData;
        if (marketRes && !marketRes.error) {
          freshMarketData = marketRes;
          setMarketData(freshMarketData);
        }

        // If Upstox is connected, try to enrich NIFTY 50 with Upstox real-time data
        if (localConnected && brokerConfig.accessToken) {
          try {
            const niftyRes = await fetch('/api/broker/quote?symbol=NIFTY', {
              headers: { 'X-Upstox-Token': brokerConfig.accessToken },
            }).then(r => r.json());

            if (niftyRes && !niftyRes.error && niftyRes.price > 0) {
              setMarketData(prev => ({
                ...prev,
                nifty50: {
                  value: niftyRes.price,
                  change: niftyRes.change,
                  changePercent: niftyRes.changePercent,
                },
                sensex: prev?.sensex || { value: 0, change: 0, changePercent: 0 },
                marketStatus: prev?.marketStatus || 'closed',
              }));
              setDataSource('upstox');
            }
          } catch (upstoxErr) {
            console.warn('[Dashboard] Upstox NIFTY quote failed:', upstoxErr);
          }
        }
        // ─── Persist to localStorage for instant next load ───
        saveDashboardCache({
          sectors: freshSectors,
          news: freshNews,
          marketData: freshMarketData,
          lastUpdated: freshLastUpdated,
          aiAccuracy: accuracyRes?.overall?.totalResolved > 0 ? accuracyRes.overall : aiAccuracy,
        });
      } catch (error) {
        console.error('Failed to fetch live data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Only auto-refresh during Indian market hours (Mon-Fri 9:15-15:30 IST)
    // Saves unnecessary RSS + Gemini API calls during off-hours
    function isMarketOpenNow(): boolean {
      const now = new Date();
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const ist = new Date(utc + 5.5 * 3600000);
      const day = ist.getDay();
      if (day === 0 || day === 6) return false;
      const totalMinutes = ist.getHours() * 60 + ist.getMinutes();
      return totalMinutes >= 555 && totalMinutes <= 930;
    }

    let interval: NodeJS.Timeout | undefined;
    if (isMarketOpenNow()) {
      interval = setInterval(fetchData, 5 * 60 * 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, []);

  const nifty = marketData?.nifty50 || { value: 0, change: 0, changePercent: 0 };
  const sensex = marketData?.sensex || { value: 0, change: 0, changePercent: 0 };
  const mktStatus = marketData?.marketStatus || 'closed';
  const hasData = sectors.length > 0 || news.length > 0 || marketData !== null;

  const overallSentiment = sectors.length > 0
    ? Math.round(sectors.reduce((sum, s) => sum + s.sentiment, 0) / sectors.length)
    : 50;

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div style={{ width: '100%', maxWidth: '100%' }}>
      {/* ─── Header ─── */}
      <div className="mb-6 animate-fade-in-up">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              Market Dashboard
            </h1>
            <p className="text-sm mt-1.5 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-secondary)' }}>
              AI-powered sentiment analysis for Indian markets
              {isLive && !isCachedView && (
                <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold"
                  style={{ background: 'var(--accent-green-dim)', color: 'var(--accent-green)' }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-green)' }} />
                  LIVE DATA
                </span>
              )}
              {isCachedView && cacheAge && (
                <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold"
                  style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                  📦 Cached · {cacheAge}
                </span>
              )}
              {brokerConnected && (
                <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold"
                  style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#a78bfa' }} />
                  UPSTOX CONNECTED
                </span>
              )}
              {loading && (
                <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold"
                  style={{ background: 'var(--accent-yellow-dim)', color: 'var(--accent-yellow)' }}>
                  ⏳ Refreshing...
                </span>
              )}
            </p>
          </div>
          <div
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium shrink-0"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            <Calendar size={13} />
            {lastUpdated
              ? new Date(lastUpdated).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
              : today
            }
          </div>
        </div>
      </div>

      {/* ─── Market Summary Strip ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6 animate-fade-in-up delay-100">
        {/* Overall Sentiment */}
        <div className="glass-card-static rounded-2xl p-4 sm:p-5 flex items-center gap-4">
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
        <div className="glass-card-static rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
              NIFTY 50
            </p>
            <span className="text-xs">{mktStatus === 'open' ? '🟢' : '🔴'}</span>
          </div>
          <p className="text-xl font-bold text-white">
            {nifty.value > 0 ? nifty.value.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : (
              <span className="inline-block h-6 w-24 rounded animate-pulse" style={{ background: 'var(--border-color)' }} />
            )}
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
        <div className="glass-card-static rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
              SENSEX
            </p>
            <span className="text-xs">{mktStatus === 'open' ? '🟢' : '🔴'}</span>
          </div>
          <p className="text-xl font-bold text-white">
            {sensex.value > 0 ? sensex.value.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : (
              <span className="inline-block h-6 w-24 rounded animate-pulse" style={{ background: 'var(--border-color)' }} />
            )}
          </p>
          {sensex.value > 0 && (
            <p className="text-sm font-medium" style={{
              color: sensex.change >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
            }}>
              {sensex.change >= 0 ? '+' : ''}{sensex.change.toFixed(2)} ({sensex.changePercent >= 0 ? '+' : ''}{sensex.changePercent.toFixed(2)}%)
            </p>
          )}
        </div>

        {/* News Sentiment */}
        <div className="glass-card-static rounded-2xl p-4 sm:p-5">
          <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
            News Sentiment
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-green)' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--accent-green)' }}>
                {news.filter(n => n.sentimentLabel === 'positive').length}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Bull</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-yellow)' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--accent-yellow)' }}>
                {news.filter(n => n.sentimentLabel === 'neutral').length}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Neut</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-red)' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--accent-red)' }}>
                {news.filter(n => n.sentimentLabel === 'negative').length}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Bear</span>
            </div>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
            {news.length} articles analyzed
          </p>
        </div>
      </div>

      {/* ─── AI Accuracy Trust Banner ─── */}
      {aiAccuracy && aiAccuracy.totalResolved >= 10 && (
        <div className="mb-6 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in-up"
          style={{ background: 'linear-gradient(135deg, rgba(0,214,143,0.08), rgba(59,130,246,0.08))', border: '1px solid rgba(0,214,143,0.2)' }}>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-black" style={{ color: '#00d68f' }}>
              {aiAccuracy.overallAccuracy}%
            </div>
            <div>
              <p className="text-sm font-bold text-white">AI Prediction Accuracy</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Based on {aiAccuracy.totalResolved} resolved predictions — updated daily
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              {['RELIANCE', 'TCS', 'HDFCBANK', 'INFY'].map(s => (
                <a key={s} href={`/stock/${s}`}
                  className="text-[10px] px-2 py-1 rounded font-bold hover:brightness-125 transition-all"
                  style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                  {s}
                </a>
              ))}
            </div>
            <a href="/predictions"
              className="text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all hover:brightness-125"
              style={{ background: 'rgba(0,214,143,0.15)', color: '#00d68f', border: '1px solid rgba(0,214,143,0.3)' }}>
              View Predictions →
            </a>
          </div>
        </div>
      )}

      {/* ─── Main Content Grid ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column — Sectors + Rankings + Geo */}
        <div className="xl:col-span-2">
          {/* Sector Sentiment */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2 animate-fade-in-up delay-200">
            <h2 className="text-lg font-bold text-white">
              Sector Sentiment {isLive ? '(Live)' : ''}
            </h2>
            <div className="flex items-center gap-3 sm:gap-4 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-green)' }} />
                Bullish (60+)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-yellow)' }} />
                Neutral (40-60)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-red)' }} />
                Bearish (&lt;40)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
            {sectors.length > 0 ? sectors.map((sector, i) => (
              <SectorCard key={sector.id} sector={sector} index={i} />
            )) : (
              <>{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}</>
            )}
          </div>

          {/* Sector Rankings Table */}
          {sectors.length > 0 && (
          <div className="mb-6 animate-fade-in-up delay-300">
            <h2 className="text-lg font-bold mb-4 text-white">
              🔥 Sector Sentiment Rankings
            </h2>
            <div className="glass-card-static rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <th className="text-left px-4 sm:px-5 py-3.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Sector</th>
                      <th className="text-center px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Score</th>
                      <th className="text-center px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>Articles</th>
                      <th className="text-left px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>Key Driver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...sectors].sort((a, b) => b.sentiment - a.sentiment).map((sector) => (
                      <tr key={sector.id} className="transition-colors duration-150"
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td className="px-4 sm:px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">{sector.icon}</span>
                            <span className="text-sm font-medium text-white">{sector.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="text-sm font-bold" style={{ color: getSentimentColor(sector.sentiment) }}>
                            {sector.sentiment}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {(sector as any).articleCount || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <span className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {sector.keyDriver.substring(0, 80)}{sector.keyDriver.length > 80 ? '...' : ''}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          )}
        </div>

        {/* Right Column — Widgets + News Feed */}
        <div className="xl:col-span-1 space-y-4">
          {/* Market Regime */}
          <MarketRegimeWidget />

          {/* FII/DII Flows */}
          <FIIDIIWidget />

          {/* Top Movers */}
          <TopMoversWidget />

          {/* India VIX Fear Gauge */}
          <VIXGaugeWidget />

          {/* Global Markets */}
          <GlobalMarketsWidget />

          {/* Institutional Block Deals Widget */}
          <BlockDealsWidget limit={6} />

          {/* News Feed */}
          <div className="xl:sticky xl:top-6">
            <div className="flex items-center justify-between mb-4 animate-fade-in-up delay-200">
              <h2 className="text-lg font-bold text-white">
                📰 Live News Feed
              </h2>
              {isLive && (
                <span className="text-[10px] px-2.5 py-1 rounded-full font-bold"
                  style={{ background: 'var(--accent-green-dim)', color: 'var(--accent-green)' }}>
                  LIVE
                </span>
              )}
            </div>

            <div className="space-y-0 max-h-[calc(100vh-200px)] overflow-y-auto pr-1 no-scrollbar">
              {news.length > 0 ? news.slice(0, 15).map((article) => (
                <NewsCard key={article.id} article={article} />
              )) : (
                <div>
                  {loading ? (
                    <>{Array.from({ length: 5 }).map((_, i) => <SkeletonNewsCard key={i} />)}</>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No news data available yet.</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Refresh the page to fetch live news.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
