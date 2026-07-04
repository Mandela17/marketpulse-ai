'use client';

import { use, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getStockBySymbol } from '@/lib/sectorData';
import { getSentimentColor, getSentimentLabel } from '@/lib/types';
import SentimentGauge from '@/components/SentimentGauge';
import NewsCard from '@/components/NewsCard';
import type { NewsArticle } from '@/lib/types';
import type { RealTechnicals } from '@/lib/technicalAnalysis';
import { getDerivativesData, DerivativesData, getBrokerConfig } from '@/lib/brokerApi';
import { useAuth } from '@/context/AuthContext';
import AlertManager from '@/components/AlertManager';
import { checkPredictionAlerts, checkPriceAlerts } from '@/lib/priceAlerts';
import BlockDealsWidget from '@/components/BlockDealsWidget';

// Lazy-load heavy chart component (defers ~48KB lightweight-charts from initial bundle)
const TradingViewChart = dynamic(() => import('@/components/TradingViewChart'), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl p-16 text-center border bg-slate-900" style={{ borderColor: 'var(--border-color)' }}>
      <div className="w-8 h-8 border-3 rounded-full animate-spin mx-auto mb-3"
        style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading chart engine...</p>
    </div>
  ),
});

// Deterministic pseudo-random number generator based on stock symbol + date string
function getDeterministicVal(sym: string, dateStr: string, min: number, max: number): number {
  let hash = 0;
  const combined = sym + dateStr;
  for (let i = 0; i < combined.length; i++) {
    hash = combined.charCodeAt(i) + ((hash << 5) - hash);
  }
  const rng = Math.abs(Math.sin(hash));
  return min + rng * (max - min);
}


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

  const { watchlist, toggleWatchlist } = useAuth();
  const inWatchlist = watchlist.includes(decodedSymbol);

  const [liveData, setLiveData] = useState<{ quote: any; technicals: RealTechnicals | null; dataSource?: string } | null>(null);
  const [loadingLive, setLoadingLive] = useState(true);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);

  // Advanced Chart & History states
  const [chartData, setChartData] = useState<any[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [sentimentHistory, setSentimentHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [derivatives, setDerivatives] = useState<DerivativesData | null>(null);
  const [blockDeals, setBlockDeals] = useState<any[]>([]);
  const [mlResult, setMlResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'technicals' | 'derivatives'>('technicals');
  const [lookbackDays, setLookbackDays] = useState<number>(90);

  // Server-side AI Prediction state
  const [aiPrediction, setAiPrediction] = useState<any>(null);
  const [loadingPrediction, setLoadingPrediction] = useState(true);

  // Track if ML has been computed for current chart data to prevent double-compute
  const mlComputedRef = useRef<string>('');

  // ── PARALLELIZED DATA FETCH ──
  // Fetch live quote + news in parallel (independent of lookback)
  useEffect(() => {
    const controller = new AbortController();

    async function fetchCoreData() {
      const brokerConfig = getBrokerConfig();
      const headers: Record<string, string> = {};
      if (brokerConfig.provider === 'upstox' && brokerConfig.connected && brokerConfig.accessToken) {
        headers['X-Upstox-Token'] = brokerConfig.accessToken;
      }

      // Fire both requests simultaneously
      const [stockRes, newsRes] = await Promise.allSettled([
        fetch(`/api/stock?symbol=${encodeURIComponent(decodedSymbol)}`, { headers, signal: controller.signal }).then(r => r.json()),
        fetch('/api/news', { signal: controller.signal }).then(r => r.json()),
      ]);

      // Process stock quote
      if (stockRes.status === 'fulfilled' && stockRes.value && !stockRes.value.error) {
        setLiveData(stockRes.value);
        // Fire price alerts
        if (stockRes.value.quote?.price) {
          checkPriceAlerts(decodedSymbol, stockRes.value.quote.price);
        }
      }
      setLoadingLive(false);

      // Process news articles — filter to this stock/sector
      if (newsRes.status === 'fulfilled' && newsRes.value?.articles) {
        const related = newsRes.value.articles.filter((a: NewsArticle) =>
          a.relatedStocks.includes(decodedSymbol) ||
          (stock && a.relatedSectors.includes(stock.sector))
        );
        setNewsArticles(related.slice(0, 8));
      }
      setLoadingNews(false);
    }

    fetchCoreData().catch(e => {
      if (e.name !== 'AbortError') console.error('Failed to fetch core data:', e);
      setLoadingLive(false);
      setLoadingNews(false);
    });

    return () => controller.abort();
  }, [decodedSymbol]);

  // Fetch historical OHLCV + sentiment history in parallel (depends on lookbackDays)
  useEffect(() => {
    const controller = new AbortController();
    setLoadingChart(true);
    setLoadingHistory(true);
    // Reset ML computation tracker when lookback changes
    mlComputedRef.current = '';

    async function fetchChartAndHistory() {
      const [chartRes, histRes] = await Promise.allSettled([
        fetch(`/api/stock/ohlcv?symbol=${encodeURIComponent(decodedSymbol)}&days=${lookbackDays}`, { signal: controller.signal }).then(r => r.json()),
        fetch(`/api/history?type=stock&id=${encodeURIComponent(decodedSymbol)}&days=${lookbackDays}`, { signal: controller.signal }).then(r => r.json()),
      ]);

      if (chartRes.status === 'fulfilled' && chartRes.value?.data) {
        setChartData(chartRes.value.data);
      }
      if (histRes.status === 'fulfilled' && histRes.value?.history) {
        setSentimentHistory(histRes.value.history);
      }
      setLoadingChart(false);
      setLoadingHistory(false);
    }

    fetchChartAndHistory().catch(e => {
      if (e.name !== 'AbortError') console.error('Failed to fetch chart or history:', e);
      setLoadingChart(false);
      setLoadingHistory(false);
    });

    return () => controller.abort();
  }, [decodedSymbol, lookbackDays]);

  // Fetch derivatives option chain data (real or mock) — only when live quote is available
  useEffect(() => {
    if (liveData?.quote?.price) {
      getDerivativesData(decodedSymbol, liveData.quote.price).then(setDerivatives);
    }
  }, [decodedSymbol, liveData]);

  // Fetch server-side AI prediction
  useEffect(() => {
    setLoadingPrediction(true);
    fetch(`/api/predict?symbol=${encodeURIComponent(decodedSymbol)}&_t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setAiPrediction(data);
          // Fire any matching alerts
          if (data.direction && data.confidence) {
            checkPredictionAlerts(decodedSymbol, { direction: data.direction, confidence: data.confidence });
          }
        }
      })
      .catch(err => console.warn('AI prediction fetch failed:', err))
      .finally(() => setLoadingPrediction(false));
  }, [decodedSymbol]);

  // Fetch block deals for this stock symbol
  useEffect(() => {
    fetch(`/api/block-deals?symbol=${encodeURIComponent(decodedSymbol)}&limit=15`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setBlockDeals(data.deals || []);
        }
      })
      .catch(err => console.warn('Block deals fetch failed:', err));
  }, [decodedSymbol]);

  // Train ML model — only depends on chartData + sentimentHistory (NOT derivatives)
  // This prevents the expensive retrain triggered when derivatives load after chart data.
  useEffect(() => {
    // Skip if already computed for this data fingerprint
    const fingerprint = `${chartData.length}-${sentimentHistory.length}-${decodedSymbol}-${lookbackDays}`;
    if (mlComputedRef.current === fingerprint) return;
    if (chartData.length < 35) return;

    mlComputedRef.current = fingerprint;

    import('@/lib/technicalAnalysis').then(({ calculateEMA, calculateRSI, calculateMACD, calculateVolumeProfile }) => {
      import('@/lib/mlPrediction').then(({ trainAndPredict }) => {
        const closes = chartData.map(c => c.close);
        const volumes = chartData.map(c => c.volume);
        const ema20Arr = calculateEMA(closes, 20);

        const sentimentMap = new Map<string, number>();
        for (const item of sentimentHistory) {
          sentimentMap.set(item.date, item.sentiment);
        }

        const mlInputs = [];
        for (let i = 35; i < chartData.length; i++) {
          const sliceCloses = closes.slice(0, i + 1);
          const sliceVolumes = volumes.slice(0, i + 1);

          const rsi = calculateRSI(sliceCloses, 14);
          const macdResult = calculateMACD(sliceCloses);
          const volumeProfile = calculateVolumeProfile(sliceVolumes);

          const dateStr = chartData[i].date;

          // Deterministic delivery/PCR values for historical days
          const deliveryPercent = getDeterministicVal(decodedSymbol, dateStr, 35, 60);

          const basePcr = getDeterministicVal(decodedSymbol, dateStr, 0.8, 1.4);
          const rsiSkew = (rsi - 50) / 100;
          const pcr = parseFloat(Math.min(1.8, Math.max(0.4, basePcr + rsiSkew)).toFixed(2));

          mlInputs.push({
            date: dateStr,
            close: chartData[i].close,
            rsi,
            macdHist: macdResult ? macdResult.histogram : 0,
            ema20: ema20Arr[i] || chartData[i].close,
            volumeRatio: volumeProfile.ratio,
            sentiment: sentimentMap.get(dateStr) ?? 50,
            pcr,
            deliveryPercent,
          });
        }

        const result = trainAndPredict(mlInputs);
        setMlResult(result);
      });
    });
  }, [chartData, sentimentHistory, decodedSymbol, lookbackDays]);

  if (!stock) return null;

  // ── MEMOIZED EXPENSIVE COMPUTATIONS ──
  // Real sentiment computed from actual news articles
  const sentiment = useMemo(() => computeRealStockSentiment(newsArticles), [newsArticles]);
  const tech = liveData?.technicals;

  // Sentiment prediction validation loop analysis
  const validationLoop = useMemo(() => calculateValidationAccuracy(sentimentHistory), [sentimentHistory]);

  // Dynamic risk factors from real data
  const risks = useMemo(() => {
    const r: string[] = [];
    if (tech) {
      if (tech.rsiSignal === 'Overbought') r.push('RSI above 70 — overbought territory, potential pullback risk');
      if (tech.rsiSignal === 'Oversold') r.push('RSI below 30 — oversold, could see dead cat bounce or genuine recovery');
      if (tech.emaTrend === 'Strong Downtrend') r.push('Price below both EMA-20 and EMA-50 — strong bearish momentum');
      if (tech.bollingerPosition === 'Above Upper') r.push('Trading above Bollinger upper band — statistically likely to revert to mean');
      if (tech.volumeSignal === 'Volume Dry-up') r.push('Volume significantly below average — low conviction in current price');
      if (tech.priceChange1M < -10) r.push(`Stock down ${Math.abs(tech.priceChange1M).toFixed(1)}% this month — sustained selling pressure`);
    }
    if (sentiment && sentiment.highImpactCount > 0) {
      r.push(`${sentiment.highImpactCount} high-impact news event(s) detected — elevated volatility expected`);
    }
    if (r.length === 0) {
      r.push('No significant technical or sentiment risk flags detected');
    }
    return r;
  }, [tech, sentiment]);

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

  // Helper function to calculate validation loop accuracy metrics
  function calculateValidationAccuracy(history: any[]) {
    if (!history || history.length < 2) return null;
    
    const validatedList = [];
    let correctCount = 0;
    let predictionCount = 0;
    
    for (let i = 0; i < history.length - 1; i++) {
      const current = history[i];
      const next = history[i+1];
      
      if (!current.price_close || !next.price_close) continue;
      
      const score = current.sentiment;
      const priceChange = next.price_close - current.price_close;
      
      let prediction: 'Bullish' | 'Bearish' | null = null;
      if (score > 55) prediction = 'Bullish';
      else if (score < 45) prediction = 'Bearish';
      
      if (prediction) {
        predictionCount++;
        const isUp = priceChange > 0;
        const isCorrect = (prediction === 'Bullish' && isUp) || (prediction === 'Bearish' && !isUp);
        
        if (isCorrect) correctCount++;
        
        validatedList.push({
          date: current.date,
          sentiment: score,
          prediction,
          closePrice: current.price_close,
          nextPrice: next.price_close,
          priceChangePercent: ((next.price_close - current.price_close) / current.price_close) * 100,
          isCorrect
        });
      }
    }
    
    validatedList.reverse(); // newest first
    
    return {
      accuracy: predictionCount > 0 ? Math.round((correctCount / predictionCount) * 100) : 0,
      totalPredictions: predictionCount,
      validatedList: validatedList.slice(0, 5)
    };
  }

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
              onClick={() => toggleWatchlist(decodedSymbol)}
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
              {/* Data source badge */}
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{
                  background: liveData.dataSource === 'Upstox Real-Time' ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)',
                  color: liveData.dataSource === 'Upstox Real-Time' ? '#a78bfa' : 'var(--text-muted)',
                  border: liveData.dataSource === 'Upstox Real-Time' ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
                }}>
                {liveData.dataSource === 'Upstox Real-Time' ? '🟢 UPSTOX LIVE' : '📊 Yahoo Finance'}
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
          {/* Interactive Chart with built-in timeframe selector */}

          {/* Interactive TradingView Candlestick & Sentiment Charts */}
          {loadingChart || loadingHistory ? (
            <div className="rounded-xl p-24 text-center border bg-slate-900" style={{ borderColor: 'var(--border-color)' }}>
              <div className="w-8 h-8 border-3 rounded-full animate-spin mx-auto mb-3"
                style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                ⏳ Fetching historical stock details & charting data...
              </p>
            </div>
          ) : chartData.length > 0 ? (
            <div className="animate-fade-in">
              <TradingViewChart
                priceData={chartData}
                sentimentHistory={sentimentHistory}
                symbol={decodedSymbol}
                predictions={aiPrediction ? [{
                  date: new Date().toISOString().split('T')[0],
                  direction: aiPrediction.direction as 'up' | 'down',
                  confidence: aiPrediction.confidence || 50,
                }] : undefined}
                blockDeals={blockDeals}
              />
            </div>
          ) : (
            <div className="rounded-xl p-8 text-center border bg-slate-900" style={{ borderColor: 'var(--border-color)' }}>
              <p className="text-sm text-slate-400">⚠️ Live interactive chart unavailable for this symbol</p>
            </div>
          )}

          {/* Navigation Tabs for Analytics */}
          <div className="flex border-b" style={{ borderColor: 'var(--border-color)' }}>
            <button
              onClick={() => setActiveTab('technicals')}
              className={`px-5 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'technicals' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              🧠 Technicals & AI Outlook
            </button>
            <button
              onClick={() => setActiveTab('derivatives')}
              className={`px-5 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'derivatives' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              🔌 Derivatives & Options
            </button>
          </div>

          {/* Tab 1: Technicals & AI Outlook */}
          {activeTab === 'technicals' && (
            <div className="space-y-6 animate-fade-in">
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

              {/* 🤖 AI Prediction Panel — Server-Side Ensemble Model */}
              <div className="rounded-xl p-5"
                style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))', border: '1px solid rgba(99,102,241,0.3)' }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    🤖 AI Prediction Engine
                  </h2>
                  {aiPrediction?.prediction?.metrics && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
                      {(() => {
                        const v = aiPrediction.prediction.metrics.modelVersion || '';
                        const label = v.includes('frozen') ? 'AI Ensemble ⚡' :
                                      v.includes('adaptive') ? 'AI Ensemble' :
                                      v.includes('heuristic') ? 'AI Analysis' : 'AI Model';
                        return `${label} • ${aiPrediction.prediction.metrics.totalSamples} samples`;
                      })()}
                    </span>
                  )}
                </div>

                {loadingPrediction ? (
                  <div className="text-center py-8">
                    <div className="w-6 h-6 border-2 rounded-full animate-spin mx-auto mb-2"
                      style={{ borderColor: 'rgba(139,92,246,0.3)', borderTopColor: '#a78bfa' }} />
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Running ensemble model...</p>
                  </div>
                ) : aiPrediction?.prediction ? (
                  <div className="space-y-4">
                    {/* Direction + Confidence */}
                    <div className="flex items-center gap-4">
                      <div className="flex-1 p-4 rounded-xl text-center"
                        style={{
                          background: aiPrediction.prediction.direction === 'up'
                            ? 'rgba(0,214,143,0.1)' : 'rgba(255,77,106,0.1)',
                          border: `1px solid ${aiPrediction.prediction.direction === 'up'
                            ? 'rgba(0,214,143,0.3)' : 'rgba(255,77,106,0.3)'}`,
                        }}>
                        <p className="text-3xl mb-1">
                          {aiPrediction.prediction.direction === 'up' ? '📈' : '📉'}
                        </p>
                        <p className="text-lg font-bold" style={{
                          color: aiPrediction.prediction.direction === 'up' ? 'var(--accent-green)' : 'var(--accent-red)'
                        }}>
                          {aiPrediction.prediction.direction === 'up' ? 'BULLISH' : 'BEARISH'}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Next-Day Direction</p>
                      </div>
                      <div className="flex-1 p-4 rounded-xl text-center"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                        <p className="text-3xl font-bold" style={{
                          color: aiPrediction.prediction.confidence >= 70 ? 'var(--accent-green)' :
                                 aiPrediction.prediction.confidence >= 60 ? 'var(--accent-yellow)' : 'var(--text-muted)'
                        }}>
                          {aiPrediction.prediction.confidence}%
                        </p>
                        <p className="text-xs font-medium capitalize" style={{ color: 'var(--accent-purple)' }}>
                          {aiPrediction.prediction.confidenceLevel?.replace('_', ' ')}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Confidence</p>
                      </div>
                    </div>

                    {/* Risk/Reward — Two-Target System with Kelly Sizing */}
                    {aiPrediction.trade && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-4 gap-2">
                          <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(0,214,143,0.08)' }}>
                            <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>Target 1</p>
                            <p className="text-sm font-bold" style={{ color: 'var(--accent-green)' }}>
                              ₹{aiPrediction.trade.target1?.toLocaleString('en-IN')}
                            </p>
                            <p className="text-[10px]" style={{ color: 'var(--accent-green)' }}>
                              {aiPrediction.trade.target1Pct}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(0,214,143,0.12)' }}>
                            <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>Target 2</p>
                            <p className="text-sm font-bold" style={{ color: 'var(--accent-green)' }}>
                              ₹{aiPrediction.trade.target2?.toLocaleString('en-IN')}
                            </p>
                            <p className="text-[10px]" style={{ color: 'var(--accent-green)' }}>
                              {aiPrediction.trade.target2Pct}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(255,77,106,0.08)' }}>
                            <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>Stop-Loss</p>
                            <p className="text-sm font-bold" style={{ color: 'var(--accent-red)' }}>
                              ₹{aiPrediction.trade.stopLoss?.toLocaleString('en-IN')}
                            </p>
                            <p className="text-[10px]" style={{ color: 'var(--accent-red)' }}>
                              {aiPrediction.trade.stopLossPct}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(139,92,246,0.08)' }}>
                            <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>R:R Ratio</p>
                            <p className="text-sm font-bold" style={{ color: 'var(--accent-purple)' }}>
                              {aiPrediction.trade.riskRewardRatio}x
                            </p>
                            <p className="text-[10px] capitalize" style={{ color: 'var(--text-muted)' }}>
                              {aiPrediction.trade.riskLevel} risk
                            </p>
                          </div>
                        </div>
                        {/* Position Sizing + VIX badge */}
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
                            💼 Kelly: {aiPrediction.trade.kellyPct}% position — {aiPrediction.trade.positionSizeHint}
                          </p>
                          {aiPrediction.trade.vixAdjusted && (
                            <span className="text-[9px] px-2 py-1 rounded-full font-medium"
                              style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
                              ⚡ VIX-adjusted stops
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Disclaimer */}
                    <p className="text-[9px] text-center" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                      {aiPrediction.disclaimer || 'AI-assisted analysis for informational purposes only. Not financial advice.'}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>⏳ Accumulating data for this stock...</p>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                      Predictions available after 10+ days of data collection
                    </p>
                  </div>
                )}
              </div>

              {/* 🌐 Market Regime + Upcoming Events Row */}
              {aiPrediction && (aiPrediction.regime || aiPrediction.events?.upcoming?.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Market Regime */}
                  {aiPrediction.regime && (
                    <div className="rounded-xl p-4"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          🌐 Market Regime
                        </h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                          style={{ background: `${aiPrediction.regime.color}20`, color: aiPrediction.regime.color }}>
                          {aiPrediction.regime.confidence}% confidence
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{aiPrediction.regime.emoji}</span>
                        <div>
                          <p className="text-sm font-bold" style={{ color: aiPrediction.regime.color }}>
                            {aiPrediction.regime.label}
                          </p>
                          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {aiPrediction.regime.description?.slice(0, 100)}...
                          </p>
                        </div>
                      </div>
                      {aiPrediction.regime.adjustments && (
                        <div className="flex gap-2 mt-2">
                          {[
                            { label: 'Confidence', val: `${(aiPrediction.regime.adjustments.confidenceMultiplier * 100 - 100).toFixed(0)}%` },
                            { label: 'Risk', val: `${aiPrediction.regime.adjustments.riskMultiplier}x` },
                            { label: 'Size', val: `${aiPrediction.regime.adjustments.positionSizeMultiplier}x` },
                          ].map(a => (
                            <span key={a.label} className="text-[9px] px-2 py-0.5 rounded"
                              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                              {a.label}: {a.val}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Upcoming Events */}
                  {aiPrediction.events?.upcoming?.length > 0 && (
                    <div className="rounded-xl p-4"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                      <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                        📅 Upcoming Events
                      </h3>
                      <div className="space-y-2">
                        {aiPrediction.events.upcoming.slice(0, 3).map((evt: any) => (
                          <div key={evt.id} className="flex items-center gap-3 p-2 rounded-lg"
                            style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <span className="text-xs font-mono font-bold px-2 py-1 rounded"
                              style={{
                                background: evt.impact === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.15)',
                                color: evt.impact === 'high' ? '#f87171' : '#fbbf24'
                              }}>
                              {new Date(evt.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                {evt.title}
                              </p>
                              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                {evt.impact.toUpperCase()} impact • {evt.expectedVolatility} volatility
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {aiPrediction.events.volatilityAdjustment?.reason && (
                        <p className="text-[10px] mt-2 px-2 py-1 rounded"
                          style={{ background: 'rgba(251,191,36,0.08)', color: '#fbbf24' }}>
                          ⚡ Volatility elevated due to: {aiPrediction.events.volatilityAdjustment.reason}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 📝 AI Narrative Report */}
              {aiPrediction?.narrative && (
                <div className="rounded-xl p-5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                      📝 AI Research Report
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                      Generated {new Date(aiPrediction.narrative.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  {/* Summary */}
                  <div className="p-3 rounded-lg mb-4"
                    style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(139,92,246,0.06))', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {aiPrediction.narrative.summary}
                    </p>
                  </div>

                  {/* Full Analysis */}
                  <div className="space-y-3 mb-4">
                    {aiPrediction.narrative.analysis.split('\n\n').map((para: string, i: number) => (
                      <p key={i} className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {para}
                      </p>
                    ))}
                  </div>

                  {/* Key Takeaways & Risks in columns */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {aiPrediction.narrative.keyTakeaways?.length > 0 && (
                      <div className="p-3 rounded-lg" style={{ background: 'rgba(0,214,143,0.05)' }}>
                        <p className="text-[10px] uppercase font-bold mb-2" style={{ color: 'var(--accent-green)' }}>
                          🎯 Key Takeaways
                        </p>
                        {aiPrediction.narrative.keyTakeaways.map((t: string, i: number) => (
                          <p key={i} className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>• {t}</p>
                        ))}
                      </div>
                    )}
                    {aiPrediction.narrative.riskWarnings?.length > 0 && (
                      <div className="p-3 rounded-lg" style={{ background: 'rgba(255,77,106,0.05)' }}>
                        <p className="text-[10px] uppercase font-bold mb-2" style={{ color: 'var(--accent-red)' }}>
                          ⚠️ Risk Warnings
                        </p>
                        {aiPrediction.narrative.riskWarnings.map((w: string, i: number) => (
                          <p key={i} className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>• {w}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

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
            </div>
          )}

          {/* Tab 2: Derivatives & Options */}
          {activeTab === 'derivatives' && (
            <div className="space-y-6 animate-fade-in">
              {derivatives ? (
                <>
                  {/* Derivatives Summary Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* PCR Card */}
                    <div className="rounded-xl p-4 border bg-slate-900" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 mb-1">Put-Call Ratio (PCR)</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-white">{derivatives.pcr}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                          derivatives.pcrSignal === 'Bullish' ? 'bg-emerald-500/10 text-emerald-400' :
                          derivatives.pcrSignal === 'Bearish' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {derivatives.pcrSignal}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">Volume/OI ratio indicating market support stance</p>
                    </div>

                    {/* Total Open Interest Call */}
                    <div className="rounded-xl p-4 border bg-slate-900" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 mb-1">Total Call OI (Resistance)</p>
                      <span className="text-2xl font-black text-red-400">{derivatives.totalCallOI.toLocaleString()}</span>
                      <p className="text-[10px] text-slate-500 mt-2">Active contracts creating ceiling pressure</p>
                    </div>

                    {/* Total Open Interest Put */}
                    <div className="rounded-xl p-4 border bg-slate-900" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 mb-1">Total Put OI (Support)</p>
                      <span className="text-2xl font-black text-emerald-400">{derivatives.totalPutOI.toLocaleString()}</span>
                      <p className="text-[10px] text-slate-500 mt-2">Active contracts creating floor support</p>
                    </div>
                  </div>

                  {/* Option Chain Strike OI Distribution */}
                  <div className="rounded-xl p-5 border bg-slate-900" style={{ borderColor: 'var(--border-color)' }}>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-bold text-white">📊 Call vs Put Open Interest (OI) by Strike</h3>
                      <span className="text-[10px] text-slate-500 font-semibold">ATM: ₹{Math.round(derivatives.spotPrice)}</span>
                    </div>

                    {/* OI Strike Rows */}
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {/* Headers */}
                      <div className="flex text-[10px] font-bold text-slate-500 uppercase pb-1 border-b border-slate-800">
                        <span className="w-5/12 text-right pr-4">Call Open Interest</span>
                        <span className="w-2/12 text-center">Strike</span>
                        <span className="w-5/12 text-left pl-4">Put Open Interest</span>
                      </div>
                      
                      {derivatives.strikes.map((s, idx) => {
                        // Max OI for scaling bars
                        const maxOI = Math.max(...derivatives.strikes.map((x: any) => Math.max(x.callOI, x.putOI)));
                        const callWidth = `${(s.callOI / maxOI) * 100}%`;
                        const putWidth = `${(s.putOI / maxOI) * 100}%`;
                        const isATM = Math.abs(s.strike - derivatives.spotPrice) < 15; // approximate ATM highlight

                        return (
                          <div key={idx} className={`flex items-center py-1.5 rounded transition-colors text-xs ${isATM ? 'bg-blue-500/5' : ''}`}>
                            {/* Call bar */}
                            <div className="w-5/12 flex items-center justify-end pr-4">
                              <span className="text-slate-400 mr-2 text-[10px]">{s.callOI.toLocaleString()}</span>
                              <div className="w-24 bg-slate-800 h-2 rounded-full overflow-hidden flex justify-end">
                                <div className="bg-red-500 h-full rounded-full" style={{ width: callWidth }} />
                              </div>
                            </div>
                            
                            {/* Strike price */}
                            <div className={`w-2/12 text-center font-extrabold ${isATM ? 'text-blue-400' : 'text-slate-300'}`}>
                              ₹{s.strike}
                            </div>
                            
                            {/* Put bar */}
                            <div className="w-5/12 flex items-center justify-start pl-4">
                              <div className="w-24 bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: putWidth }} />
                              </div>
                              <span className="text-slate-400 ml-2 text-[10px]">{s.putOI.toLocaleString()}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Delivery volume percentage card */}
                  <div className="rounded-xl p-5 border bg-slate-900" style={{ borderColor: 'var(--border-color)' }}>
                    <h3 className="text-sm font-bold text-white mb-3">📦 Delivery Volume Analysis (Last 10 Days)</h3>
                    <p className="text-xs text-slate-400 mb-4">
                      High delivery percentages (&gt;50%) signal accumulation and longer-term investor conviction, whereas low delivery indicates speculative day-trading.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {derivatives.deliveryHistory.map((d, index) => {
                        const isHigh = d.deliveryPercent >= 50;
                        return (
                          <div key={index} className="p-3 bg-slate-950 rounded-lg flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold text-slate-300">{new Date(d.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">Traded Vol: {formatVolume(d.tradedVolume)}</p>
                            </div>
                            <div className="text-right">
                              <span className={`text-sm font-black ${isHigh ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {d.deliveryPercent}%
                              </span>
                              <div className="w-20 bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                                <div className={`h-full rounded-full ${isHigh ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                                     style={{ width: `${d.deliveryPercent}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-8 rounded-xl border bg-slate-900 text-center" style={{ borderColor: 'var(--border-color)' }}>
                  <p className="text-sm text-slate-400">🔌 No derivatives data available. Configure credentials or run in simulation mode.</p>
                </div>
              )}
            </div>
          )}

          {/* Validation & AI Predictor Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            {/* ML Predictor Card */}
            <div className="rounded-xl p-5 border bg-slate-900" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>🤖 ML Predictive Engine</span>
                </h3>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  LOGISTIC REGRESSION
                </span>
              </div>
              
              {mlResult ? (
                <div className="space-y-4 animate-fade-in">
                  <div className="p-4 bg-slate-950 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase">Forecast Move (1 Day)</p>
                      <p className={`text-lg font-black mt-1 ${mlResult.predictedDirection === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {mlResult.predictedDirection === 'up' ? '📈 BULLISH RISE' : '📉 BEARISH DROP'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase">Probability</p>
                      <p className="text-xl font-black text-white mt-1">{mlResult.probability}%</p>
                    </div>
                  </div>

                  {/* Feature Importance */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-300 mb-2">Indicator Weights (Feature Importance)</h4>
                    <div className="space-y-2">
                      {[
                        { name: 'Gemini News Sentiment', val: mlResult.featureImportance.sentiment, color: 'var(--accent-purple)' },
                        { name: 'Sentiment Velocity (1D)', val: mlResult.featureImportance.sentimentMomentum, color: '#a78bfa' },
                        { name: 'Relative Strength Index (RSI)', val: mlResult.featureImportance.rsi, color: 'var(--accent-yellow)' },
                        { name: 'MACD Momentum Histogram', val: mlResult.featureImportance.macd, color: 'var(--accent-blue)' },
                        { name: 'EMA Deviation (20D Trend)', val: mlResult.featureImportance.emaTrend, color: 'var(--accent-green)' },
                        { name: 'Volume Ratio Today', val: mlResult.featureImportance.volume, color: 'var(--accent-red)' },
                        { name: 'Options Put-Call Ratio (PCR)', val: mlResult.featureImportance.pcr, color: 'var(--accent-teal)' },
                        { name: 'Delivery Volume Percentage', val: mlResult.featureImportance.delivery, color: 'var(--accent-pink)' },
                        { name: 'Price Momentum (1D Return)', val: mlResult.featureImportance.priceMomentum, color: '#f43f5e' },
                      ].map(f => (
                        <div key={f.name}>
                          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                            <span>{f.name}</span>
                            <span className="font-bold text-white">{f.val}%</span>
                          </div>
                          <div className="w-full bg-slate-850 h-1.5 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${f.val}%`, background: f.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex justify-between text-[9px] text-slate-500 pt-1 border-t border-slate-800">
                    <span>Train Accuracy: {mlResult.metrics.trainingAccuracy}%</span>
                    <span>OOS Validation: {mlResult.metrics.validationAccuracy}%</span>
                    <span>Datapoints: {mlResult.metrics.totalSamples} days</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs">
                  {loadingHistory || loadingChart ? '⏳ Training predictive model...' : 'Insufficient history to build regression model.'}
                </div>
              )}
            </div>

            {/* Sentiment Validation Loop Card */}
            <div className="rounded-xl p-5 border bg-slate-900" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-white">🔄 Sentiment Validation Loop</h3>
                {validationLoop && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {validationLoop.accuracy}% ACCURACY
                  </span>
                )}
              </div>

              {validationLoop ? (
                <div className="space-y-3 animate-fade-in">
                  <p className="text-[11px] text-slate-400">
                    Tracks whether prior AI sentiment calls (Bullish &gt; 55 or Bearish &lt; 45) successfully predicted the next-day actual price move direction.
                  </p>
                  
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-slate-300">Recent Validated Forecasts:</h4>
                    {validationLoop.validatedList.length > 0 ? (
                      <div className="space-y-1.5">
                        {validationLoop.validatedList.map((item: any, idx: number) => (
                          <div key={idx} className="p-2 bg-slate-950 rounded flex items-center justify-between text-[11px]">
                            <div>
                              <p className="font-semibold text-slate-300">{item.date}</p>
                              <div className="flex gap-2 mt-0.5 text-[10px] text-slate-500">
                                <span>Sent: {item.sentiment}</span>
                                <span>Move: {item.priceChangePercent >= 0 ? '+' : ''}{item.priceChangePercent.toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                item.isCorrect ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                              }`}>
                                {item.isCorrect ? '✓ CORRECT' : '✗ INCORRECT'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 italic py-4 text-center">No high conviction AI sentiment predictions in database history yet.</p>
                    )}
                  </div>
                  
                  <p className="text-[9px] text-slate-500 text-center border-t border-slate-800 pt-2">
                    Validation checks total price close database alignment recursively.
                  </p>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs">
                  {loadingHistory ? '⏳ Evaluating past predictions...' : 'No historical data in database for backtesting.'}
                </div>
              )}
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
          <div className="sticky top-6 space-y-5">
            {/* Alert Manager */}
            <AlertManager
              symbol={decodedSymbol}
              currentPrice={liveData?.quote?.price}
              currentPrediction={aiPrediction ? {
                direction: aiPrediction.direction as 'up' | 'down',
                confidence: aiPrediction.confidence || 50,
              } : null}
            />

            {/* Institutional Block Deals Widget */}
            <BlockDealsWidget symbol={decodedSymbol} limit={5} />

            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
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

