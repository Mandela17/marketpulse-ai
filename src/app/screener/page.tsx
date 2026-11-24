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
  Clock,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import {
  loadScreenerCache,
  saveScreenerCache,
  formatScanTimestamp,
  formatTimeAgo,
  type ScreenerCachedItem,
  type ScreenerStats,
} from '@/lib/screenerCache';

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
  // Synchronous initial cache hydration for instant (0ms) render
  const initialCache = typeof window !== 'undefined' ? loadScreenerCache() : null;

  const [stocks, setStocks] = useState<ScreenerCachedItem[]>(initialCache?.stocks ?? []);
  const [stats, setStats] = useState<ScreenerStats | null>(initialCache?.stats ?? null);
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(initialCache?.timestamp ?? null);
  const [isCachedView, setIsCachedView] = useState<boolean>(!!initialCache);
  const [timeAgoText, setTimeAgoText] = useState<string>(
    initialCache?.timestamp ? formatTimeAgo(initialCache.timestamp) : ''
  );
  const [loading, setLoading] = useState<boolean>(!initialCache);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [justUpdated, setJustUpdated] = useState<boolean>(false);

  // Filters and sorting state
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('changePercent');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [error, setError] = useState<string | null>(null);

  // Update the relative time-ago string every 30 seconds
  useEffect(() => {
    if (!cacheTimestamp) return;
    const interval = setInterval(() => {
      setTimeAgoText(formatTimeAgo(cacheTimestamp));
    }, 30000);
    return () => clearInterval(interval);
  }, [cacheTimestamp]);

  // Fetch data from API
  const fetchScreenerData = useCallback(async (isUserInitiated = false) => {
    if (isUserInitiated) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetch(`/api/screener${isUserInitiated ? '?refresh=true' : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.stocks && Array.isArray(data.stocks)) {
        const now = Date.now();
        setStocks(data.stocks);
        if (data.stats) setStats(data.stats);
        setCacheTimestamp(now);
        setTimeAgoText(formatTimeAgo(now));
        setIsCachedView(false);

        // Save to localStorage for instant subsequent loads
        saveScreenerCache(data.stocks, data.stats, now);

        if (isUserInitiated) {
          setJustUpdated(true);
          setTimeout(() => setJustUpdated(false), 3000);
        }
      } else {
        throw new Error('Invalid response structure');
      }
    } catch (err: any) {
      console.error('Failed to load stock screener:', err);
      setError('Unable to fetch live market data. Using cached scan if available.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-fetch if no cache exists OR if the cached data lacks predictions (migration self-heal)
  useEffect(() => {
    const cacheNeedsRefresh = !initialCache || initialCache.stocks.length === 0 || initialCache.stocks.every(s => !s.prediction);
    if (cacheNeedsRefresh) {
      fetchScreenerData(false);
    }
  }, [initialCache, fetchScreenerData]);

  // Dynamically compute exact counts for ALL filters directly from current stocks
  const filterCounts = useMemo(() => {
    return {
      all: stocks.length,
      bullish: stocks.filter(s => s.prediction?.direction === 'bullish').length,
      bearish: stocks.filter(s => s.prediction?.direction === 'bearish').length,
      gainers: stocks.filter(s => s.changePercent > 0).length,
      losers: stocks.filter(s => s.changePercent < 0).length,
      highConfidence: stocks.filter(s => (s.prediction?.probability || 0) >= 65).length,
      oversold: stocks.filter(s => s.rsi !== null && s.rsi < 40).length,
      overbought: stocks.filter(s => s.rsi !== null && s.rsi > 65).length,
    };
  }, [stocks]);

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
      let valA: any = a[sortField as keyof ScreenerCachedItem];
      let valB: any = b[sortField as keyof ScreenerCachedItem];

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

  const filterButtons: { key: FilterType; label: string; icon: string; count: number }[] = [
    { key: 'all', label: 'All Stocks', icon: '📋', count: filterCounts.all },
    { key: 'bullish', label: 'AI Bullish', icon: '🟢', count: filterCounts.bullish },
    { key: 'bearish', label: 'AI Bearish', icon: '🔴', count: filterCounts.bearish },
    { key: 'gainers', label: 'Top Gainers', icon: '📈', count: filterCounts.gainers },
    { key: 'losers', label: 'Top Losers', icon: '📉', count: filterCounts.losers },
    { key: 'high-confidence', label: 'High Conviction', icon: '🎯', count: filterCounts.highConfidence },
    { key: 'oversold', label: 'RSI Oversold (<40)', icon: '⚡', count: filterCounts.oversold },
    { key: 'overbought', label: 'RSI Overbought (>65)', icon: '🔥', count: filterCounts.overbought },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
            <span>🔎</span> Stock Screener
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Filter liquid NSE stocks by ML predictions, price momentum & technical RSI.
          </p>
        </div>

        {/* Timestamp and User Option to Fetch Again */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {cacheTimestamp && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border-subtle)',
              }}
              title={`Exact scan time: ${formatScanTimestamp(cacheTimestamp)}`}
            >
              <Clock size={12} style={{ color: isCachedView ? '#fbbf24' : '#00d68f' }} />
              <span style={{ color: 'var(--text-muted)' }}>
                {isCachedView ? 'Cached:' : 'Updated:'}
              </span>
              <span className="text-white font-semibold">
                {formatScanTimestamp(cacheTimestamp)}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-medium"
                style={{
                  background: isCachedView ? 'rgba(251,191,36,0.12)' : 'rgba(0,214,143,0.12)',
                  color: isCachedView ? '#fbbf24' : '#00d68f',
                }}
              >
                {timeAgoText || 'Just now'}
              </span>
            </div>
          )}

          <button
            onClick={() => fetchScreenerData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md hover:brightness-125 disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(59,130,246,0.12))',
              color: '#60a5fa',
              border: '1px solid rgba(59,130,246,0.4)',
            }}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Scanning Market...' : 'Fetch Fresh Data'}</span>
          </button>
        </div>
      </div>

      {/* Instant Cache Status Alert Banner */}
      {isCachedView && !justUpdated && stocks.length > 0 && (
        <div
          className="mb-5 px-4 py-2.5 rounded-xl flex items-center justify-between gap-3 text-xs animate-fade-in-up"
          style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.03))',
            border: '1px solid rgba(59,130,246,0.2)',
          }}
        >
          <div className="flex items-center gap-2 text-gray-300">
            <Zap size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />
            <span>
              Loaded instantly from local cache <span className="text-white font-semibold">({timeAgoText || 'recently'})</span>. Want updated live quotes or AI signals?
            </span>
          </div>
          <button
            onClick={() => fetchScreenerData(true)}
            disabled={refreshing}
            className="text-xs font-bold px-2.5 py-1 rounded-lg text-blue-400 hover:text-white underline cursor-pointer shrink-0"
          >
            {refreshing ? 'Scanning...' : 'Re-scan now →'}
          </button>
        </div>
      )}

      {/* Just Updated Confirmation Toast */}
      {justUpdated && (
        <div
          className="mb-5 px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs animate-fade-in-up"
          style={{
            background: 'rgba(0,214,143,0.1)',
            border: '1px solid rgba(0,214,143,0.3)',
            color: '#00d68f',
          }}
        >
          <CheckCircle2 size={14} />
          <span className="font-semibold">
            Fresh market scan complete! Cached locally for instant next load.
          </span>
        </div>
      )}

      {/* Summary KPI Badges */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 animate-fade-in-up">
          <div className="p-3.5 rounded-xl flex items-center justify-between"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Universe</p>
              <p className="text-lg font-bold text-white mt-0.5">{filterCounts.all} Stocks</p>
            </div>
            <Activity size={20} style={{ color: '#60a5fa' }} />
          </div>

          <div className="p-3.5 rounded-xl flex items-center justify-between"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>AI Bullish</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: '#00d68f' }}>{filterCounts.bullish}</p>
            </div>
            <TrendingUp size={20} style={{ color: '#00d68f' }} />
          </div>

          <div className="p-3.5 rounded-xl flex items-center justify-between"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>AI Bearish</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: '#ff4d6a' }}>{filterCounts.bearish}</p>
            </div>
            <TrendingDown size={20} style={{ color: '#ff4d6a' }} />
          </div>

          <div className="p-3.5 rounded-xl flex items-center justify-between"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Gainers / Losers</p>
              <p className="text-lg font-bold mt-0.5 text-white">
                <span style={{ color: '#00d68f' }}>{filterCounts.gainers}</span> / <span style={{ color: '#ff4d6a' }}>{filterCounts.losers}</span>
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

        {/* Filter Pills with Live Accurate Badge Counts */}
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
                <span
                  className="text-[10px] px-1.5 py-0.2 rounded-full ml-0.5 font-mono"
                  style={{
                    background: active ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)',
                    color: active ? '#93c5fd' : '#cbd5e1',
                  }}
                >
                  {f.count}
                </span>
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
                  const prob = pred?.probability || 50;

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
