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
  
  // Use static db stock, or fallback to dynamically configured custom stock
  let stock = getStockBySymbol(decodedSymbol);
  if (!stock && decodedSymbol.length >= 2) {
    // Attempt to guess sector based on common company keywords
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
  const [liveData, setLiveData] = useState<{ quote: any; technicals: any } | null>(null);
  const [loadingLive, setLoadingLive] = useState(true);

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

  // Fetch live market data and option/technical metrics
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
                Vol: {(liveData.quote.volume / 100000).toFixed(1)}L
              </span>
            </div>
          ) : (
            loadingLive && (
              <p className="text-xs mt-2 animate-pulse" style={{ color: 'var(--text-muted)' }}>
                ⏳ Fetching live quote and volume from NSE...
              </p>
            )
          )}
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

          {/* Option Chain & Microstructure (NSE) */}
          {liveData && (
            <div className="rounded-xl p-5 glass-card"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  📊 Option Chain & Microstructure (NSE)
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded self-start"
                  style={{
                    background: liveData.technicals.institutionalSignal === 'Accumulation' ? 'var(--accent-green-dim)' :
                               liveData.technicals.institutionalSignal === 'Distribution' ? 'var(--accent-red-dim)' : 'rgba(255, 255, 255, 0.05)',
                    color: liveData.technicals.institutionalSignal === 'Accumulation' ? 'var(--accent-green)' :
                           liveData.technicals.institutionalSignal === 'Distribution' ? 'var(--accent-red)' : 'var(--text-muted)'
                  }}>
                  {liveData.technicals.institutionalSignal === 'Accumulation' ? '🚀 INSTITUTIONAL ACCUMULATION' :
                   liveData.technicals.institutionalSignal === 'Distribution' ? '⚠️ INSTITUTIONAL DISTRIBUTION' : 'NEUTRAL MARKET BALANCE'}
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Delivery Volume */}
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                    Delivery Volume %
                  </p>
                  <div className="flex items-end gap-2 mb-1">
                    <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {liveData.technicals.deliveryPercent}%
                    </span>
                    <span className="text-[9px] mb-1" style={{ color: liveData.technicals.deliveryPercent > 50 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                      {liveData.technicals.deliveryPercent > 50 ? 'Institutional Accumulation' : 'Retail Activity'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${liveData.technicals.deliveryPercent}%`,
                        background: liveData.technicals.deliveryPercent > 50 ? 'var(--accent-green)' : 'var(--accent-blue)'
                      }}
                    />
                  </div>
                </div>

                {/* Put-Call Ratio */}
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                    Put-Call Ratio (PCR)
                  </p>
                  <div className="flex items-end gap-2 mb-1">
                    <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {liveData.technicals.pcr}
                    </span>
                    <span className="text-[9px] mb-1"
                      style={{
                        color: liveData.technicals.pcr > 1.15 ? 'var(--accent-green)' :
                               liveData.technicals.pcr < 0.85 ? 'var(--accent-red)' : 'var(--accent-yellow)'
                      }}>
                      {liveData.technicals.pcr > 1.15 ? 'Bullish Sentiment' :
                       liveData.technicals.pcr < 0.85 ? 'Bearish Sentiment' : 'Neutral Range'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${Math.min(100, (liveData.technicals.pcr / 2.0) * 100)}%`,
                        background: liveData.technicals.pcr > 1.15 ? 'var(--accent-green)' :
                                    liveData.technicals.pcr < 0.85 ? 'var(--accent-red)' : 'var(--accent-yellow)'
                      }}
                    />
                  </div>
                </div>

                {/* OI Signal */}
                <div className="p-3 rounded-lg border" style={{ background: 'var(--bg-primary)', borderColor: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-[10px] uppercase font-semibold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                    Options Open Interest Build-up
                  </p>
                  <p className="text-base font-bold mt-1"
                    style={{
                      color: ['Long Build-up', 'Short Covering'].includes(liveData.technicals.oiSignal) ? 'var(--accent-green)' :
                             ['Short Build-up', 'Long Unwinding'].includes(liveData.technicals.oiSignal) ? 'var(--accent-red)' : 'var(--text-secondary)'
                    }}>
                    {liveData.technicals.oiSignal}
                  </p>
                  <p className="text-[9px] mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>
                    {liveData.technicals.oiSignal === 'Long Build-up' ? 'New long contracts being created' :
                     liveData.technicals.oiSignal === 'Short Covering' ? 'Short positions are actively closing out' :
                     liveData.technicals.oiSignal === 'Short Build-up' ? 'New short contracts being opened' :
                     liveData.technicals.oiSignal === 'Long Unwinding' ? 'Long contracts are booking profits' :
                     'No significant derivative momentum build-up'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Technical Indicators (14D) */}
          {liveData && (
            <div className="rounded-xl p-5 glass-card"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                📈 Technical Indicators (14D)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Relative Strength Index */}
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      RSI (14) Momentum
                    </p>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded"
                      style={{
                        background: liveData.technicals.rsi > 70 ? 'var(--accent-red-dim)' :
                                   liveData.technicals.rsi < 30 ? 'var(--accent-green-dim)' : 'var(--accent-yellow-dim)',
                        color: liveData.technicals.rsi > 70 ? 'var(--accent-red)' :
                               liveData.technicals.rsi < 30 ? 'var(--accent-green)' : 'var(--accent-yellow)'
                      }}>
                      {liveData.technicals.rsi > 70 ? 'OVERBOUGHT (SELL)' :
                       liveData.technicals.rsi < 30 ? 'OVERSOLD (BUY)' : 'NEUTRAL ZONE'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      {liveData.technicals.rsi}
                    </span>
                    <div className="flex-1 bg-slate-800 h-2 rounded-full relative">
                      {/* Safe zone boundary ticks (30 to 70) */}
                      <div className="absolute left-[30%] right-[30%] top-0 bottom-0 bg-slate-700 bg-opacity-30 border-l border-r border-slate-600" />
                      <div className="absolute w-2 h-2 rounded-full bg-white top-0 shadow"
                        style={{ left: `calc(${liveData.technicals.rsi}% - 4px)` }}
                      />
                    </div>
                  </div>
                </div>

                {/* MACD Trend */}
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-[10px] uppercase font-semibold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                    MACD Signal (Crossover)
                  </p>
                  <p className="text-sm font-bold mt-1"
                    style={{
                      color: liveData.technicals.macd === 'bullish_crossover' ? 'var(--accent-green)' :
                             liveData.technicals.macd === 'bearish_crossover' ? 'var(--accent-red)' : 'var(--text-secondary)'
                    }}>
                    {liveData.technicals.macd === 'bullish_crossover' ? '🟢 Bullish Crossover (Upward Trend)' :
                     liveData.technicals.macd === 'bearish_crossover' ? '🔴 Bearish Crossover (Downward Trend)' : '⚪ Neutral / Sideways Crossover'}
                  </p>
                  <p className="text-[9px] mt-2 leading-snug" style={{ color: 'var(--text-muted)' }}>
                    {liveData.technicals.macd === 'bullish_crossover' ? 'Short-term exponential average crossed above long-term line' :
                     liveData.technicals.macd === 'bearish_crossover' ? 'Short-term exponential average crossed below long-term line' :
                     'Moving averages are moving parallel with no breakout trend'}
                  </p>
                </div>
              </div>
            </div>
          )}

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
