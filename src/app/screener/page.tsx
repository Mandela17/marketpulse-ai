'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Search,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  ArrowUpDown,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface ScreenerStock {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  rsi: number | null;
  prediction?: {
    direction: 'bullish' | 'bearish' | 'neutral';
    probability: number;
    confidenceLevel: string;
    supportingSignals?: string[];
  } | null;
}

interface ScreenerStats {
  bullishCount: number;
  bearishCount: number;
  gainersCount: number;
  losersCount: number;
}

type FilterType =
  | 'all'
  | 'bullish'
  | 'bearish'
  | 'gainers'
  | 'losers'
  | 'high-confidence'
  | 'oversold'
  | 'overbought';

type SortField = 'changePercent' | 'probability' | 'price' | 'rsi' | 'symbol';
type SortOrder = 'asc' | 'desc';

export default function ScreenerPage() {
  const [stocks, setStocks] = useState<ScreenerStock[]>([]);
  const [stats, setStats] = useState<ScreenerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('changePercent');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchScreenerData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/screener${isRefresh ? '?refresh=true' : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.stocks && Array.isArray(data.stocks)) {
        setStocks(data.stocks);
        if (data.stats) setStats(data.stats);
        if (data.timestamp) {
          const d = new Date(data.timestamp);
          setLastUpdated(d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }
      } else {
        throw new Error('Invalid response structure');
      }
    } catch (err: any) {
      console.error('Failed to load stock screener:', err);
      setError('Unable to load screener data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchScreenerData();
  }, [fetchScreenerData]);

  // Extract unique sectors
  const sectors = useMemo(() => {
    const set = new Set<string>();
    for (const s of stocks) {
      if (s.sector) set.add(s.sector);
    }
    return ['all', ...Array.from(set).sort()];
  }, [stocks]);

  // Toggle sort order or field
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'symbol' ? 'asc' : 'desc');
    }
  };

  // Filter & Sort stocks
  const filteredStocks = useMemo(() => {
    let result = stocks.filter(s => {
      // Search by symbol or company name
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesSymbol = s.symbol.toLowerCase().includes(q);
        const matchesName = s.name.toLowerCase().includes(q);
        if (!matchesSymbol && !matchesName) return false;
      }

      // Sector filter
      if (selectedSector !== 'all' && s.sector?.toLowerCase() !== selectedSector.toLowerCase()) {
        return false;
      }

      // Quick category filters
      switch (filter) {
        case 'bullish':
          return s.prediction?.direction === 'bullish';
        case 'bearish':
          return s.prediction?.direction === 'bearish';
        case 'gainers':
          return s.changePercent > 0;
        case 'losers':
          return s.changePercent < 0;
        case 'high-confidence':
          return (s.prediction?.probability || 0) >= 65;
        case 'oversold':
          return s.rsi !== null && s.rsi < 40;
        case 'overbought':
          return s.rsi !== null && s.rsi > 65;
        default:
          return true;
      }
    });

    // Sort
    result.sort((a, b) => {
      let valA: any = a[sortField as keyof ScreenerStock];
      let valB: any = b[sortField as keyof ScreenerStock];

      if (sortField === 'probability') {
        valA = a.prediction?.probability || 0;
        valB = b.prediction?.probability || 0;
      } else if (sortField === 'rsi') {
        valA = a.rsi ?? (sortOrder === 'asc' ? 999 : -1);
        valB = b.rsi ?? (sortOrder === 'asc' ? 999 : -1);
      }

      if (typeof valA === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      return sortOrder === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
    });

    return result;
  }, [stocks, search, selectedSector, filter, sortField, sortOrder]);

  const filterButtons: { key: FilterType; label: string; icon: string; count?: number }[] = [
    { key: 'all', label: 'All Stocks', icon: '📋', count: stocks.length },
    { key: 'bullish', label: 'AI Bullish', icon: '🟢', count: stats?.bullishCount },
    { key: 'bearish', label: 'AI Bearish', icon: '🔴', count: stats?.bearishCount },
    { key: 'gainers', label: 'Top Gainers', icon: '📈', count: stats?.gainersCount },
    { key: 'losers', label: 'Top Losers', icon: '📉', count: stats?.losersCount },
    { key: 'high-confidence', label: 'High Conviction', icon: '🎯' },
    { key: 'oversold', label: 'RSI Oversold (<40)', icon: '⚡' },
    { key: 'overbought', label: 'RSI Overbought (>65)', icon: '🔥' },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
            <span>🔎</span> Stock Screener
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Real-time scanner filtering liquid NSE stocks by ML predictions, price momentum & technical RSI.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {lastUpdated && (
            <span className="text-xs px-2.5 py-1 rounded-md" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
              Updated {lastUpdated}
            </span>
          )}
          <button
            onClick={() => fetchScreenerData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:brightness-125"
            style={{
              background: 'rgba(59,130,246,0.15)',
              color: '#60a5fa',
              border: '1px solid rgba(59,130,246,0.3)',
            }}
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Scanning...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      {!loading && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 animate-fade-in-up">
          <div className="p-3.5 rounded-xl flex items-center justify-between"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Universe</p>
              <p className="text-lg font-bold text-white mt-0.5">{stocks.length} Stocks</p>
            </div>
            <Activity size={20} style={{ color: '#60a5fa' }} />
          </div>

          <div className="p-3.5 rounded-xl flex items-center justify-between"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>AI Bullish</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: '#00d68f' }}>{stats.bullishCount}</p>
            </div>
            <TrendingUp size={20} style={{ color: '#00d68f' }} />
          </div>

          <div className="p-3.5 rounded-xl flex items-center justify-between"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>AI Bearish</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: '#ff4d6a' }}>{stats.bearishCount}</p>
            </div>
            <TrendingDown size={20} style={{ color: '#ff4d6a' }} />
          </div>

          <div className="p-3.5 rounded-xl flex items-center justify-between"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Gainers / Losers</p>
              <p className="text-lg font-bold mt-0.5 text-white">
                <span style={{ color: '#00d68f' }}>{stats.gainersCount}</span> / <span style={{ color: '#ff4d6a' }}>{stats.losersCount}</span>
              </p>
            </div>
            <SlidersHorizontal size={20} style={{ color: '#a78bfa' }} />
          </div>
        </div>
      )}

      {/* Search, Sector, and Filter Controls */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Bar */}
          <div
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl flex-1 transition-all"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by symbol or company name (e.g. RELIANCE, Tata, HDFC)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none text-sm w-full text-white placeholder:text-gray-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-xs text-gray-400 hover:text-white px-1.5 py-0.5 rounded cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sector Filter Dropdown */}
          <div className="relative min-w-[180px]">
            <select
              value={selectedSector}
              onChange={e => setSelectedSector(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl text-sm appearance-none cursor-pointer outline-none font-medium text-white"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
              }}
            >
              <option value="all" className="bg-gray-900">All Sectors ({sectors.length - 1})</option>
              {sectors.filter(s => s !== 'all').map(sec => (
                <option key={sec} value={sec} className="bg-gray-900">
                  {sec.charAt(0).toUpperCase() + sec.slice(1)}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3.5 top-3.5 pointer-events-none text-gray-400" />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {filterButtons.map(f => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0 cursor-pointer transition-all flex items-center gap-1.5"
                style={{
                  background: active ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.03)',
                  color: active ? '#60a5fa' : 'var(--text-muted)',
                  border: `1px solid ${active ? 'rgba(59,130,246,0.35)' : 'var(--border-subtle)'}`,
                }}
              >
                <span>{f.icon}</span>
                <span>{f.label}</span>
                {f.count !== undefined && (
                  <span
                    className="text-[10px] px-1.5 py-0.2 rounded-full ml-0.5"
                    style={{ background: active ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)' }}
                  >
                    {f.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results Header Count */}
      <div className="flex items-center justify-between text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        <p>
          Showing <span className="text-white font-semibold">{filteredStocks.length}</span> of {stocks.length} stocks
        </p>
        <p className="hidden sm:block">Click column headers to sort</p>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="p-4 rounded-xl mb-4 flex items-center justify-between"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <p className="text-xs text-red-400">{error}</p>
          <button onClick={() => fetchScreenerData(true)} className="text-xs text-white underline cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div
          className="rounded-xl overflow-hidden shadow-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <div className="p-8 text-center">
            <div
              className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }}
            />
            <p className="text-sm font-semibold text-white">Scanning market universe...</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Compiling real-time quotes, technicals & AI predictions for top liquid stocks.
            </p>
          </div>
          <div className="divide-y divide-[var(--border-subtle)] opacity-40">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="px-4 py-3.5 flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-4 bg-gray-700 rounded" />
                  <div className="w-24 h-4 bg-gray-700 rounded" />
                </div>
                <div className="w-20 h-4 bg-gray-700 rounded" />
                <div className="w-16 h-4 bg-gray-700 rounded" />
                <div className="w-20 h-4 bg-gray-700 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table Results */}
      {!loading && filteredStocks.length > 0 && (
        <div
          className="rounded-xl overflow-hidden shadow-xl animate-fade-in-up"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th className="px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
                    #
                  </th>
                  <th
                    onClick={() => handleSort('symbol')}
                    className="px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold cursor-pointer hover:text-white"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Stock</span>
                      <ArrowUpDown size={10} />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('price')}
                    className="px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold text-right cursor-pointer hover:text-white"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Price (CMP)</span>
                      <ArrowUpDown size={10} />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('changePercent')}
                    className="px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold text-right cursor-pointer hover:text-white"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>24h Change</span>
                      <ArrowUpDown size={10} />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('probability')}
                    className="px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold text-center cursor-pointer hover:text-white"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>AI Signal & Conviction</span>
                      <ArrowUpDown size={10} />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('rsi')}
                    className="px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold text-center hidden md:table-cell cursor-pointer hover:text-white"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>RSI (14)</span>
                      <ArrowUpDown size={10} />
                    </div>
                  </th>
                  <th className="px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold text-right" style={{ color: 'var(--text-muted)' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredStocks.map((stock, i) => {
                  const isUp = stock.changePercent >= 0;
                  const pred = stock.prediction;
                  const isBullish = pred?.direction === 'bullish';
                  const isBearish = pred?.direction === 'bearish';
                  const prob = pred?.probability || 0;

                  const confColor =
                    prob >= 70 ? '#00d68f' :
                    prob >= 60 ? '#fbbf24' : '#94a3b8';

                  // RSI status
                  let rsiColor = '#94a3b8';
                  let rsiTag = null;
                  if (stock.rsi !== null) {
                    if (stock.rsi <= 35) {
                      rsiColor = '#00d68f';
                      rsiTag = 'Oversold';
                    } else if (stock.rsi >= 70) {
                      rsiColor = '#ff4d6a';
                      rsiTag = 'Overbought';
                    }
                  }

                  return (
                    <tr
                      key={stock.symbol}
                      className="transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3.5">
                        <span className="text-[11px] font-mono text-gray-500">{i + 1}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/stock/${stock.symbol}`}
                              className="text-sm font-bold hover:underline"
                              style={{ color: '#60a5fa' }}
                            >
                              {stock.symbol}
                            </Link>
                            {stock.sector && (
                              <span
                                className="text-[9px] uppercase px-1.5 py-0.5 rounded font-semibold"
                                style={{
                                  background: 'rgba(255,255,255,0.05)',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {stock.sector}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] truncate max-w-[180px] sm:max-w-[240px]" style={{ color: 'var(--text-muted)' }}>
                            {stock.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-white text-sm">
                        ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs font-bold">
                        <span style={{ color: isUp ? '#00d68f' : '#ff4d6a' }}>
                          {isUp ? '+' : ''}{stock.changePercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {pred ? (
                          <div className="flex flex-col items-center gap-1">
                            <span
                              className="text-[10px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1"
                              style={{
                                background: isBullish
                                  ? 'rgba(0,214,143,0.12)'
                                  : isBearish
                                  ? 'rgba(255,77,106,0.12)'
                                  : 'rgba(251,191,36,0.12)',
                                color: isBullish
                                  ? '#00d68f'
                                  : isBearish
                                  ? '#ff4d6a'
                                  : '#fbbf24',
                              }}
                            >
                              {isBullish ? '▲ BULLISH' : isBearish ? '▼ BEARISH' : '◆ NEUTRAL'}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <div
                                className="w-12 h-1.5 rounded-full overflow-hidden"
                                style={{ background: 'rgba(255,255,255,0.06)' }}
                              >
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${prob}%`, background: confColor }}
                                />
                              </div>
                              <span className="text-[10px] font-mono font-bold" style={{ color: confColor }}>
                                {prob}%
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center hidden md:table-cell">
                        {stock.rsi !== null ? (
                          <div className="flex flex-col items-center">
                            <span className="text-xs font-mono font-bold" style={{ color: rsiColor }}>
                              {stock.rsi}
                            </span>
                            {rsiTag && (
                              <span className="text-[9px] font-semibold" style={{ color: rsiColor }}>
                                {rsiTag}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/stock/${stock.symbol}`}
                          className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-bold transition-all hover:brightness-125"
                          style={{
                            background: 'rgba(59,130,246,0.12)',
                            color: '#60a5fa',
                            border: '1px solid rgba(59,130,246,0.2)',
                          }}
                        >
                          Analyze
                          <ExternalLink size={10} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredStocks.length === 0 && (
        <div
          className="text-center py-16 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <p className="text-3xl mb-2">🔎</p>
          <p className="text-sm text-white font-bold">No stocks match your filter</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Try adjusting your search query, sector, or selected filter category.
          </p>
          <button
            onClick={() => {
              setSearch('');
              setFilter('all');
              setSelectedSector('all');
            }}
            className="mt-4 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }}
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}
