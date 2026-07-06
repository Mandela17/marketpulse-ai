'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Nifty 50 stocks grouped by sector
const NIFTY50_STOCKS: { symbol: string; name: string; sector: string; weight: number }[] = [
  // Banking & Finance (largest weight)
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking', weight: 13.1 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking', weight: 7.8 },
  { symbol: 'SBIN', name: 'SBI', sector: 'Banking', weight: 3.2 },
  { symbol: 'KOTAKBANK', name: 'Kotak Bank', sector: 'Banking', weight: 2.7 },
  { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Banking', weight: 2.5 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'Finance', weight: 2.1 },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv', sector: 'Finance', weight: 0.8 },
  // IT
  { symbol: 'TCS', name: 'TCS', sector: 'IT', weight: 4.2 },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT', weight: 5.8 },
  { symbol: 'HCLTECH', name: 'HCL Tech', sector: 'IT', weight: 1.8 },
  { symbol: 'WIPRO', name: 'Wipro', sector: 'IT', weight: 0.9 },
  { symbol: 'TECHM', name: 'Tech Mahindra', sector: 'IT', weight: 0.8 },
  // Oil & Energy
  { symbol: 'RELIANCE', name: 'Reliance', sector: 'Energy', weight: 9.5 },
  { symbol: 'ONGC', name: 'ONGC', sector: 'Energy', weight: 1.1 },
  { symbol: 'NTPC', name: 'NTPC', sector: 'Power', weight: 1.5 },
  { symbol: 'POWERGRID', name: 'Power Grid', sector: 'Power', weight: 1.2 },
  { symbol: 'ADANIENT', name: 'Adani Ent.', sector: 'Energy', weight: 1.0 },
  // Auto
  { symbol: 'MARUTI', name: 'Maruti', sector: 'Auto', weight: 1.6 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'Auto', weight: 1.4 },
  { symbol: 'M&M', name: 'M&M', sector: 'Auto', weight: 2.3 },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto', sector: 'Auto', weight: 1.0 },
  { symbol: 'EICHERMOT', name: 'Eicher Motors', sector: 'Auto', weight: 0.8 },
  { symbol: 'HEROMOTOCO', name: 'Hero Moto', sector: 'Auto', weight: 0.7 },
  // Pharma & Health
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Pharma', weight: 1.8 },
  { symbol: 'DRREDDY', name: 'Dr. Reddy', sector: 'Pharma', weight: 0.9 },
  { symbol: 'CIPLA', name: 'Cipla', sector: 'Pharma', weight: 0.8 },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospital', sector: 'Pharma', weight: 0.7 },
  // FMCG
  { symbol: 'HINDUNILVR', name: 'HUL', sector: 'FMCG', weight: 2.5 },
  { symbol: 'ITC', name: 'ITC', sector: 'FMCG', weight: 4.1 },
  { symbol: 'NESTLEIND', name: 'Nestle', sector: 'FMCG', weight: 0.7 },
  { symbol: 'TATACONSUM', name: 'Tata Consumer', sector: 'FMCG', weight: 0.6 },
  // Metals & Mining
  { symbol: 'TATASTEEL', name: 'Tata Steel', sector: 'Metals', weight: 1.0 },
  { symbol: 'JSWSTEEL', name: 'JSW Steel', sector: 'Metals', weight: 0.9 },
  { symbol: 'HINDALCO', name: 'Hindalco', sector: 'Metals', weight: 0.7 },
  { symbol: 'COALINDIA', name: 'Coal India', sector: 'Metals', weight: 0.8 },
  // Telecom & Media
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', weight: 3.5 },
  // Conglomerate / Others
  { symbol: 'LT', name: 'L&T', sector: 'Infra', weight: 3.5 },
  { symbol: 'ULTRACEMCO', name: 'UltraTech', sector: 'Cement', weight: 1.0 },
  { symbol: 'GRASIM', name: 'Grasim', sector: 'Cement', weight: 0.7 },
  { symbol: 'SHREECEM', name: 'Shree Cement', sector: 'Cement', weight: 0.5 },
  { symbol: 'TITAN', name: 'Titan', sector: 'Consumer', weight: 1.4 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints', sector: 'Consumer', weight: 1.1 },
  { symbol: 'ADANIPORTS', name: 'Adani Ports', sector: 'Infra', weight: 1.2 },
  { symbol: 'DIVISLAB', name: "Divi's Labs", sector: 'Pharma', weight: 0.7 },
  { symbol: 'SBILIFE', name: 'SBI Life', sector: 'Insurance', weight: 0.7 },
  { symbol: 'HDFCLIFE', name: 'HDFC Life', sector: 'Insurance', weight: 0.6 },
  { symbol: 'BPCL', name: 'BPCL', sector: 'Energy', weight: 0.6 },
  { symbol: 'TRENT', name: 'Trent', sector: 'Retail', weight: 0.8 },
  { symbol: 'BEL', name: 'BEL', sector: 'Defense', weight: 0.7 },
  { symbol: 'INDUSINDBK', name: 'IndusInd Bank', sector: 'Banking', weight: 0.7 },
];

interface StockQuote {
  symbol: string;
  price: number;
  changePercent: number;
}

export default function HeatmapPage() {
  const [quotes, setQuotes] = useState<Map<string, StockQuote>>(new Map());
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'weight' | 'change'>('weight');

  useEffect(() => {
    async function fetchQuotes() {
      const results = new Map<string, StockQuote>();
      
      // Fetch quotes in parallel batches of 10
      const symbols = NIFTY50_STOCKS.map(s => s.symbol);
      const batchSize = 10;
      
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const promises = batch.map(symbol =>
          fetch(`/api/stock?symbol=${symbol}`)
            .then(r => r.json())
            .then(data => {
              // API returns { quote: { price, changePercent, ... }, technicals }
              const q = data?.quote || data;
              if (q && q.price > 0) {
                results.set(symbol, {
                  symbol,
                  price: q.price,
                  changePercent: q.changePercent || 0,
                });
              }
            })
            .catch(() => {})
        );
        await Promise.all(promises);
      }
      
      setQuotes(results);
      setLoading(false);
    }
    
    fetchQuotes();
  }, []);

  // Sort stocks
  const sortedStocks = [...NIFTY50_STOCKS].sort((a, b) => {
    if (sortBy === 'change') {
      const aChange = quotes.get(a.symbol)?.changePercent || 0;
      const bChange = quotes.get(b.symbol)?.changePercent || 0;
      return bChange - aChange;
    }
    return b.weight - a.weight;
  });

  // Group by sector
  const sectors = new Map<string, typeof NIFTY50_STOCKS>();
  for (const stock of sortedStocks) {
    if (!sectors.has(stock.sector)) sectors.set(stock.sector, []);
    sectors.get(stock.sector)!.push(stock);
  }

  // Stats
  const allChanges = Array.from(quotes.values()).map(q => q.changePercent);
  const advancers = allChanges.filter(c => c > 0).length;
  const decliners = allChanges.filter(c => c < 0).length;
  const avgChange = allChanges.length > 0 ? allChanges.reduce((s, c) => s + c, 0) / allChanges.length : 0;

  function getHeatColor(changePct: number): string {
    if (changePct >= 3) return 'rgba(0, 214, 143, 0.35)';
    if (changePct >= 2) return 'rgba(0, 214, 143, 0.25)';
    if (changePct >= 1) return 'rgba(0, 214, 143, 0.18)';
    if (changePct >= 0.3) return 'rgba(0, 214, 143, 0.10)';
    if (changePct > -0.3) return 'rgba(255, 255, 255, 0.04)';
    if (changePct > -1) return 'rgba(255, 77, 106, 0.10)';
    if (changePct > -2) return 'rgba(255, 77, 106, 0.18)';
    if (changePct > -3) return 'rgba(255, 77, 106, 0.25)';
    return 'rgba(255, 77, 106, 0.35)';
  }

  function getTextColor(changePct: number): string {
    if (changePct >= 0.3) return '#00d68f';
    if (changePct > -0.3) return '#94a3b8';
    return '#ff4d6a';
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div className="mb-6 animate-fade-in-up">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Nifty 50 Heatmap</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Real-time performance visualization of India&apos;s top 50 stocks
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortBy('weight')}
              className="text-[11px] px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer"
              style={{
                background: sortBy === 'weight' ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
                color: sortBy === 'weight' ? '#60a5fa' : 'var(--text-muted)',
                border: `1px solid ${sortBy === 'weight' ? 'rgba(59,130,246,0.3)' : 'var(--border-subtle)'}`,
              }}>
              By Weight
            </button>
            <button
              onClick={() => setSortBy('change')}
              className="text-[11px] px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer"
              style={{
                background: sortBy === 'change' ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
                color: sortBy === 'change' ? '#60a5fa' : 'var(--text-muted)',
                border: `1px solid ${sortBy === 'change' ? 'rgba(59,130,246,0.3)' : 'var(--border-subtle)'}`,
              }}>
              By Change %
            </button>
          </div>
        </div>
      </div>

      {/* Market Breadth Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 animate-fade-in-up">
        <div className="glass-card-static rounded-xl p-3.5">
          <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Advancers</p>
          <p className="text-2xl font-black" style={{ color: '#00d68f' }}>{advancers}</p>
        </div>
        <div className="glass-card-static rounded-xl p-3.5">
          <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Decliners</p>
          <p className="text-2xl font-black" style={{ color: '#ff4d6a' }}>{decliners}</p>
        </div>
        <div className="glass-card-static rounded-xl p-3.5">
          <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Unchanged</p>
          <p className="text-2xl font-black" style={{ color: '#fbbf24' }}>{quotes.size - advancers - decliners}</p>
        </div>
        <div className="glass-card-static rounded-xl p-3.5">
          <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Avg Change</p>
          <p className="text-2xl font-black" style={{ color: avgChange >= 0 ? '#00d68f' : '#ff4d6a' }}>
            {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-16">
          <div className="w-10 h-10 border-3 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Fetching live quotes for 50 stocks...</p>
        </div>
      )}

      {/* Heatmap Grid — Treemap Style */}
      {!loading && (
        <div className="space-y-4 animate-fade-in-up">
          {Array.from(sectors.entries()).map(([sectorName, stocks]) => {
            const sectorChanges = stocks.map(s => quotes.get(s.symbol)?.changePercent || 0);
            const sectorAvg = sectorChanges.length > 0
              ? sectorChanges.reduce((s, c) => s + c, 0) / sectorChanges.length : 0;

            return (
              <div key={sectorName}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {sectorName}
                  </h3>
                  <span className="text-[10px] font-bold" style={{ color: getTextColor(sectorAvg) }}>
                    {sectorAvg >= 0 ? '+' : ''}{sectorAvg.toFixed(2)}%
                  </span>
                </div>
                <div className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(auto-fill, minmax(${stocks.length <= 3 ? '200px' : '140px'}, 1fr))`,
                  }}>
                  {stocks.map(stock => {
                    const quote = quotes.get(stock.symbol);
                    const change = quote?.changePercent || 0;
                    const price = quote?.price || 0;

                    // Size based on weight
                    const minH = stock.weight > 5 ? 'min-h-[100px]' :
                                 stock.weight > 2 ? 'min-h-[85px]' : 'min-h-[72px]';

                    return (
                      <Link key={stock.symbol} href={`/stock/${stock.symbol}`}
                        className={`${minH} p-3 rounded-xl transition-all duration-200 hover:scale-[1.02] hover:brightness-125 cursor-pointer flex flex-col justify-between`}
                        style={{
                          background: getHeatColor(change),
                          border: `1px solid ${change >= 0 ? 'rgba(0,214,143,0.12)' : 'rgba(255,77,106,0.12)'}`,
                        }}>
                        <div>
                          <p className="text-xs font-black text-white">{stock.symbol}</p>
                          <p className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>
                            {stock.name}
                          </p>
                        </div>
                        <div>
                          {price > 0 && (
                            <p className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                              ₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                          )}
                          <p className="text-sm font-black" style={{ color: getTextColor(change) }}>
                            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
