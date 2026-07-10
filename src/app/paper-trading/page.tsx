'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  PaperTradingState, PaperPosition, ClosedTrade,
  loadPaperState, loadPaperStateFromDB, resetPaperAccount, placePaperOrder,
  getOpenPositions, getPaperStats, PlaceOrderParams,
} from '@/lib/paperTradingStore';
import { searchStocks, getStockBySymbol } from '@/lib/sectorData';

// ─── Format Helpers ──────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function pnlColor(n: number): string {
  return n > 0 ? 'var(--accent-green)' : n < 0 ? 'var(--accent-red)' : 'var(--text-muted)';
}

function pnlSign(n: number): string {
  return n > 0 ? '+' : '';
}

function daysBetween(a: string, b: string): number {
  return Math.max(1, Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
  ));
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function PaperTradingPage() {
  const [state, setState] = useState<PaperTradingState | null>(null);
  const [positions, setPositions] = useState<(PaperPosition & { currentPrice: number; unrealizedPnl: number; unrealizedPnlPercent: number })[]>([]);
  const [stats, setStats] = useState<ReturnType<typeof getPaperStats> | null>(null);

  // Trade form
  const [symbol, setSymbol] = useState('');
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string }[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [qty, setQty] = useState('1');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'SL'>('MARKET');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);

  // Confirmation modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<PlaceOrderParams | null>(null);
  const [orderResult, setOrderResult] = useState<{ success: boolean; message: string } | null>(null);

  // Journal filter
  const [journalFilter, setJournalFilter] = useState<'all' | 'winners' | 'losers'>('all');

  // Reset confirm
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Read URL params from Strategy Hub
  const searchParams = useSearchParams();

  // Load state from Supabase (with localStorage fallback) + prefill from URL
  useEffect(() => {
    const init = async () => {
      const s = await loadPaperStateFromDB();
      setState(s);
      setStats(getPaperStats(s));
      refreshPositions(s);

      // Pre-fill from strategy link: ?symbol=X&price=Y&sl=Z&target=T&strategy=Name
      const urlSymbol = searchParams.get('symbol');
      const urlPrice = searchParams.get('price');
      const urlSl = searchParams.get('sl');
      const urlTarget = searchParams.get('target');
      const urlStrategy = searchParams.get('strategy');

      if (urlSymbol) {
        setSymbol(urlSymbol.toUpperCase());
        if (urlPrice) setLivePrice(parseFloat(urlPrice));
        if (urlSl) setStopLoss(urlSl);
        if (urlTarget) setTarget(urlTarget);
        setSide('BUY');
        // Clear URL params without reload
        window.history.replaceState({}, '', '/paper-trading');
      }
    };
    init();
  }, [searchParams]);

  // Refresh positions with live prices
  const refreshPositions = useCallback(async (s: PaperTradingState) => {
    const openPos = getOpenPositions(s);
    const enriched = await Promise.all(
      openPos.map(async (p) => {
        try {
          const res = await fetch(`/api/stock?symbol=${p.symbol}`);
          const data = await res.json();
          const curPrice = data?.quote?.price || data?.price || p.avgPrice;
          const unrealizedPnl = (curPrice - p.avgPrice) * p.qty;
          const unrealizedPnlPercent = ((curPrice - p.avgPrice) / p.avgPrice) * 100;
          return { ...p, currentPrice: curPrice, unrealizedPnl, unrealizedPnlPercent };
        } catch {
          return { ...p, currentPrice: p.avgPrice, unrealizedPnl: 0, unrealizedPnlPercent: 0 };
        }
      })
    );
    setPositions(enriched);
  }, []);

  // Auto-refresh positions every 30s
  useEffect(() => {
    if (!state) return;
    const interval = setInterval(() => refreshPositions(state), 30000);
    return () => clearInterval(interval);
  }, [state, refreshPositions]);

  // Search stocks
  useEffect(() => {
    if (symbol.length >= 1) {
      const results = searchStocks(symbol);
      setSearchResults(results);
      setShowSearch(results.length > 0);
    } else {
      setSearchResults([]);
      setShowSearch(false);
    }
  }, [symbol]);

  // Fetch live price when symbol is selected
  const fetchPrice = useCallback(async (sym: string) => {
    if (!sym) return;
    setLoadingPrice(true);
    try {
      const res = await fetch(`/api/stock?symbol=${sym}`);
      const data = await res.json();
      setLivePrice(data?.quote?.price || data?.price || null);
    } catch {
      setLivePrice(null);
    }
    setLoadingPrice(false);
  }, []);

  const selectSymbol = (sym: string) => {
    setSymbol(sym);
    setShowSearch(false);
    fetchPrice(sym);
  };

  // Prepare order for confirmation
  const prepareOrder = () => {
    if (!symbol || !qty || !livePrice) return;

    const price = orderType === 'MARKET' ? livePrice : parseFloat(limitPrice) || livePrice;
    const params: PlaceOrderParams = {
      symbol: symbol.toUpperCase(),
      side,
      orderType,
      qty: parseInt(qty) || 1,
      price,
      limitPrice: orderType !== 'MARKET' ? parseFloat(limitPrice) || undefined : undefined,
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      target: target ? parseFloat(target) : undefined,
      source: 'manual',
    };
    setPendingOrder(params);
    setShowConfirm(true);
  };

  // Execute order
  const executeOrder = () => {
    if (!pendingOrder) return;
    const result = placePaperOrder(pendingOrder);
    if (result.success) {
      setOrderResult({ success: true, message: `${pendingOrder.side} ${pendingOrder.qty} ${pendingOrder.symbol} @ ₹${fmt(pendingOrder.price)}` });
      const newState = loadPaperState();
      setState(newState);
      setStats(getPaperStats(newState));
      refreshPositions(newState);
      // Reset form
      setSymbol('');
      setQty('1');
      setLimitPrice('');
      setStopLoss('');
      setTarget('');
      setLivePrice(null);
    } else {
      setOrderResult({ success: false, message: result.error || 'Order failed' });
    }
    setShowConfirm(false);
    setTimeout(() => setOrderResult(null), 4000);
  };

  // Close position
  const closePosition = async (pos: PaperPosition & { currentPrice: number }) => {
    const result = placePaperOrder({
      symbol: pos.symbol,
      side: 'SELL',
      orderType: 'MARKET',
      qty: pos.qty,
      price: pos.currentPrice,
      source: 'manual',
    });
    if (result.success) {
      const newState = loadPaperState();
      setState(newState);
      setStats(getPaperStats(newState));
      refreshPositions(newState);
      setOrderResult({ success: true, message: `Closed ${pos.symbol}: ${pos.qty} shares @ ₹${fmt(pos.currentPrice)}` });
      setTimeout(() => setOrderResult(null), 4000);
    }
  };

  // Reset account
  const handleReset = () => {
    const fresh = resetPaperAccount();
    setState(fresh);
    setStats(getPaperStats(fresh));
    setPositions([]);
    setShowResetConfirm(false);
    setOrderResult({ success: true, message: 'Paper account reset to ₹10,00,000' });
    setTimeout(() => setOrderResult(null), 3000);
  };

  // Journal data
  const filteredTrades = state?.closedTrades?.filter(t => {
    if (journalFilter === 'winners') return t.pnl > 0;
    if (journalFilter === 'losers') return t.pnl < 0;
    return true;
  }).reverse() || [];

  if (!state || !stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const orderValue = pendingOrder ? pendingOrder.price * pendingOrder.qty : 0;
  const riskPercent = stats.portfolioValue > 0 ? (orderValue / stats.portfolioValue) * 100 : 0;

  return (
    <div style={{ width: '100%', maxWidth: '100%' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'clamp(24px, 4vw, 32px)' }}>📝</span>
          <h1 style={{
            fontSize: 'clamp(22px, 4vw, 32px)',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #10b981, #3b82f6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0,
          }}>
            Paper Trading
          </h1>
          <span style={{
            fontSize: 10, padding: '3px 10px', borderRadius: 9999, fontWeight: 700,
            background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
            border: '1px solid rgba(245,158,11,0.3)',
          }}>
            SIMULATED — NO REAL MONEY
          </span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
          Practice trading with ₹10L virtual capital. All orders use live Yahoo Finance prices.
        </p>
      </div>

      {/* ── Order Result Toast ── */}
      {orderResult && (
        <div style={{
          padding: '12px 16px', borderRadius: 12, marginBottom: 16,
          background: orderResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(255,77,106,0.1)',
          border: `1px solid ${orderResult.success ? 'rgba(16,185,129,0.3)' : 'rgba(255,77,106,0.3)'}`,
          color: orderResult.success ? 'var(--accent-green)' : 'var(--accent-red)',
          fontSize: 13, fontWeight: 600,
          animation: 'fadeIn 0.3s ease',
        }}>
          {orderResult.success ? '✅' : '❌'} {orderResult.message}
        </div>
      )}

      {/* ── Account Summary ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 12, marginBottom: 24,
      }}>
        {[
          { label: 'Portfolio Value', value: `₹${fmtInt(stats.portfolioValue)}`, color: 'var(--text-primary)' },
          { label: 'Cash Available', value: `₹${fmtInt(stats.cashAvailable)}`, color: 'var(--accent-blue)' },
          { label: 'Invested', value: `₹${fmtInt(stats.investedValue)}`, color: 'var(--accent-purple)' },
          { label: 'Total P&L', value: `${pnlSign(stats.totalRealizedPnl)}₹${fmtInt(Math.abs(stats.totalRealizedPnl))}`, color: pnlColor(stats.totalRealizedPnl) },
          { label: 'Win Rate', value: stats.totalTrades > 0 ? `${stats.winRate.toFixed(0)}%` : '—', color: stats.winRate >= 50 ? 'var(--accent-green)' : 'var(--accent-red)' },
          { label: 'Trades', value: `${stats.totalTrades} (${stats.openPositionCount} open)`, color: 'var(--text-secondary)' },
        ].map((card) => (
          <div key={card.label} style={{
            padding: '14px 16px', borderRadius: 12,
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>{card.label}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: card.color, margin: 0 }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* ── Two Column: Trade Panel + Positions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, marginBottom: 24 }} className="paper-trade-layout">

        {/* ── Quick Trade Panel ── */}
        <div style={{
          padding: 20, borderRadius: 16,
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            ⚡ Quick Trade
          </h2>

          {/* Symbol Search */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Symbol</label>
            <input
              type="text"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              onFocus={() => symbol.length >= 1 && setShowSearch(true)}
              placeholder="Search NSE stocks..."
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            {showSearch && searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4,
                borderRadius: 10, overflow: 'hidden', maxHeight: 200, overflowY: 'auto',
                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
                {searchResults.map(s => (
                  <button key={s.symbol} onClick={() => selectSymbol(s.symbol)}
                    style={{
                      width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13,
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{ fontWeight: 700 }}>{s.symbol}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Live Price */}
          {livePrice && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 14,
              background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Live Price</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-blue)' }}>
                {loadingPrice ? '...' : `₹${fmt(livePrice)}`}
              </span>
            </div>
          )}

          {/* Side Toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['BUY', 'SELL'] as const).map(s => (
              <button key={s} onClick={() => setSide(s)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, fontWeight: 700, fontSize: 14,
                  cursor: 'pointer', transition: 'all 0.15s ease',
                  background: side === s
                    ? (s === 'BUY' ? 'rgba(16,185,129,0.15)' : 'rgba(255,77,106,0.15)')
                    : 'var(--bg-primary)',
                  color: side === s
                    ? (s === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)')
                    : 'var(--text-muted)',
                  border: `1px solid ${side === s
                    ? (s === 'BUY' ? 'rgba(16,185,129,0.4)' : 'rgba(255,77,106,0.4)')
                    : 'var(--border-color)'}`,
                }}>
                {s === 'BUY' ? '▲ BUY' : '▼ SELL'}
              </button>
            ))}
          </div>

          {/* Qty + Order Type Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Qty</label>
              <input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Type</label>
              <select value={orderType} onChange={e => setOrderType(e.target.value as 'MARKET' | 'LIMIT' | 'SL')}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  outline: 'none', cursor: 'pointer',
                }}>
                <option value="MARKET">Market</option>
                <option value="LIMIT">Limit</option>
                <option value="SL">Stop-Loss</option>
              </select>
            </div>
          </div>

          {/* Limit Price (if needed) */}
          {orderType !== 'MARKET' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                {orderType === 'SL' ? 'Trigger Price' : 'Limit Price'}
              </label>
              <input type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
                placeholder={livePrice ? `₹${fmt(livePrice)}` : '0.00'}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* SL + Target */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Stop-Loss</label>
              <input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)}
                placeholder="Optional"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13,
                  background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Target</label>
              <input type="number" value={target} onChange={e => setTarget(e.target.value)}
                placeholder="Optional"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13,
                  background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Place Order Button */}
          <button onClick={prepareOrder}
            disabled={!symbol || !livePrice || !qty}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 12, fontWeight: 700, fontSize: 15,
              cursor: !symbol || !livePrice ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease', border: 'none',
              background: !symbol || !livePrice
                ? 'rgba(255,255,255,0.05)'
                : side === 'BUY'
                  ? 'linear-gradient(135deg, #10b981, #059669)'
                  : 'linear-gradient(135deg, #ef4444, #dc2626)',
              color: 'white',
              opacity: !symbol || !livePrice ? 0.4 : 1,
            }}>
            {side === 'BUY' ? '🟢 Place BUY Order' : '🔴 Place SELL Order'}
          </button>
        </div>

        {/* ── Open Positions ── */}
        <div style={{
          borderRadius: 16, overflow: 'hidden',
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        }}>
          <div style={{
            padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '1px solid var(--border-color)',
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              📊 Open Positions ({positions.length})
            </h2>
            <button onClick={() => setShowResetConfirm(true)}
              style={{
                fontSize: 10, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,77,106,0.1)', color: 'var(--accent-red)',
                border: '1px solid rgba(255,77,106,0.2)', fontWeight: 700,
              }}>
              Reset Account
            </button>
          </div>

          {positions.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>📭</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No open positions. Place a trade to get started!</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
              <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {['Symbol', 'Qty', 'Avg Price', 'LTP', 'P&L', 'P&L %', 'Action'].map(h => (
                      <th key={h} style={{
                        padding: '10px 14px', fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        color: 'var(--text-muted)', textAlign: h === 'Action' ? 'right' : 'left',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map(pos => (
                    <tr key={pos.symbol} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <Link href={`/stock/${pos.symbol}`} style={{ fontWeight: 700, color: 'var(--accent-blue)', fontSize: 14 }}>
                          {pos.symbol}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{pos.qty}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)' }}>₹{fmt(pos.avgPrice)}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>₹{fmt(pos.currentPrice)}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: pnlColor(pos.unrealizedPnl) }}>
                        {pnlSign(pos.unrealizedPnl)}₹{fmt(Math.abs(pos.unrealizedPnl))}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: pnlColor(pos.unrealizedPnlPercent) }}>
                        {pnlSign(pos.unrealizedPnlPercent)}{pos.unrealizedPnlPercent.toFixed(2)}%
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button onClick={() => closePosition(pos)}
                          style={{
                            fontSize: 11, padding: '6px 14px', borderRadius: 8, fontWeight: 700,
                            cursor: 'pointer', border: 'none', transition: 'all 0.15s ease',
                            background: 'rgba(255,77,106,0.12)', color: 'var(--accent-red)',
                          }}>
                          Close
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Trade Journal ── */}
      <div style={{
        borderRadius: 16, overflow: 'hidden',
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      }}>
        <div style={{
          padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: 10,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            📓 Trade Journal ({state.closedTrades.length})
          </h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'winners', 'losers'] as const).map(f => (
              <button key={f} onClick={() => setJournalFilter(f)}
                style={{
                  fontSize: 11, padding: '4px 12px', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
                  background: journalFilter === f
                    ? (f === 'winners' ? 'rgba(16,185,129,0.15)' : f === 'losers' ? 'rgba(255,77,106,0.15)' : 'rgba(59,130,246,0.15)')
                    : 'var(--bg-primary)',
                  color: journalFilter === f
                    ? (f === 'winners' ? 'var(--accent-green)' : f === 'losers' ? 'var(--accent-red)' : 'var(--accent-blue)')
                    : 'var(--text-muted)',
                  border: `1px solid ${journalFilter === f ? 'rgba(99,102,241,0.3)' : 'var(--border-color)'}`,
                }}>
                {f === 'all' ? 'All' : f === 'winners' ? '✅ Winners' : '❌ Losers'}
              </button>
            ))}
          </div>
        </div>

        {filteredTrades.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>📋</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {state.closedTrades.length === 0
                ? 'No closed trades yet. Close a position to see your P&L here.'
                : `No ${journalFilter} trades found.`}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
            <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {['Symbol', 'Entry', 'Exit', 'Qty', 'P&L', 'P&L %', 'Days', 'Source'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      color: 'var(--text-muted)', textAlign: 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/stock/${t.symbol}`} style={{ fontWeight: 700, color: 'var(--accent-blue)', fontSize: 13 }}>{t.symbol}</Link>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>₹{fmt(t.entryPrice)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>₹{fmt(t.exitPrice)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-primary)' }}>{t.qty}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: pnlColor(t.pnl) }}>
                      {pnlSign(t.pnl)}₹{fmt(Math.abs(t.pnl))}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: pnlColor(t.pnlPercent) }}>
                      {pnlSign(t.pnlPercent)}{t.pnlPercent.toFixed(2)}%
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{t.holdingDays}d</td>
                    <td style={{ padding: '10px 14px' }}>
                      {t.strategyName ? (
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontWeight: 600 }}>
                          {t.strategyName}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Manual</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Running P&L summary */}
        {state.closedTrades.length > 0 && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--border-color)',
            display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
            fontSize: 12,
          }}>
            <span style={{ color: 'var(--text-muted)' }}>
              Total: <strong style={{ color: pnlColor(stats.totalRealizedPnl) }}>{pnlSign(stats.totalRealizedPnl)}₹{fmt(Math.abs(stats.totalRealizedPnl))}</strong>
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              Win Rate: <strong style={{ color: stats.winRate >= 50 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{stats.winRate.toFixed(0)}%</strong>
              {' '}({stats.winners}W / {stats.losers}L)
            </span>
            {stats.riskReward > 0 && (
              <span style={{ color: 'var(--text-muted)' }}>
                Avg R:R: <strong style={{ color: stats.riskReward >= 1 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{stats.riskReward.toFixed(2)}</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Confirmation Modal ── */}
      {showConfirm && pendingOrder && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
        }}
          onClick={() => setShowConfirm(false)}
        >
          <div style={{
            width: '100%', maxWidth: 420, margin: '0 16px', padding: 24, borderRadius: 20,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 16, textAlign: 'center' }}>
              Confirm {pendingOrder.side} Order
            </h3>

            <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
              {[
                ['Symbol', pendingOrder.symbol],
                ['Side', pendingOrder.side],
                ['Type', pendingOrder.orderType],
                ['Qty', `${pendingOrder.qty} shares`],
                ['Price', `₹${fmt(pendingOrder.price)}`],
                ['Order Value', `₹${fmt(orderValue)}`],
                ...(pendingOrder.stopLoss ? [['Stop-Loss', `₹${fmt(pendingOrder.stopLoss)}`]] : []),
                ...(pendingOrder.target ? [['Target', `₹${fmt(pendingOrder.target)}`]] : []),
              ].map(([label, value]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Risk Warning */}
            {riskPercent > 2 && (
              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 16,
                background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                fontSize: 12, color: '#f59e0b', fontWeight: 600,
              }}>
                ⚠️ This trade is {riskPercent.toFixed(1)}% of your capital (above 2% recommended limit)
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <button onClick={() => setShowConfirm(false)}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, fontWeight: 700, fontSize: 14,
                  cursor: 'pointer', background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                }}>
                Cancel
              </button>
              <button onClick={executeOrder}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, fontWeight: 700, fontSize: 14,
                  cursor: 'pointer', border: 'none',
                  background: pendingOrder.side === 'BUY'
                    ? 'linear-gradient(135deg, #10b981, #059669)'
                    : 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: 'white',
                }}>
                Confirm {pendingOrder.side}
              </button>
            </div>

            <p style={{ fontSize: 10, textAlign: 'center', color: 'var(--text-muted)', margin: 0 }}>
              📝 This is a simulated trade — no real money is involved
            </p>
          </div>
        </div>
      )}

      {/* ── Reset Confirmation ── */}
      {showResetConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
        }}
          onClick={() => setShowResetConfirm(false)}
        >
          <div style={{
            width: '100%', maxWidth: 360, margin: '0 16px', padding: 24, borderRadius: 20,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
          }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: 28, textAlign: 'center', marginBottom: 8 }}>⚠️</p>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 8 }}>
              Reset Paper Account?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 20 }}>
              This will clear all positions, orders, and trade history. Starting capital will be reset to ₹10,00,000.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowResetConfirm(false)}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, fontWeight: 700, fontSize: 14,
                  cursor: 'pointer', background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                }}>
                Cancel
              </button>
              <button onClick={handleReset}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, fontWeight: 700, fontSize: 14,
                  cursor: 'pointer', border: 'none',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white',
                }}>
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Disclaimer ── */}
      <div style={{
        marginTop: 24, padding: '12px 16px', borderRadius: 12,
        background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.15)',
        color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.6,
      }}>
        <strong style={{ color: '#f59e0b' }}>📝 Paper Trading Disclaimer:</strong>{' '}
        All trades are simulated using live Yahoo Finance prices. No real money is involved.
        Results may not reflect actual trading outcomes due to slippage, liquidity, and fees not being modeled.
      </div>
    </div>
  );
}
