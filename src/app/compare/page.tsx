'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { searchStocks } from '@/lib/sectorData';

interface StockData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  previousClose: number;
  prediction?: { direction: string; probability: number } | null;
  technicals?: {
    rsi14: number;
    sma20: number;
    sma50: number;
    macd: number;
    adx: number;
    atr: number;
  } | null;
}

export default function ComparePage() {
  const [symbolA, setSymbolA] = useState('');
  const [symbolB, setSymbolB] = useState('');
  const [stockA, setStockA] = useState<StockData | null>(null);
  const [stockB, setStockB] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [showDropA, setShowDropA] = useState(false);
  const [showDropB, setShowDropB] = useState(false);

  const fetchStock = async (symbol: string): Promise<StockData | null> => {
    try {
      const [stockRes, predRes] = await Promise.all([
        fetch(`/api/stock?symbol=${symbol}`).then(r => r.json()),
        fetch(`/api/predict?symbol=${symbol}`).then(r => r.json()).catch(() => null),
      ]);

      const q = stockRes?.quote || stockRes;
      if (!q || q.price <= 0) return null;

      return {
        symbol,
        price: q.price,
        change: q.change || 0,
        changePercent: q.changePercent || 0,
        dayHigh: q.dayHigh || q.price,
        dayLow: q.dayLow || q.price,
        volume: q.volume || 0,
        previousClose: q.previousClose || q.price,
        prediction: predRes?.prediction ? {
          direction: predRes.prediction.direction,
          probability: predRes.prediction.probability,
        } : null,
        technicals: stockRes?.technicals || null,
      };
    } catch { return null; }
  };

  const handleCompare = async () => {
    if (!symbolA || !symbolB) return;
    setLoading(true);
    const [a, b] = await Promise.all([fetchStock(symbolA), fetchStock(symbolB)]);
    setStockA(a);
    setStockB(b);
    setLoading(false);
  };

  const selectA = (sym: string) => { setSymbolA(sym); setSearchA(sym); setShowDropA(false); };
  const selectB = (sym: string) => { setSymbolB(sym); setSearchB(sym); setShowDropB(false); };

  const resultsA = searchA.length >= 2 ? searchStocks(searchA).slice(0, 6) : [];
  const resultsB = searchB.length >= 2 ? searchStocks(searchB).slice(0, 6) : [];

  // Comparison rows
  const rows: { label: string; valA: string; valB: string; better: 'a' | 'b' | 'none' }[] = [];
  if (stockA && stockB) {
    rows.push(
      { label: 'Price', valA: `₹${stockA.price.toLocaleString('en-IN')}`, valB: `₹${stockB.price.toLocaleString('en-IN')}`, better: 'none' },
      { label: 'Change %', valA: `${stockA.changePercent >= 0 ? '+' : ''}${stockA.changePercent.toFixed(2)}%`, valB: `${stockB.changePercent >= 0 ? '+' : ''}${stockB.changePercent.toFixed(2)}%`, better: stockA.changePercent > stockB.changePercent ? 'a' : stockB.changePercent > stockA.changePercent ? 'b' : 'none' },
      { label: 'Day High', valA: `₹${stockA.dayHigh.toLocaleString('en-IN')}`, valB: `₹${stockB.dayHigh.toLocaleString('en-IN')}`, better: 'none' },
      { label: 'Day Low', valA: `₹${stockA.dayLow.toLocaleString('en-IN')}`, valB: `₹${stockB.dayLow.toLocaleString('en-IN')}`, better: 'none' },
      { label: 'Volume', valA: stockA.volume.toLocaleString('en-IN'), valB: stockB.volume.toLocaleString('en-IN'), better: stockA.volume > stockB.volume ? 'a' : 'b' },
      { label: 'AI Signal', valA: stockA.prediction ? `${stockA.prediction.direction === 'bullish' ? '🟢' : '🔴'} ${stockA.prediction.direction.toUpperCase()}` : '—', valB: stockB.prediction ? `${stockB.prediction.direction === 'bullish' ? '🟢' : '🔴'} ${stockB.prediction.direction.toUpperCase()}` : '—', better: 'none' },
      { label: 'AI Confidence', valA: stockA.prediction ? `${stockA.prediction.probability}%` : '—', valB: stockB.prediction ? `${stockB.prediction.probability}%` : '—', better: (stockA.prediction?.probability || 0) > (stockB.prediction?.probability || 0) ? 'a' : 'b' },
    );

    if (stockA.technicals && stockB.technicals) {
      rows.push(
        { label: 'RSI(14)', valA: stockA.technicals.rsi14?.toFixed(1) || '—', valB: stockB.technicals.rsi14?.toFixed(1) || '—', better: 'none' },
        { label: 'SMA(20)', valA: stockA.technicals.sma20 ? `₹${stockA.technicals.sma20.toFixed(0)}` : '—', valB: stockB.technicals.sma20 ? `₹${stockB.technicals.sma20.toFixed(0)}` : '—', better: 'none' },
        { label: 'SMA(50)', valA: stockA.technicals.sma50 ? `₹${stockA.technicals.sma50.toFixed(0)}` : '—', valB: stockB.technicals.sma50 ? `₹${stockB.technicals.sma50.toFixed(0)}` : '—', better: 'none' },
        { label: 'MACD', valA: stockA.technicals.macd?.toFixed(2) || '—', valB: stockB.technicals.macd?.toFixed(2) || '—', better: (stockA.technicals.macd || 0) > (stockB.technicals.macd || 0) ? 'a' : 'b' },
        { label: 'ADX', valA: stockA.technicals.adx?.toFixed(1) || '—', valB: stockB.technicals.adx?.toFixed(1) || '—', better: (stockA.technicals.adx || 0) > (stockB.technicals.adx || 0) ? 'a' : 'b' },
      );
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">⚖️ Stock Comparison</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Compare two stocks side-by-side — price, technicals, AI predictions
        </p>
      </div>

      {/* Stock Pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {/* Stock A */}
        <div className="relative">
          <label className="text-[10px] uppercase font-bold block mb-1.5" style={{ color: 'var(--text-muted)' }}>Stock A</label>
          <input
            type="text"
            placeholder="Search stock..."
            value={searchA}
            onChange={e => { setSearchA(e.target.value); setSymbolA(''); setShowDropA(true); }}
            onFocus={() => setShowDropA(true)}
            className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none text-white"
            style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
          />
          {showDropA && resultsA.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl z-50 shadow-2xl overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              {resultsA.map(s => (
                <div key={s.symbol} onClick={() => selectA(s.symbol)}
                  className="px-3 py-2 cursor-pointer text-xs hover:brightness-125 transition-all"
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span className="font-bold" style={{ color: '#60a5fa' }}>{s.symbol}</span>
                  <span className="ml-2" style={{ color: 'var(--text-muted)' }}>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stock B */}
        <div className="relative">
          <label className="text-[10px] uppercase font-bold block mb-1.5" style={{ color: 'var(--text-muted)' }}>Stock B</label>
          <input
            type="text"
            placeholder="Search stock..."
            value={searchB}
            onChange={e => { setSearchB(e.target.value); setSymbolB(''); setShowDropB(true); }}
            onFocus={() => setShowDropB(true)}
            className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none text-white"
            style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
          />
          {showDropB && resultsB.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl z-50 shadow-2xl overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              {resultsB.map(s => (
                <div key={s.symbol} onClick={() => selectB(s.symbol)}
                  className="px-3 py-2 cursor-pointer text-xs hover:brightness-125 transition-all"
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span className="font-bold" style={{ color: '#60a5fa' }}>{s.symbol}</span>
                  <span className="ml-2" style={{ color: 'var(--text-muted)' }}>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Compare Button */}
      <button onClick={handleCompare}
        disabled={!symbolA || !symbolB || loading}
        className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer mb-6"
        style={{
          background: symbolA && symbolB ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(255,255,255,0.05)',
          color: symbolA && symbolB ? 'white' : 'var(--text-muted)',
          opacity: loading ? 0.7 : 1,
        }}>
        {loading ? '⏳ Comparing...' : '⚖️ Compare Stocks'}
      </button>

      {/* Comparison Table */}
      {stockA && stockB && rows.length > 0 && (
        <div className="rounded-xl overflow-hidden shadow-xl animate-fade-in-up"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Metric</th>
                <th className="text-right px-4 py-3 text-sm font-bold" style={{ color: '#60a5fa' }}>
                  <Link href={`/stock/${symbolA}`} className="hover:underline">{symbolA}</Link>
                </th>
                <th className="text-right px-4 py-3 text-sm font-bold" style={{ color: '#a78bfa' }}>
                  <Link href={`/stock/${symbolB}`} className="hover:underline">{symbolB}</Link>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.label}
                  style={{ borderBottom: '1px solid var(--border-subtle)', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                  <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{row.label}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-xs font-bold" style={{ color: row.better === 'a' ? '#00d68f' : 'var(--text-primary)' }}>
                      {row.valA} {row.better === 'a' ? '✓' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-xs font-bold" style={{ color: row.better === 'b' ? '#00d68f' : 'var(--text-primary)' }}>
                      {row.valB} {row.better === 'b' ? '✓' : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick Compare Pairs */}
      {!stockA && !stockB && (
        <div className="mt-8 text-center">
          <p className="text-xs font-bold mb-3" style={{ color: 'var(--text-muted)' }}>Popular Comparisons</p>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              ['RELIANCE', 'TCS'], ['HDFCBANK', 'ICICIBANK'], ['INFY', 'WIPRO'],
              ['TATAMOTORS', 'MARUTI'], ['SUNPHARMA', 'DRREDDY'], ['ITC', 'HINDUNILVR'],
            ].map(([a, b]) => (
              <button key={`${a}-${b}`}
                onClick={() => { setSymbolA(a); setSearchA(a); setSymbolB(b); setSearchB(b); }}
                className="text-[10px] px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-all hover:brightness-125"
                style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                {a} vs {b}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
