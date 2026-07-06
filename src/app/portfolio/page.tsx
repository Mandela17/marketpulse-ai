'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Holding {
  symbol: string;
  name: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  change: number;
  changePercent: number;
  pnl: number;
  pnlPercent: number;
  invested: number;
  currentValue: number;
}

const STORAGE_KEY = 'marketpulse_portfolio';

interface SavedHolding {
  symbol: string;
  name: string;
  qty: number;
  avgPrice: number;
}

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [savedHoldings, setSavedHoldings] = useState<SavedHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newAvgPrice, setNewAvgPrice] = useState('');

  // Load saved holdings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as SavedHolding[];
        setSavedHoldings(parsed);
      } catch {}
    }
    setLoading(false);
  }, []);

  // Fetch live prices when saved holdings change
  useEffect(() => {
    if (savedHoldings.length === 0) {
      setHoldings([]);
      return;
    }

    async function fetchPrices() {
      const results: Holding[] = [];

      for (const h of savedHoldings) {
        try {
          const res = await fetch(`/api/stock?symbol=${h.symbol}`);
          const data = await res.json();
          const q = data?.quote || data;

          if (q?.price > 0) {
            const currentValue = q.price * h.qty;
            const invested = h.avgPrice * h.qty;
            const pnl = currentValue - invested;
            const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

            results.push({
              symbol: h.symbol,
              name: h.name || h.symbol,
              qty: h.qty,
              avgPrice: h.avgPrice,
              currentPrice: q.price,
              change: q.change || 0,
              changePercent: q.changePercent || 0,
              pnl,
              pnlPercent,
              invested,
              currentValue,
            });
          }
        } catch {}
      }

      setHoldings(results);
    }

    fetchPrices();
  }, [savedHoldings]);

  const saveToStorage = (list: SavedHolding[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setSavedHoldings(list);
  };

  const addHolding = () => {
    const symbol = newSymbol.trim().toUpperCase();
    const qty = parseFloat(newQty);
    const avgPrice = parseFloat(newAvgPrice);

    if (!symbol || isNaN(qty) || qty <= 0 || isNaN(avgPrice) || avgPrice <= 0) return;

    const existing = savedHoldings.find(h => h.symbol === symbol);
    if (existing) {
      // Average out
      const totalQty = existing.qty + qty;
      const totalCost = existing.avgPrice * existing.qty + avgPrice * qty;
      const newAvg = totalCost / totalQty;
      const updated = savedHoldings.map(h =>
        h.symbol === symbol ? { ...h, qty: totalQty, avgPrice: parseFloat(newAvg.toFixed(2)) } : h
      );
      saveToStorage(updated);
    } else {
      saveToStorage([...savedHoldings, { symbol, name: symbol, qty, avgPrice }]);
    }

    setNewSymbol('');
    setNewQty('');
    setNewAvgPrice('');
    setShowAdd(false);
  };

  const removeHolding = (symbol: string) => {
    saveToStorage(savedHoldings.filter(h => h.symbol !== symbol));
  };

  // Portfolio totals
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0);
  const totalCurrent = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const todayPnl = holdings.reduce((s, h) => s + (h.change * h.qty), 0);

  return (
    <div className="animate-fade-in" style={{ width: '100%' }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">💼 Portfolio Tracker</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Track your holdings with live P&L calculations
          </p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="text-xs px-4 py-2 rounded-xl font-bold transition-all cursor-pointer hover:brightness-125"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white' }}>
          {showAdd ? '✕ Cancel' : '+ Add Holding'}
        </button>
      </div>

      {/* Add Holding Form */}
      {showAdd && (
        <div className="glass-card-static rounded-xl p-4 mb-5 animate-fade-in-up">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>Symbol</label>
              <input
                type="text"
                placeholder="e.g. RELIANCE"
                value={newSymbol}
                onChange={e => setNewSymbol(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none text-white"
                style={{ border: '1px solid var(--border-color)' }}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>Quantity</label>
              <input
                type="number"
                placeholder="e.g. 10"
                value={newQty}
                onChange={e => setNewQty(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none text-white"
                style={{ border: '1px solid var(--border-color)' }}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>Avg Buy Price (₹)</label>
              <input
                type="number"
                placeholder="e.g. 2450"
                value={newAvgPrice}
                onChange={e => setNewAvgPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none text-white"
                style={{ border: '1px solid var(--border-color)' }}
              />
            </div>
            <div className="flex items-end">
              <button onClick={addHolding}
                className="w-full px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer hover:brightness-110"
                style={{ background: '#00d68f', color: '#000' }}>
                Add Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio Summary */}
      {holdings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5 animate-fade-in-up">
          <div className="glass-card-static rounded-xl p-3.5">
            <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Current Value</p>
            <p className="text-lg font-black text-white">₹{totalCurrent.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</p>
          </div>
          <div className="glass-card-static rounded-xl p-3.5">
            <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Invested</p>
            <p className="text-lg font-black text-white">₹{totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</p>
          </div>
          <div className="glass-card-static rounded-xl p-3.5">
            <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Total P&L</p>
            <p className="text-lg font-black" style={{ color: totalPnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
              {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
            </p>
            <p className="text-[10px] font-bold" style={{ color: totalPnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
              ({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%)
            </p>
          </div>
          <div className="glass-card-static rounded-xl p-3.5">
            <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Today P&L</p>
            <p className="text-lg font-black" style={{ color: todayPnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
              {todayPnl >= 0 ? '+' : ''}₹{todayPnl.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
            </p>
          </div>
          <div className="glass-card-static rounded-xl p-3.5">
            <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Holdings</p>
            <p className="text-lg font-black text-white">{holdings.length}</p>
          </div>
        </div>
      )}

      {/* Holdings Table */}
      {holdings.length > 0 ? (
        <div className="rounded-xl overflow-hidden shadow-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Stock</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>Qty</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>Avg Price</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>LTP</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>Invested</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>Current</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>P&L</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}></th>
              </tr>
            </thead>
            <tbody>
              {holdings.sort((a, b) => b.currentValue - a.currentValue).map(h => (
                <tr key={h.symbol}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td className="px-4 py-3">
                    <Link href={`/stock/${h.symbol}`}>
                      <p className="text-sm font-bold hover:underline" style={{ color: '#60a5fa' }}>{h.symbol}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {h.changePercent >= 0 ? '+' : ''}{h.changePercent.toFixed(2)}% today
                      </p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span className="text-xs font-bold text-white">{h.qty}</span>
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      ₹{h.avgPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-bold text-white">
                      ₹{h.currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      ₹{h.invested.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <span className="text-xs font-bold text-white">
                      ₹{h.currentValue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div>
                      <p className="text-xs font-bold" style={{ color: h.pnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                        {h.pnl >= 0 ? '+' : ''}₹{h.pnl.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                      </p>
                      <p className="text-[10px]" style={{ color: h.pnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                        {h.pnlPercent >= 0 ? '+' : ''}{h.pnlPercent.toFixed(2)}%
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => removeHolding(h.symbol)}
                      className="text-[10px] px-2 py-1 rounded-lg font-bold cursor-pointer hover:brightness-125"
                      style={{ background: 'rgba(255,77,106,0.1)', color: '#ff4d6a' }}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !loading ? (
        <div className="text-center py-16 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <p className="text-4xl mb-3">💼</p>
          <h2 className="text-base font-bold text-white mb-1">No Holdings Yet</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Add your stock holdings to track P&L in real-time
          </p>
          <button onClick={() => setShowAdd(true)}
            className="text-xs px-4 py-2 rounded-xl font-bold cursor-pointer hover:brightness-125"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white' }}>
            + Add Your First Holding
          </button>
        </div>
      ) : null}
    </div>
  );
}
