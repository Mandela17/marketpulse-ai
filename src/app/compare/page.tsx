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
  high52W?: number;
  low52W?: number;
  prediction?: { direction: string; confidence: number } | null;
  technicals?: {
    rsi: number;
    ema20: number;
    ema50: number;
    macdLine: number;
    histogram: number;
    bollingerUpper: number;
    bollingerLower: number;
    volumeRatio: number;
    priceChange5D: number;
    priceChange1M: number;
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
  const [autoCompare, setAutoCompare] = useState(false);

  const fetchStock = async (symbol: string): Promise<StockData | null> => {
    try {
      const [stockRes, predRes] = await Promise.all([
        fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}`).then(r => r.json()),
        fetch(`/api/predict?symbol=${encodeURIComponent(symbol)}`).then(r => r.json()).catch(() => null),
      ]);

      const q = stockRes?.quote || stockRes;
      const t = stockRes?.technicals || null;
      if (!q || !q.price || q.price <= 0) return null;

      return {
        symbol,
        price: q.price || 0,
        change: q.change || 0,
        changePercent: q.changePercent || 0,
        dayHigh: q.dayHigh || q.price || 0,
        dayLow: q.dayLow || q.price || 0,
        volume: q.volume || 0,
        previousClose: q.previousClose || q.price || 0,
        high52W: t?.high52W || 0,
        low52W: t?.low52W || 0,
        prediction: predRes?.prediction ? {
          direction: predRes.prediction.direction || 'unknown',
          confidence: predRes.prediction.confidence || 0,
        } : null,
        technicals: t ? {
          rsi: t.rsi || 0,
          ema20: t.ema20 || 0,
          ema50: t.ema50 || 0,
          macdLine: t.macdLine || 0,
          histogram: t.histogram || 0,
          bollingerUpper: t.bollingerUpper || 0,
          bollingerLower: t.bollingerLower || 0,
          volumeRatio: t.volumeRatio || 0,
          priceChange5D: t.priceChange5D || 0,
          priceChange1M: t.priceChange1M || 0,
        } : null,
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

  // Auto-compare when both symbols are set via popular picks
  useEffect(() => {
    if (autoCompare && symbolA && symbolB) {
      setAutoCompare(false);
      handleCompare();
    }
  }, [autoCompare, symbolA, symbolB]);

  const selectA = (sym: string) => { setSymbolA(sym); setSearchA(sym); setShowDropA(false); };
  const selectB = (sym: string) => { setSymbolB(sym); setSearchB(sym); setShowDropB(false); };

  const resultsA = searchA.length >= 2 && !symbolA ? searchStocks(searchA).slice(0, 6) : [];
  const resultsB = searchB.length >= 2 && !symbolB ? searchStocks(searchB).slice(0, 6) : [];

  // Helper to format numbers safely
  const fmt = (v: number | undefined, decimals = 2) => {
    if (v === undefined || v === null || isNaN(v)) return '—';
    return v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const fmtPrice = (v: number | undefined) => {
    if (!v || isNaN(v)) return '—';
    return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtPct = (v: number | undefined) => {
    if (v === undefined || v === null || isNaN(v)) return '—';
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  };

  const fmtVol = (v: number | undefined) => {
    if (!v || isNaN(v)) return '—';
    if (v >= 10000000) return `${(v / 10000000).toFixed(2)} Cr`;
    if (v >= 100000) return `${(v / 100000).toFixed(2)} L`;
    return v.toLocaleString('en-IN');
  };

  // Build comparison rows
  const rows: { label: string; valA: string; valB: string; better: 'a' | 'b' | 'none'; colorA?: string; colorB?: string }[] = [];
  if (stockA && stockB) {
    const pctColorA = stockA.changePercent >= 0 ? '#00d68f' : '#ff4d6a';
    const pctColorB = stockB.changePercent >= 0 ? '#00d68f' : '#ff4d6a';

    rows.push(
      { label: 'Price', valA: fmtPrice(stockA.price), valB: fmtPrice(stockB.price), better: 'none' },
      { label: 'Change %', valA: fmtPct(stockA.changePercent), valB: fmtPct(stockB.changePercent), better: stockA.changePercent > stockB.changePercent ? 'a' : stockB.changePercent > stockA.changePercent ? 'b' : 'none', colorA: pctColorA, colorB: pctColorB },
      { label: 'Day High', valA: fmtPrice(stockA.dayHigh), valB: fmtPrice(stockB.dayHigh), better: 'none' },
      { label: 'Day Low', valA: fmtPrice(stockA.dayLow), valB: fmtPrice(stockB.dayLow), better: 'none' },
      { label: 'Volume', valA: fmtVol(stockA.volume), valB: fmtVol(stockB.volume), better: stockA.volume > stockB.volume ? 'a' : 'b' },
      {
        label: 'AI Signal',
        valA: stockA.prediction ? `${stockA.prediction.direction === 'up' ? '🟢 BULLISH' : '🔴 BEARISH'}` : '—',
        valB: stockB.prediction ? `${stockB.prediction.direction === 'up' ? '🟢 BULLISH' : '🔴 BEARISH'}` : '—',
        better: 'none',
      },
      {
        label: 'AI Confidence',
        valA: stockA.prediction ? `${stockA.prediction.confidence}%` : '—',
        valB: stockB.prediction ? `${stockB.prediction.confidence}%` : '—',
        better: (stockA.prediction?.confidence || 0) > (stockB.prediction?.confidence || 0) ? 'a' : (stockB.prediction?.confidence || 0) > (stockA.prediction?.confidence || 0) ? 'b' : 'none',
      },
    );

    if (stockA.technicals && stockB.technicals) {
      const ta = stockA.technicals;
      const tb = stockB.technicals;
      rows.push(
        { label: 'RSI(14)', valA: fmt(ta.rsi, 1), valB: fmt(tb.rsi, 1), better: 'none' },
        { label: 'EMA(20)', valA: fmtPrice(ta.ema20), valB: fmtPrice(tb.ema20), better: 'none' },
        { label: 'EMA(50)', valA: fmtPrice(ta.ema50), valB: fmtPrice(tb.ema50), better: 'none' },
        { label: 'MACD', valA: fmt(ta.macdLine), valB: fmt(tb.macdLine), better: ta.macdLine > tb.macdLine ? 'a' : 'b' },
        { label: 'MACD Histogram', valA: fmt(ta.histogram), valB: fmt(tb.histogram), better: ta.histogram > tb.histogram ? 'a' : 'b' },
        { label: 'Volume Ratio', valA: `${fmt(ta.volumeRatio, 2)}x`, valB: `${fmt(tb.volumeRatio, 2)}x`, better: ta.volumeRatio > tb.volumeRatio ? 'a' : 'b' },
        { label: '5D Change', valA: fmtPct(ta.priceChange5D), valB: fmtPct(tb.priceChange5D), better: ta.priceChange5D > tb.priceChange5D ? 'a' : 'b', colorA: ta.priceChange5D >= 0 ? '#00d68f' : '#ff4d6a', colorB: tb.priceChange5D >= 0 ? '#00d68f' : '#ff4d6a' },
        { label: '1M Change', valA: fmtPct(ta.priceChange1M), valB: fmtPct(tb.priceChange1M), better: ta.priceChange1M > tb.priceChange1M ? 'a' : 'b', colorA: ta.priceChange1M >= 0 ? '#00d68f' : '#ff4d6a', colorB: tb.priceChange1M >= 0 ? '#00d68f' : '#ff4d6a' },
      );
    }

    if (stockA.high52W && stockB.high52W) {
      rows.push(
        { label: '52W High', valA: fmtPrice(stockA.high52W), valB: fmtPrice(stockB.high52W), better: 'none' },
        { label: '52W Low', valA: fmtPrice(stockA.low52W), valB: fmtPrice(stockB.low52W), better: 'none' },
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Stock A */}
        <div className="relative">
          <label className="text-[10px] uppercase font-bold block mb-1.5" style={{ color: 'var(--text-muted)' }}>Stock A</label>
          <input
            type="text"
            placeholder="Search stock..."
            value={searchA}
            onChange={e => { setSearchA(e.target.value); setSymbolA(''); setShowDropA(true); }}
            onFocus={() => searchA && !symbolA && setShowDropA(true)}
            className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none text-white"
            style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
          />
          {showDropA && resultsA.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl z-50 shadow-2xl overflow-hidden max-h-48 overflow-y-auto"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              {resultsA.map(s => (
                <div key={s.symbol} onClick={() => selectA(s.symbol)}
                  className="px-3 py-2 cursor-pointer text-xs transition-all"
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
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
            onFocus={() => searchB && !symbolB && setShowDropB(true)}
            className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none text-white"
            style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
          />
          {showDropB && resultsB.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl z-50 shadow-2xl overflow-hidden max-h-48 overflow-y-auto"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              {resultsB.map(s => (
                <div key={s.symbol} onClick={() => selectB(s.symbol)}
                  className="px-3 py-2 cursor-pointer text-xs transition-all"
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
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

      {/* Error States */}
      {!loading && stockA === null && symbolA && stockB !== undefined && (
        <p className="text-xs mb-4" style={{ color: '#ff4d6a' }}>⚠️ Could not fetch data for {symbolA}</p>
      )}
      {!loading && stockB === null && symbolB && stockA !== undefined && (
        <p className="text-xs mb-4" style={{ color: '#ff4d6a' }}>⚠️ Could not fetch data for {symbolB}</p>
      )}

      {/* Comparison Table */}
      {stockA && stockB && rows.length > 0 && (
        <div className="rounded-xl overflow-hidden shadow-xl animate-fade-in-up"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
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
                    <span className="text-xs font-bold" style={{ color: row.colorA || (row.better === 'a' ? '#00d68f' : 'var(--text-primary)') }}>
                      {row.valA} {row.better === 'a' ? ' ✓' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-xs font-bold" style={{ color: row.colorB || (row.better === 'b' ? '#00d68f' : 'var(--text-primary)') }}>
                      {row.valB} {row.better === 'b' ? ' ✓' : ''}
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
                onClick={() => {
                  setSymbolA(a); setSearchA(a);
                  setSymbolB(b); setSearchB(b);
                  setAutoCompare(true);
                }}
                className="text-[10px] px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-all hover:brightness-125"
                style={{ background: 'rgba(59,130,246,0.08)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                {a} vs {b}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
