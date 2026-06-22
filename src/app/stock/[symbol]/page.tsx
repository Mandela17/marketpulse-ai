'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { getStockBySymbol } from '@/lib/sectorData';
import { getSentimentColor, getSentimentLabel } from '@/lib/types';
import SentimentGauge from '@/components/SentimentGauge';
import NewsCard from '@/components/NewsCard';
import type { NewsArticle } from '@/lib/types';
import type { RealTechnicals } from '@/lib/technicalAnalysis';

// Compute real per-stock sentiment from actual analyzed news articles
function computeRealStockSentiment(articles: NewsArticle[]) {
  if (articles.length === 0) return null;

  // Overall: weighted average of all article sentiments
  let totalWeight = 0;
  let weightedSum = 0;
  const categoryScores: Record<string, { sum: number; weight: number; count: number }> = {
    financial: { sum: 0, weight: 0, count: 0 },
    geopolitical: { sum: 0, weight: 0, count: 0 },
    policy: { sum: 0, weight: 0, count: 0 },
    earnings: { sum: 0, weight: 0, count: 0 },
    global: { sum: 0, weight: 0, count: 0 },
  };

  for (const article of articles) {
    const w = article.decayedWeight ?? article.weight ?? 1.0;
    weightedSum += article.sentiment * w;
    totalWeight += w;

    if (categoryScores[article.category]) {
      categoryScores[article.category].sum += article.sentiment * w;
      categoryScores[article.category].weight += w;
      categoryScores[article.category].count += 1;
    }
  }

  const avgSentiment = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const overallScore = Math.round(Math.max(0, Math.min(100, (avgSentiment + 1) * 50)));

  // Compute per-category scores (0-100), default 50 if no articles in that category
  const catScore = (cat: string) => {
    const c = categoryScores[cat];
    if (!c || c.weight === 0) return 50;
    const avg = c.sum / c.weight;
    return Math.round(Math.max(0, Math.min(100, (avg + 1) * 50)));
  };

  return {
    overall: overallScore,
    news: catScore('financial'),
    earnings: catScore('earnings'),
    geopolitical: catScore('geopolitical'),
    policy: catScore('policy'),
    articleCount: articles.length,
    highImpactCount: articles.filter(a => a.impactLevel === 'high').length,
  };
}

function getOutlook(score: number): 'bullish' | 'bearish' | 'neutral' {
  if (score > 60) return 'bullish';
  if (score < 40) return 'bearish';
  return 'neutral';
}

function formatVolume(vol: number): string {
  if (vol >= 10000000) return `${(vol / 10000000).toFixed(1)} Cr`;
  if (vol >= 100000) return `${(vol / 100000).toFixed(1)} L`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)} K`;
  return vol.toString();
}

export default function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const decodedSymbol = decodeURIComponent(symbol).toUpperCase();
  
  let stock = getStockBySymbol(decodedSymbol);
  if (!stock && decodedSymbol.length >= 2) {
    let sector = 'general';
    const cleanSym = decodedSymbol.toLowerCase();
    if (cleanSym.includes('tata') || cleanSym.includes('auto') || cleanSym.includes('motor') || cleanSym === 'tmcv') {
      sector = 'auto';
    } else if (cleanSym.includes('power') || cleanSym.includes('energy') || cleanSym.includes('coal') || cleanSym.includes('oil')) {
      sector = 'power';
    } else if (cleanSym.includes('bank') || cleanSym.includes('fin')) {
      sector = 'banking';
    } else if (cleanSym.includes('gold') || cleanSym.includes('titan')) {
      sector = 'gold';
    } else if (cleanSym.includes('tcs') || cleanSym.includes('infy') || cleanSym.includes('wipro') || cleanSym.includes('tech')) {
      sector = 'it';
    }

    stock = {
      symbol: decodedSymbol,
      name: `${decodedSymbol} (Custom Stock)`,
      sector,
    };
  }

  const [inWatchlist, setInWatchlist] = useState(false);
  const [liveData, setLiveData] = useState<{ quote: any; technicals: RealTechnicals | null } | null>(null);
  const [loadingLive, setLoadingLive] = useState(true);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);

  // Load watchlist status
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

  // Fetch live market data and real technicals
  useEffect(() => {
    async function fetchLiveQuote() {
      try {
        const res = await fetch(`/api/stock?symbol=${encodeURIComponent(decodedSymbol)}`).then(r => r.json());
        if (res && !res.error) {
          setLiveData(res);
        }
      } catch (e) {
        console.error('Failed to fetch live stock indicators:', e);
      } finally {
        setLoadingLive(false);
      }
    }
    fetchLiveQuote();
  }, [decodedSymbol]);

  // Fetch real analyzed news articles
  useEffect(() => {
    async function fetchNews() {
      try {
        const res = await fetch('/api/news').then(r => r.json());
        if (res?.articles) {
          // Filter articles related to this stock or its sector
          const related = res.articles.filter((a: NewsArticle) =>
            a.relatedStocks.includes(decodedSymbol) ||
            (stock && a.relatedSectors.includes(stock.sector))
          );
          setNewsArticles(related.slice(0, 8));
        }
      } catch (e) {
        console.error('Failed to fetch news:', e);
      } finally {
        setLoadingNews(false);
      }
    }
    fetchNews();
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

  if (!stock) return null;

  // Real sentiment computed from actual news articles
  const sentiment = computeRealStockSentiment(newsArticles);
  const tech = liveData?.technicals;

  // Dynamic risk factors from real data
  const risks: string[] = [];
  if (tech) {
    if (tech.rsiSignal === 'Overbought') risks.push('RSI above 70 — overbought territory, potential pullback risk');
    if (tech.rsiSignal === 'Oversold') risks.push('RSI below 30 — oversold, could see dead cat bounce or genuine recovery');
    if (tech.emaTrend === 'Strong Downtrend') risks.push('Price below both EMA-20 and EMA-50 — strong bearish momentum');
    if (tech.bollingerPosition === 'Above Upper') risks.push('Trading above Bollinger upper band — statistically likely to revert to mean');
    if (tech.volumeSignal === 'Volume Dry-up') risks.push('Volume significantly below average — low conviction in current price');
    if (tech.priceChange1M < -10) risks.push(`Stock down ${Math.abs(tech.priceChange1M).toFixed(1)}% this month — sustained selling pressure`);
  }
  if (sentiment && sentiment.highImpactCount > 0) {
    risks.push(`${sentiment.highImpactCount} high-impact news event(s) detected — elevated volatility expected`);
  }
  if (risks.length === 0) {
    risks.push('No significant technical or sentiment risk flags detected');
  }

  const outlookConfig = {
    bullish: { icon: '▲', color: 'var(--accent-green)', bg: 'var(--accent-green-dim)', label: 'Bullish' },
    bearish: { icon: '▼', color: 'var(--accent-red)', bg: 'var(--accent-red-dim)', label: 'Bearish' },
    neutral: { icon: '—', color: 'var(--accent-yellow)', bg: 'var(--accent-yellow-dim)', label: 'Neutral' },
  };

  // Combine technical + sentiment for outlook (if we have both)
  const outlookScore = sentiment ? sentiment.overall : 50;
  const techBias = tech ? (tech.rsi > 60 ? 5 : tech.rsi < 40 ? -5 : 0) : 0;
  const day1 = getOutlook(outlookScore + techBias + 2);
  const week1 = getOutlook(outlookScore + techBias);
  const month1 = getOutlook(outlookScore - 3);

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
          <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>{stock.name}</p>

          {/* Live stock values strip */}
          {liveData ? (
            <div className="flex items-center gap-3 mt-2 text-sm font-semibold animate-fade-in">
              <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                ₹{liveData.quote.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: liveData.quote.changePercent >= 0 ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)',
                  color: liveData.quote.changePercent >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'
                }}>
                {liveData.quote.changePercent >= 0 ? '▲ +' : '▼ '}{liveData.quote.changePercent.toFixed(2)}%
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Vol: {formatVolume(liveData.quote.volume)}
              </span>
            </div>
          ) : (
            loadingLive && (
              <p className="text-xs mt-2 animate-pulse" style={{ color: 'var(--text-muted)' }}>
                ⏳ Fetching live quote...
              </p>
            )
          )}
        </div>
        {sentiment ? (
          <SentimentGauge score={sentiment.overall} size="lg" />
        ) : (
          <div className="text-center p-3">
            <SentimentGauge score={50} size="lg" />
            {loadingNews && <p className="text-[10px] mt-1 animate-pulse" style={{ color: 'var(--text-muted)' }}>Analyzing...</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="xl:col-span-2 space-y-6">
          {/* Sentiment Breakdown — Real data from news */}
          <div className="rounded-xl p-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                Sentiment Breakdown
              </h2>
              {sentiment && (
                <span className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                  Based on {sentiment.articleCount} article{sentiment.articleCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {sentiment ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: '📰 News/Financial', score: sentiment.news, desc: 'Market & company news' },
                  { label: '💰 Earnings', score: sentiment.earnings, desc: 'Results & guidance' },
                  { label: '🌍 Geopolitical', score: sentiment.geopolitical, desc: 'Global events impact' },
                  { label: '🏛️ Policy/Regulatory', score: sentiment.policy, desc: 'RBI, SEBI, Govt' },
                ].map((item) => (
                  <div key={item.label} className="text-center p-3 rounded-lg"
                    style={{ background: 'var(--bg-primary)' }}>
                    <SentimentGauge score={item.score} size="sm" showLabel={false} />
                    <p className="text-xs font-medium mt-2" style={{ color: 'var(--text-primary)' }}>
                      {item.label}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                {loadingNews ? (
                  <p className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>
                    ⏳ Fetching and analyzing news sentiment...
                  </p>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    No recent news found for {decodedSymbol}. Sentiment unavailable.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Near-Term Outlook */}
          <div className="rounded-xl p-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                Near-Term Outlook
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                {sentiment ? 'Sentiment + Technical' : 'Insufficient data'}
              </span>
            </div>
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

          {/* Volume & Momentum Analysis (Real data) */}
          {tech && (
            <div className="rounded-xl p-5 glass-card"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  📊 Volume & Momentum Analysis
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded self-start"
                  style={{
                    background: tech.emaTrend.includes('Uptrend') ? 'var(--accent-green-dim)' :
                               tech.emaTrend.includes('Downtrend') ? 'var(--accent-red-dim)' : 'rgba(255, 255, 255, 0.05)',
                    color: tech.emaTrend.includes('Uptrend') ? 'var(--accent-green)' :
                           tech.emaTrend.includes('Downtrend') ? 'var(--accent-red)' : 'var(--text-muted)'
                  }}>
                  {tech.emaTrend.includes('Strong Up') ? '🚀 STRONG UPTREND' :
                   tech.emaTrend.includes('Uptrend') ? '📈 UPTREND' :
                   tech.emaTrend.includes('Strong Down') ? '⚠️ STRONG DOWNTREND' :
                   tech.emaTrend.includes('Downtrend') ? '📉 DOWNTREND' : 'SIDEWAYS'}
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Volume Ratio */}
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                    Volume vs 20D Avg
                  </p>
                  <div className="flex items-end gap-2 mb-1">
                    <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {tech.volumeRatio}x
                    </span>
                    <span className="text-[9px] mb-1" style={{
                      color: tech.volumeRatio > 1.3 ? 'var(--accent-green)' :
                             tech.volumeRatio < 0.7 ? 'var(--accent-red)' : 'var(--text-muted)'
                    }}>
                      {tech.volumeSignal}
                    </span>
                  </div>
                  <div className="flex justify-between text-[9px] mb-1" style={{ color: 'var(--text-muted)' }}>
                    <span>Today: {formatVolume(tech.volumeToday)}</span>
                    <span>Avg: {formatVolume(tech.volume20DayAvg)}</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${Math.min(100, tech.volumeRatio * 50)}%`,
                        background: tech.volumeRatio > 1.3 ? 'var(--accent-green)' :
                                    tech.volumeRatio < 0.7 ? 'var(--accent-red)' : 'var(--accent-blue)'
                      }}
                    />
                  </div>
                </div>

                {/* EMA Trend */}
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                    EMA Trend
                  </p>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-muted)' }}>Price</span>
                      <span className="font-bold" style={{ color: 'var(--text-primary)' }}>₹{tech.currentPrice.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-muted)' }}>EMA 20</span>
                      <span className="font-medium" style={{
                        color: tech.currentPrice > tech.ema20 ? 'var(--accent-green)' : 'var(--accent-red)'
                      }}>₹{tech.ema20.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-muted)' }}>EMA 50</span>
                      <span className="font-medium" style={{
                        color: tech.currentPrice > tech.ema50 ? 'var(--accent-green)' : 'var(--accent-red)'
                      }}>₹{tech.ema50.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                  <p className="text-[9px] mt-2 font-bold" style={{
                    color: tech.emaTrend.includes('Up') ? 'var(--accent-green)' :
                           tech.emaTrend.includes('Down') ? 'var(--accent-red)' : 'var(--accent-yellow)'
                  }}>
                    {tech.emaTrend}
                  </p>
                </div>

                {/* Price Performance */}
                <div className="p-3 rounded-lg border" style={{ background: 'var(--bg-primary)', borderColor: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                    Price Performance
                  </p>
                  <div className="space-y-2">
                    {[
                      { label: '1D', value: tech.priceChange1D },
                      { label: '5D', value: tech.priceChange5D },
                      { label: '1M', value: tech.priceChange1M },
                    ].map(p => (
                      <div key={p.label} className="flex items-center justify-between">
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{p.label}</span>
                        <span className="text-xs font-bold" style={{
                          color: p.value >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'
                        }}>
                          {p.value >= 0 ? '+' : ''}{p.value.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Technical Indicators — Real Calculations */}
          {tech && (
            <div className="rounded-xl p-5 glass-card"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  📈 Technical Indicators
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                  Computed from {tech.dataPoints}-day OHLCV
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Relative Strength Index */}
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      RSI (14) — Wilder&apos;s Smoothed
                    </p>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        background: tech.rsi > 70 ? 'var(--accent-red-dim)' :
                                   tech.rsi < 30 ? 'var(--accent-green-dim)' : 'var(--accent-yellow-dim)',
                        color: tech.rsi > 70 ? 'var(--accent-red)' :
                               tech.rsi < 30 ? 'var(--accent-green)' : 'var(--accent-yellow)'
                      }}>
                      {tech.rsiSignal.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      {tech.rsi.toFixed(1)}
                    </span>
                    <div className="flex-1 bg-slate-800 h-2 rounded-full relative">
                      {/* Safe zone boundary ticks (30 to 70) */}
                      <div className="absolute left-[30%] right-[30%] top-0 bottom-0 bg-slate-700 bg-opacity-30 border-l border-r border-slate-600" />
                      <div className="absolute w-2 h-2 rounded-full bg-white top-0 shadow transition-all duration-500"
                        style={{ left: `calc(${Math.min(100, tech.rsi)}% - 4px)` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between mt-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    <span>Oversold (30)</span>
                    <span>Overbought (70)</span>
                  </div>
                </div>

                {/* MACD */}
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-[10px] uppercase font-semibold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                    MACD (12, 26, 9)
                  </p>
                  <p className="text-sm font-bold mt-1"
                    style={{
                      color: tech.macdSignal.includes('Bullish') ? 'var(--accent-green)' :
                             tech.macdSignal.includes('Bearish') ? 'var(--accent-red)' : 'var(--text-secondary)'
                    }}>
                    {tech.macdSignal.includes('Bullish Crossover') ? '🟢 Bullish Crossover' :
                     tech.macdSignal.includes('Bearish Crossover') ? '🔴 Bearish Crossover' :
                     tech.macdSignal.includes('Bullish') ? '🟢 Bullish Momentum' :
                     tech.macdSignal.includes('Bearish') ? '🔴 Bearish Momentum' : '⚪ Neutral'}
                  </p>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-[9px]">
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>MACD</span>
                      <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{tech.macdLine.toFixed(2)}</p>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Signal</span>
                      <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{tech.signalLine.toFixed(2)}</p>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Histogram</span>
                      <p className="font-bold" style={{
                        color: tech.histogram >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'
                      }}>{tech.histogram >= 0 ? '+' : ''}{tech.histogram.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* Bollinger Bands */}
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                    Bollinger Bands (20, 2σ)
                  </p>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-muted)' }}>Upper</span>
                      <span className="font-medium" style={{ color: 'var(--accent-red)' }}>₹{tech.bollingerUpper.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-muted)' }}>Middle (SMA)</span>
                      <span className="font-medium" style={{ color: 'var(--accent-yellow)' }}>₹{tech.bollingerMiddle.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-muted)' }}>Lower</span>
                      <span className="font-medium" style={{ color: 'var(--accent-green)' }}>₹{tech.bollingerLower.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                  <p className="text-[9px] mt-2 font-bold" style={{
                    color: tech.bollingerPosition.includes('Upper') ? 'var(--accent-red)' :
                           tech.bollingerPosition.includes('Lower') ? 'var(--accent-green)' : 'var(--accent-yellow)'
                  }}>
                    Position: {tech.bollingerPosition} (BW: {tech.bollingerWidth.toFixed(1)}%)
                  </p>
                </div>

                {/* Price Range */}
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                    Price Range ({tech.dataPoints}D)
                  </p>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[9px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                        <span>Day Low: ₹{tech.dayLow.toLocaleString('en-IN')}</span>
                        <span>Day High: ₹{tech.dayHigh.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full relative">
                        <div className="absolute w-2 h-2 rounded-full bg-white top-[-1px] shadow"
                          style={{
                            left: `${Math.min(100, Math.max(0, tech.dayHigh > tech.dayLow
                              ? ((tech.currentPrice - tech.dayLow) / (tech.dayHigh - tech.dayLow)) * 100
                              : 50))}%`
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[9px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                        <span>Period Low: ₹{tech.low52W.toLocaleString('en-IN')}</span>
                        <span>Period High: ₹{tech.high52W.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full relative">
                        <div className="absolute w-2 h-2 rounded-full bg-accent-blue top-[-1px] shadow"
                          style={{
                            left: `${Math.min(100, Math.max(0, tech.high52W > tech.low52W
                              ? ((tech.currentPrice - tech.low52W) / (tech.high52W - tech.low52W)) * 100
                              : 50))}%`,
                            background: 'var(--accent-blue)'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading state for technicals */}
          {!tech && loadingLive && (
            <div className="rounded-xl p-8 text-center"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <p className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>
                ⏳ Computing real technical indicators from historical data...
              </p>
            </div>
          )}

          {!tech && !loadingLive && (
            <div className="rounded-xl p-8 text-center"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                ⚠️ Technical indicators unavailable — insufficient historical data for {decodedSymbol}
              </p>
            </div>
          )}

          {/* Risk Factors — Dynamic from real data */}
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

          {/* Disclaimer */}
          <div className="rounded-lg p-3 text-center"
            style={{ background: 'rgba(255, 193, 7, 0.05)', border: '1px solid rgba(255, 193, 7, 0.15)' }}>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              ⚠️ <strong>Disclaimer:</strong> This is not financial advice. All data, sentiment scores, and technical indicators are for informational purposes only.
              Past performance does not guarantee future results. Always consult a SEBI-registered advisor before making investment decisions.
            </p>
          </div>
        </div>

        {/* Right Column - Related News (Real) */}
        <div className="xl:col-span-1">
          <div className="sticky top-6">
            <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              📰 Related News
            </h2>
            <div className="space-y-0">
              {loadingNews ? (
                <div className="text-center py-8">
                  <p className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>
                    ⏳ Fetching live news...
                  </p>
                </div>
              ) : newsArticles.length > 0 ? (
                newsArticles.map((article) => (
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
