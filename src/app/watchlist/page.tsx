'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  RefreshCw,
  Clock,
  Zap,
  CheckCircle2,
  Plus,
  Download,
  LayoutList,
  LayoutGrid,
  ArrowUpDown,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  X,
} from 'lucide-react';
import { ALL_STOCKS, searchStocks, getStockBySymbol } from '@/lib/sectorData';
import { getBrokerConfig } from '@/lib/brokerApi';
import { isMarketOpenNow } from '@/lib/marketHolidays';
import { useAuth } from '@/context/AuthContext';
import {
  loadWatchlistCache,
  saveWatchlistCache,
  formatScanTimestamp,
  formatTimeAgo,
  type WatchlistStockData,
} from '@/lib/watchlistCache';

type FilterType = 'all' | 'gainers' | 'losers' | 'bullish' | 'bearish' | 'oversold' | 'overbought';
type SortField = 'default' | 'changePercent' | 'price' | 'probability' | 'rsi' | 'volume';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'table' | 'cards';

const SECTOR_ICONS: Record<string, string> = {
  energy: '⛽',
  power: '⚡',
  auto: '🚗',
  gold: '🥇',
  ev: '🔋',
  banking: '🏦',
  it: '💻',
  pharma: '💊',
  defense: '🛡️',
  metals: '⛏️',
  fmcg: '🛒',
  realestate: '🏗️',
  aviation: '✈️',
  general: '📈',
};

const POPULAR_SUGGESTIONS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries' },
  { symbol: 'TMCV', name: 'Tata Motors CV' },
  { symbol: 'INDIGO', name: 'IndiGo Aviation' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank' },
  { symbol: 'TCS', name: 'TCS' },
  { symbol: 'HAL', name: 'Hindustan Aeronautics' },
  { symbol: 'ZOMATO', name: 'Zomato / Eternal' },
  { symbol: 'SBIN', name: 'State Bank of India' },
];

function formatVolumeShort(vol: number): string {
  if (vol >= 10000000) return `${(vol / 10000000).toFixed(2)} Cr`;
  if (vol >= 100000) return `${(vol / 100000).toFixed(1)} L`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)} K`;
  return String(vol || 0);
}

export default function WatchlistPage() {
  const { watchlist, toggleWatchlist, setWatchlist } = useAuth();

  // Cached quote map keyed by symbol
  const [quoteMap, setQuoteMap] = useState<Record<string, WatchlistStockData>>({});
  const [source, setSource] = useState<'upstox' | 'yahoo' | 'mixed'>('upstox');
  const [fetchMs, setFetchMs] = useState<number | null>(null);

  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(null);
  const [isCachedView, setIsCachedView] = useState<boolean>(false);
  const [timeAgoText, setTimeAgoText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [justUpdated, setJustUpdated] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hydratedCache, setHydratedCache] = useState<boolean>(false);

  // Add stock search state
  const [addQuery, setAddQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string; sector: string }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedDropdownIdx, setSelectedDropdownIdx] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Local view/filter/sort state
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [localSearch, setLocalSearch] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('default');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Batch fetch quotes for a list of symbols and merge into state + localStorage cache
  const fetchWatchlistBatch = useCallback(
    async (targetSymbols: string[], options: { isUserRefresh?: boolean; mergeExisting?: boolean } = {}) => {
      if (targetSymbols.length === 0) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const { isUserRefresh = false, mergeExisting = false } = options;
      if (isUserRefresh) {
        setRefreshing(true);
      } else if (!mergeExisting) {
        setLoading(true);
      }
      setError(null);

      try {
        const brokerConfig = getBrokerConfig();
        const headers: Record<string, string> = {};
        if (brokerConfig.provider === 'upstox' && brokerConfig.connected && brokerConfig.accessToken) {
          headers['X-Upstox-Token'] = brokerConfig.accessToken;
        }

        const qs = encodeURIComponent(targetSymbols.join(','));
        const res = await fetch(`/api/watchlist?symbols=${qs}${isUserRefresh ? '&refresh=true' : ''}`, {
          headers,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const returned: WatchlistStockData[] = Array.isArray(data.stocks) ? data.stocks : [];
        const src: 'upstox' | 'yahoo' | 'mixed' = data.source || 'upstox';
        const now = Date.now();

        setQuoteMap((prev) => {
          const next = mergeExisting ? { ...prev } : {};
          for (const item of returned) {
            next[item.symbol] = item;
          }
          saveWatchlistCache(next, src, now);
          return next;
        });

        setSource(src);
        setFetchMs(data.fetchMs ?? null);
        setCacheTimestamp(now);
        setTimeAgoText(formatTimeAgo(now));
        setIsCachedView(false);

        if (isUserRefresh) {
          setJustUpdated(true);
          setTimeout(() => setJustUpdated(false), 3000);
        }
      } catch (err: any) {
        console.error('[Watchlist] Batch fetch failed:', err);
        setError('Unable to fetch live watchlist quotes right now. Showing cached data if available.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  // Hydrate cache synchronously on mount (no SSR hydration mismatch)
  useEffect(() => {
    const cached = loadWatchlistCache();
    if (cached && Object.keys(cached.items).length > 0) {
      setQuoteMap(cached.items);
      setSource(cached.source);
      setCacheTimestamp(cached.timestamp);
      setTimeAgoText(formatTimeAgo(cached.timestamp));
      setIsCachedView(true);
      setLoading(false);
    }
    setHydratedCache(true);
  }, []);

  // Once hydrated, fetch ONLY symbols missing from quoteMap (handles first visit & newly added stocks!)
  useEffect(() => {
    if (!hydratedCache) return;
    if (watchlist.length === 0) {
      setLoading(false);
      return;
    }

    const missing = watchlist.filter((sym) => !quoteMap[sym]);
    if (missing.length > 0) {
      const hasAnyCached = Object.keys(quoteMap).length > 0;
      fetchWatchlistBatch(missing, { mergeExisting: hasAnyCached });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydratedCache, watchlist]);

  // Update relative time-ago text every 30s
  useEffect(() => {
    if (!cacheTimestamp) return;
    const id = setInterval(() => setTimeAgoText(formatTimeAgo(cacheTimestamp)), 30000);
    return () => clearInterval(id);
  }, [cacheTimestamp]);

  // Optional auto-refresh during NSE market hours
  useEffect(() => {
    if (!autoRefresh || watchlist.length === 0) return;
    if (!isMarketOpenNow()) return;
    const id = setInterval(() => fetchWatchlistBatch(watchlist, { isUserRefresh: true }), 60 * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, watchlist, fetchWatchlistBatch]);

  // Outside click to close Add dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live Add-Stock autocomplete across 3,300+ NSE tickers
  useEffect(() => {
    const q = addQuery.trim();
    if (!q) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const results = searchStocks(q).filter((s) => !watchlist.includes(s.symbol));
    const cleanQ = q.toUpperCase();
    const existsInWatchlist = watchlist.includes(cleanQ);
    const existsInAll = ALL_STOCKS.some((s) => s.symbol === cleanQ);
    const existsInResults = results.some((r) => r.symbol === cleanQ);

    const listToShow = [...results];
    if (cleanQ.length >= 2 && !existsInWatchlist && !existsInAll && !existsInResults) {
      listToShow.push({
        symbol: cleanQ,
        name: `Add "${cleanQ}" to watchlist`,
        sector: 'general',
      });
    }

    setSearchResults(listToShow);
    setSelectedDropdownIdx(0);
    setShowDropdown(true);
  }, [addQuery, watchlist]);

  const addStock = (symbol: string) => {
    const cleanSymbol = symbol.toUpperCase().trim();
    if (!cleanSymbol) return;
    if (!watchlist.includes(cleanSymbol)) {
      toggleWatchlist(cleanSymbol);
    }
    setAddQuery('');
    setShowDropdown(false);
  };

  const removeStock = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleWatchlist(symbol);
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown && searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedDropdownIdx((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedDropdownIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults[selectedDropdownIdx]) {
        addStock(searchResults[selectedDropdownIdx].symbol);
      } else if (addQuery.trim().length >= 2) {
        addStock(addQuery.trim());
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  // Build unified row objects for all watchlist symbols
  const enrichedRows = useMemo(() => {
    return watchlist.map((symbol, idx) => {
      const meta = getStockBySymbol(symbol);
      const q = quoteMap[symbol];
      return {
        index: idx,
        symbol,
        name: q?.name || meta?.name || symbol,
        sector: q?.sector || meta?.sector || 'general',
        data: q || null,
      };
    });
  }, [watchlist, quoteMap]);

  // Dynamic filter counts
  const filterCounts = useMemo(() => {
    const loaded = enrichedRows.filter((r) => r.data !== null);
    return {
      all: enrichedRows.length,
      gainers: loaded.filter((r) => r.data!.changePercent > 0.05).length,
      losers: loaded.filter((r) => r.data!.changePercent < -0.05).length,
      bullish: loaded.filter((r) => r.data!.prediction?.direction === 'bullish').length,
      bearish: loaded.filter((r) => r.data!.prediction?.direction === 'bearish').length,
      oversold: loaded.filter((r) => r.data!.rsi !== null && r.data!.rsi < 40).length,
      overbought: loaded.filter((r) => r.data!.rsi !== null && r.data!.rsi > 65).length,
      loadedCount: loaded.length,
    };
  }, [enrichedRows]);

  const sectorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of enrichedRows) {
      if (r.sector) set.add(r.sector);
    }
    return ['all', ...Array.from(set).sort()];
  }, [enrichedRows]);

  const handleSort = (field: SortField) => {
    if (field === 'default') {
      setSortField('default');
      return;
    }
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Filtered + Sorted list
  const visibleRows = useMemo(() => {
    const q = localSearch.trim().toLowerCase();
    const list = enrichedRows.filter((row) => {
      if (q) {
        const match =
          row.symbol.toLowerCase().includes(q) ||
          row.name.toLowerCase().includes(q) ||
          row.sector.toLowerCase().includes(q);
        if (!match) return false;
      }

      if (selectedSector !== 'all' && row.sector.toLowerCase() !== selectedSector.toLowerCase()) {
        return false;
      }

      const d = row.data;
      switch (filter) {
        case 'gainers':
          return !!d && d.changePercent > 0.05;
        case 'losers':
          return !!d && d.changePercent < -0.05;
        case 'bullish':
          return d?.prediction?.direction === 'bullish';
        case 'bearish':
          return d?.prediction?.direction === 'bearish';
        case 'oversold':
          return d?.rsi != null && d.rsi < 40;
        case 'overbought':
          return d?.rsi != null && d.rsi > 65;
        default:
          return true;
      }
    });

    if (sortField === 'default') return list;

    return [...list].sort((a, b) => {
      const da = a.data;
      const db = b.data;
      let valA = 0;
      let valB = 0;

      if (sortField === 'price') {
        valA = da?.price ?? 0;
        valB = db?.price ?? 0;
      } else if (sortField === 'changePercent') {
        valA = da?.changePercent ?? -999;
        valB = db?.changePercent ?? -999;
      } else if (sortField === 'probability') {
        valA = da?.prediction?.probability ?? 0;
        valB = db?.prediction?.probability ?? 0;
      } else if (sortField === 'rsi') {
        valA = da?.rsi ?? (sortOrder === 'asc' ? 999 : -1);
        valB = db?.rsi ?? (sortOrder === 'asc' ? 999 : -1);
      } else if (sortField === 'volume') {
        valA = da?.volume ?? 0;
        valB = db?.volume ?? 0;
      }

      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }, [enrichedRows, localSearch, selectedSector, filter, sortField, sortOrder]);

  // Summary metrics
  const summary = useMemo(() => {
    const loaded = enrichedRows.map((r) => r.data).filter((d): d is WatchlistStockData => d !== null);
    if (loaded.length === 0) return null;

    const avgChange = loaded.reduce((s, d) => s + d.changePercent, 0) / loaded.length;
    const sortedByChange = [...loaded].sort((a, b) => b.changePercent - a.changePercent);
    const bullish = loaded.filter((d) => d.prediction?.direction === 'bullish').length;
    const bearish = loaded.filter((d) => d.prediction?.direction === 'bearish').length;

    return {
      avgChange,
      topGainer: sortedByChange[0],
      topLoser: sortedByChange[sortedByChange.length - 1],
      bullish,
      bearish,
      loadedCount: loaded.length,
    };
  }, [enrichedRows]);

  const exportCSV = () => {
    if (enrichedRows.length === 0) return;
    const headers = ['Symbol', 'Name', 'Sector', 'Price', 'Change', 'Change %', 'Volume', 'RSI', 'AI Signal', 'AI Confidence %'];
    const rows = enrichedRows.map((r) => [
      r.symbol,
      `"${r.name}"`,
      r.sector,
      r.data?.price?.toFixed(2) ?? '',
      r.data?.change?.toFixed(2) ?? '',
      r.data?.changePercent?.toFixed(2) ?? '',
      r.data?.volume ?? '',
      r.data?.rsi ?? '',
      r.data?.prediction?.direction?.toUpperCase() ?? '',
      r.data?.prediction?.probability ?? '',
    ]);
    const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csv));
    link.setAttribute('download', `marketpulse_watchlist_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filterButtons: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: filterCounts.all },
    { key: 'gainers', label: 'Gainers', count: filterCounts.gainers },
    { key: 'losers', label: 'Losers', count: filterCounts.losers },
    { key: 'bullish', label: 'AI Bullish', count: filterCounts.bullish },
    { key: 'bearish', label: 'AI Bearish', count: filterCounts.bearish },
    { key: 'oversold', label: 'RSI < 40', count: filterCounts.oversold },
    { key: 'overbought', label: 'RSI > 65', count: filterCounts.overbought },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* ─── Header & Add Stock Search ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">⭐ My Watchlist</h1>
            {!loading && Object.keys(quoteMap).length > 0 && (
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                  source === 'upstox'
                    ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                    : 'bg-slate-700/50 text-slate-300 border border-slate-600/30'
                }`}
              >
                {source === 'upstox'
                  ? '🟢 UPSTOX LIVE'
                  : source === 'mixed'
                    ? '🟢 UPSTOX + YAHOO'
                    : '📊 Yahoo Finance'}
              </span>
            )}
            {fetchMs !== null && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}
              >
                {fetchMs}ms batch
              </span>
            )}
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Live prices, day range, RSI &amp; AI signals for your tracked stocks
          </p>
        </div>

        {/* Timestamp & Refetch Bar + Export */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {cacheTimestamp && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border-subtle)',
              }}
              title={`Exact fetch time: ${formatScanTimestamp(cacheTimestamp)}`}
            >
              <Clock size={12} style={{ color: isCachedView ? '#fbbf24' : '#00d68f' }} />
              <span style={{ color: 'var(--text-muted)' }}>{isCachedView ? 'Cached:' : 'Updated:'}</span>
              <span className="text-white font-semibold">{formatScanTimestamp(cacheTimestamp)}</span>
              <span
                className="text-[10px] px-1.5 py-0.2 rounded font-medium"
                style={{
                  background: isCachedView ? 'rgba(251,191,36,0.12)' : 'rgba(0,214,143,0.12)',
                  color: isCachedView ? '#fbbf24' : '#00d68f',
                }}
              >
                {timeAgoText || 'Just now'}
              </span>
            </div>
          )}

          {watchlist.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setAutoRefresh((v) => !v)}
                className="px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all"
                style={{
                  background: autoRefresh ? 'rgba(0,214,143,0.15)' : 'rgba(255,255,255,0.03)',
                  color: autoRefresh ? '#00d68f' : 'var(--text-muted)',
                  border: `1px solid ${autoRefresh ? 'rgba(0,214,143,0.35)' : 'var(--border-subtle)'}`,
                }}
                title="Auto-refresh every 60s during NSE market hours"
              >
                {autoRefresh ? '● Auto 60s' : 'Auto Off'}
              </button>

              <button
                type="button"
                onClick={exportCSV}
                className="px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all hover:brightness-125"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                }}
                title="Export watchlist to CSV"
              >
                <Download size={13} />
                <span className="hidden sm:inline">CSV</span>
              </button>

              <button
                type="button"
                onClick={() => fetchWatchlistBatch(watchlist, { isUserRefresh: true })}
                disabled={refreshing || loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md hover:brightness-125 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(59,130,246,0.12))',
                  color: '#60a5fa',
                  border: '1px solid rgba(59,130,246,0.4)',
                }}
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                <span>{refreshing ? 'Refreshing...' : 'Fetch Fresh Data'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── Instant Cache Banner ─── */}
      {isCachedView && !justUpdated && Object.keys(quoteMap).length > 0 && watchlist.length > 0 && (
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
              Loaded instantly from local cache{' '}
              <span className="text-white font-semibold">({timeAgoText || 'recently'})</span>. Want updated live quotes?
            </span>
          </div>
          <button
            type="button"
            onClick={() => fetchWatchlistBatch(watchlist, { isUserRefresh: true })}
            disabled={refreshing}
            className="text-xs font-bold px-2.5 py-1 rounded-lg text-blue-400 hover:text-white underline cursor-pointer shrink-0"
          >
            {refreshing ? 'Refreshing...' : 'Re-fetch now →'}
          </button>
        </div>
      )}

      {/* ─── Refresh Confirmation Toast ─── */}
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
            Watchlist refreshed ({filterCounts.loadedCount} stocks in {fetchMs ?? '—'}ms) and cached locally.
          </span>
        </div>
      )}

      {error && !loading && (
        <div
          className="p-4 rounded-xl mb-5 flex items-center justify-between"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <p className="text-xs text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => fetchWatchlistBatch(watchlist, { isUserRefresh: true })}
            className="text-xs text-white underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ─── Summary KPI Cards ─── */}
      {watchlist.length > 0 && summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 animate-fade-in-up">
          <div className="glass-card-static rounded-xl p-4">
            <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Avg Watchlist Move
            </p>
            <p className="text-2xl font-black mt-1" style={{ color: summary.avgChange >= 0 ? '#00d68f' : '#ff4d6a' }}>
              {summary.avgChange >= 0 ? '+' : ''}
              {summary.avgChange.toFixed(2)}%
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Across {summary.loadedCount} / {watchlist.length} stocks
            </p>
          </div>

          <div className="glass-card-static rounded-xl p-4">
            <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Gainers / Losers
            </p>
            <p className="text-2xl font-black mt-1">
              <span style={{ color: '#00d68f' }}>{filterCounts.gainers}</span>
              <span className="text-xs mx-1.5" style={{ color: 'var(--text-muted)' }}>/</span>
              <span style={{ color: '#ff4d6a' }}>{filterCounts.losers}</span>
            </p>
            <div className="w-full h-1.5 rounded-full overflow-hidden flex mt-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                style={{
                  width: `${(filterCounts.gainers / Math.max(summary.loadedCount, 1)) * 100}%`,
                  background: '#00d68f',
                }}
              />
              <div
                style={{
                  width: `${(filterCounts.losers / Math.max(summary.loadedCount, 1)) * 100}%`,
                  background: '#ff4d6a',
                }}
              />
            </div>
          </div>

          <div className="glass-card-static rounded-xl p-4">
            <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Top Gainer &amp; Laggard
            </p>
            <div className="mt-1.5 space-y-1 text-xs">
              {summary.topGainer && (
                <Link href={`/stock/${summary.topGainer.symbol}`} className="flex items-center justify-between hover:underline">
                  <span className="font-bold text-slate-200 flex items-center gap-1">
                    <TrendingUp size={11} style={{ color: '#00d68f' }} /> {summary.topGainer.symbol}
                  </span>
                  <span className="font-mono font-bold" style={{ color: '#00d68f' }}>
                    {summary.topGainer.changePercent >= 0 ? '+' : ''}
                    {summary.topGainer.changePercent.toFixed(2)}%
                  </span>
                </Link>
              )}
              {summary.topLoser && (
                <Link href={`/stock/${summary.topLoser.symbol}`} className="flex items-center justify-between hover:underline">
                  <span className="font-bold text-slate-200 flex items-center gap-1">
                    <TrendingDown size={11} style={{ color: '#ff4d6a' }} /> {summary.topLoser.symbol}
                  </span>
                  <span className="font-mono font-bold" style={{ color: '#ff4d6a' }}>
                    {summary.topLoser.changePercent >= 0 ? '+' : ''}
                    {summary.topLoser.changePercent.toFixed(2)}%
                  </span>
                </Link>
              )}
            </div>
          </div>

          <div className="glass-card-static rounded-xl p-4">
            <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              AI Sentiment Bias
            </p>
            <p className="text-2xl font-black mt-1">
              <span style={{ color: '#00d68f' }}>{summary.bullish}</span>
              <span className="text-xs mx-1" style={{ color: 'var(--text-muted)' }}>Bull /</span>
              <span style={{ color: '#ff4d6a' }}>{summary.bearish}</span>
              <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>Bear</span>
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Tracking {watchlist.length} stocks total
            </p>
          </div>
        </div>
      )}

      {/* ─── Add Stock Bar + Local Search / Sector / Sort / View Controls ─── */}
      <div className="space-y-3 mb-5">
        <div className="flex flex-col lg:flex-row gap-2.5">
          {/* Add New Stock to Watchlist */}
          <div className="relative lg:w-80" ref={dropdownRef}>
            <div
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid rgba(59,130,246,0.35)',
              }}
            >
              <Plus size={15} style={{ color: '#60a5fa' }} />
              <input
                type="text"
                placeholder="Add stock (e.g. TMCV, INDIGO, BEL)..."
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                onFocus={() => addQuery.trim() && setShowDropdown(true)}
                onKeyDown={handleAddKeyDown}
                className="bg-transparent outline-none text-sm w-full text-white placeholder:text-gray-500"
              />
              {addQuery && (
                <button
                  type="button"
                  onClick={() => setAddQuery('')}
                  className="text-xs text-gray-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {showDropdown && searchResults.length > 0 && (
              <div
                className="absolute top-full left-0 right-0 mt-1.5 rounded-xl overflow-hidden z-50 shadow-2xl max-h-64 overflow-y-auto"
                style={{
                  background: '#0f172a',
                  border: '1px solid rgba(59,130,246,0.35)',
                }}
              >
                {searchResults.map((stock, idx) => (
                  <button
                    type="button"
                    key={stock.symbol}
                    onClick={() => addStock(stock.symbol)}
                    onMouseEnter={() => setSelectedDropdownIdx(idx)}
                    className="w-full text-left flex items-center justify-between px-3.5 py-2.5 cursor-pointer transition-colors"
                    style={{
                      background: idx === selectedDropdownIdx ? 'rgba(59,130,246,0.16)' : 'transparent',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="min-w-0 pr-2">
                      <span className="text-xs font-bold" style={{ color: '#60a5fa' }}>
                        {stock.symbol}
                      </span>
                      <span className="text-[11px] ml-2 truncate" style={{ color: 'var(--text-secondary)' }}>
                        {stock.name}
                      </span>
                    </div>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded capitalize shrink-0"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}
                    >
                      {SECTOR_ICONS[stock.sector] || '📈'} {stock.sector}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {watchlist.length > 0 && (
            <>
              {/* Search Within Watchlist */}
              <div
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl flex-1"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
              >
                <Search size={15} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter your watchlist..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="bg-transparent outline-none text-sm w-full text-white placeholder:text-gray-500"
                />
                {localSearch && (
                  <button
                    type="button"
                    onClick={() => setLocalSearch('')}
                    className="text-xs text-gray-400 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Sector Filter */}
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="px-3 py-2.5 rounded-xl text-xs cursor-pointer outline-none font-semibold text-white min-w-[140px]"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
              >
                <option value="all" className="bg-gray-900">
                  All Sectors ({sectorOptions.length - 1})
                </option>
                {sectorOptions
                  .filter((s) => s !== 'all')
                  .map((sec) => (
                    <option key={sec} value={sec} className="bg-gray-900">
                      {sec.charAt(0).toUpperCase() + sec.slice(1)}
                    </option>
                  ))}
              </select>

              {/* View Mode Toggle */}
              <div
                className="flex items-center rounded-xl p-1 gap-1 shrink-0"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                  style={{
                    background: viewMode === 'table' ? 'rgba(59,130,246,0.2)' : 'transparent',
                    color: viewMode === 'table' ? '#60a5fa' : 'var(--text-muted)',
                  }}
                >
                  <LayoutList size={12} />
                  <span>Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                  style={{
                    background: viewMode === 'cards' ? 'rgba(59,130,246,0.2)' : 'transparent',
                    color: viewMode === 'cards' ? '#60a5fa' : 'var(--text-muted)',
                  }}
                >
                  <LayoutGrid size={12} />
                  <span>Cards</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Category Filter Pills & Sort Controls */}
        {watchlist.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {filterButtons.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0 cursor-pointer transition-all flex items-center gap-1.5"
                    style={{
                      background: active ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.03)',
                      color: active ? '#60a5fa' : 'var(--text-muted)',
                      border: `1px solid ${active ? 'rgba(59,130,246,0.35)' : 'var(--border-subtle)'}`,
                    }}
                  >
                    <span>{f.label}</span>
                    <span
                      className="text-[10px] px-1.5 rounded-full font-mono"
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

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {(
                [
                  { id: 'default', label: 'Added Order' },
                  { id: 'changePercent', label: 'Change %' },
                  { id: 'price', label: 'Price' },
                  { id: 'probability', label: 'AI Conviction' },
                ] as { id: SortField; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSort(opt.id)}
                  className="text-[11px] px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-all"
                  style={{
                    background: sortField === opt.id ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.03)',
                    color: sortField === opt.id ? '#60a5fa' : 'var(--text-muted)',
                    border: `1px solid ${sortField === opt.id ? 'rgba(59,130,246,0.3)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Watchlist Content ─── */}
      {watchlist.length > 0 ? (
        loading && Object.keys(quoteMap).length === 0 ? (
          <div
            className="rounded-xl p-10 text-center border"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
          >
            <div
              className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }}
            />
            <p className="text-sm font-semibold text-white">Loading live quotes for {watchlist.length} stocks...</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Fetching Upstox batch prices, RSI &amp; AI outlook
            </p>
          </div>
        ) : visibleRows.length === 0 ? (
          <div
            className="rounded-xl p-10 text-center border"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
          >
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-sm font-bold text-white">No watchlist stocks match your filters</p>
            <button
              type="button"
              onClick={() => {
                setLocalSearch('');
                setSelectedSector('all');
                setFilter('all');
              }}
              className="mt-3 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}
            >
              Clear Filters
            </button>
          </div>
        ) : viewMode === 'cards' ? (
          /* Cards View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 animate-fade-in-up">
            {visibleRows.map(({ symbol, name, sector, data: q }) => {
              const change = q?.changePercent ?? 0;
              const isUp = change >= 0;
              const pred = q?.prediction;
              const rangePct =
                q && q.dayHigh > q.dayLow
                  ? Math.min(100, Math.max(0, ((q.price - q.dayLow) / (q.dayHigh - q.dayLow)) * 100))
                  : 50;

              return (
                <div
                  key={symbol}
                  className="rounded-xl p-4 flex flex-col justify-between transition-all hover:brightness-110"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/stock/${symbol}`} className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-white hover:underline" style={{ color: '#60a5fa' }}>
                            {symbol}
                          </span>
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded-full capitalize"
                            style={{ background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)' }}
                          >
                            {SECTOR_ICONS[sector] || '📈'} {sector}
                          </span>
                        </div>
                        <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {name}
                        </p>
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => removeStock(symbol, e)}
                        className="p-1.5 rounded-lg text-xs cursor-pointer transition-colors hover:brightness-125 shrink-0"
                        style={{ background: 'rgba(255,77,106,0.1)', color: '#ff4d6a' }}
                        title="Remove from watchlist"
                      >
                        <X size={13} />
                      </button>
                    </div>

                    <div className="flex items-baseline justify-between mt-3">
                      <span className="text-xl font-black text-white tabular-nums">
                        {q ? `₹${q.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </span>
                      {q ? (
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded font-mono"
                          style={{
                            background: isUp ? 'rgba(0,214,143,0.12)' : 'rgba(255,77,106,0.12)',
                            color: isUp ? '#00d68f' : '#ff4d6a',
                          }}
                        >
                          {isUp ? '+' : ''}
                          {q.changePercent.toFixed(2)}% ({q.change >= 0 ? '+' : ''}₹{q.change.toFixed(2)})
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Unavailable</span>
                      )}
                    </div>

                    {/* Day Range Slider */}
                    {q && q.dayHigh > q.dayLow && (
                      <div className="mt-3">
                        <div className="flex justify-between text-[9px] font-mono mb-1" style={{ color: 'var(--text-muted)' }}>
                          <span>L: ₹{q.dayLow.toLocaleString('en-IN')}</span>
                          <span>Vol: {formatVolumeShort(q.volume)}</span>
                          <span>H: ₹{q.dayHigh.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full relative">
                          <div
                            className="w-2.5 h-2.5 rounded-full bg-white absolute -top-0.5 shadow"
                            style={{ left: `calc(${rangePct}% - 5px)` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-2">
                      {pred ? (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                          style={{
                            background:
                              pred.direction === 'bullish'
                                ? 'rgba(0,214,143,0.15)'
                                : pred.direction === 'bearish'
                                  ? 'rgba(255,77,106,0.15)'
                                  : 'rgba(251,191,36,0.15)',
                            color:
                              pred.direction === 'bullish'
                                ? '#00d68f'
                                : pred.direction === 'bearish'
                                  ? '#ff4d6a'
                                  : '#fbbf24',
                          }}
                        >
                          {pred.direction === 'bullish' ? '▲ BULL' : pred.direction === 'bearish' ? '▼ BEAR' : '◆ NEUT'}{' '}
                          {pred.probability}%
                        </span>
                      ) : (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>No AI signal</span>
                      )}
                      {q?.rsi != null && (
                        <span
                          className="text-[10px] font-mono font-bold"
                          style={{ color: q.rsi < 35 ? '#00d68f' : q.rsi > 70 ? '#ff4d6a' : 'var(--text-muted)' }}
                        >
                          RSI {q.rsi}
                        </span>
                      )}
                    </div>

                    <Link
                      href={`/stock/${symbol}`}
                      className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-bold"
                      style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}
                    >
                      <span>Analyze</span>
                      <ExternalLink size={10} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View (Price & Change ALWAYS visible on every viewport!) */
          <div
            className="rounded-xl overflow-hidden shadow-xl animate-fade-in-up"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th className="text-left px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
                      Stock
                    </th>
                    <th
                      onClick={() => handleSort('price')}
                      className="text-right px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold cursor-pointer hover:text-white"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span className="inline-flex items-center gap-1">
                        Price (LTP) <ArrowUpDown size={10} />
                      </span>
                    </th>
                    <th
                      onClick={() => handleSort('changePercent')}
                      className="text-right px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold cursor-pointer hover:text-white"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span className="inline-flex items-center gap-1">
                        Change <ArrowUpDown size={10} />
                      </span>
                    </th>
                    <th className="text-center px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold hidden lg:table-cell" style={{ color: 'var(--text-muted)' }}>
                      Day Range
                    </th>
                    <th
                      onClick={() => handleSort('rsi')}
                      className="text-center px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold hidden md:table-cell cursor-pointer hover:text-white"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span className="inline-flex items-center gap-1">
                        RSI (14) <ArrowUpDown size={10} />
                      </span>
                    </th>
                    <th
                      onClick={() => handleSort('probability')}
                      className="text-center px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold hidden sm:table-cell cursor-pointer hover:text-white"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span className="inline-flex items-center gap-1">
                        AI Signal <ArrowUpDown size={10} />
                      </span>
                    </th>
                    <th className="text-right px-4 py-3.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ symbol, name, sector, data: q }) => {
                    const change = q?.changePercent ?? 0;
                    const isUp = change >= 0;
                    const pred = q?.prediction;
                    const rangePct =
                      q && q.dayHigh > q.dayLow
                        ? Math.min(100, Math.max(0, ((q.price - q.dayLow) / (q.dayHigh - q.dayLow)) * 100))
                        : 50;

                    return (
                      <tr
                        key={symbol}
                        className="transition-colors hover:bg-white/[0.02]"
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      >
                        <td className="px-4 py-3.5">
                          <Link href={`/stock/${symbol}`} className="block">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold hover:underline" style={{ color: '#60a5fa' }}>
                                {symbol}
                              </span>
                              <span
                                className="text-[9px] px-1.5 py-0.2 rounded capitalize hidden sm:inline-block"
                                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}
                              >
                                {SECTOR_ICONS[sector] || '📈'} {sector}
                              </span>
                            </div>
                            <p className="text-[11px] truncate max-w-[160px] sm:max-w-[230px]" style={{ color: 'var(--text-muted)' }}>
                              {name}
                            </p>
                          </Link>
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono">
                          {q ? (
                            <div>
                              <span className="text-sm font-bold text-white tabular-nums">
                                ₹{q.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                Vol {formatVolumeShort(q.volume)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono">
                          {q ? (
                            <div>
                              <span className="text-sm font-bold tabular-nums" style={{ color: isUp ? '#00d68f' : '#ff4d6a' }}>
                                {isUp ? '+' : ''}
                                {q.changePercent.toFixed(2)}%
                              </span>
                              <p className="text-[10px] tabular-nums" style={{ color: isUp ? '#00d68f' : '#ff4d6a' }}>
                                {q.change >= 0 ? '+' : ''}₹{q.change.toFixed(2)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          {q && q.dayHigh > q.dayLow ? (
                            <div className="w-32 mx-auto">
                              <div className="flex justify-between text-[9px] font-mono mb-1" style={{ color: 'var(--text-muted)' }}>
                                <span>₹{q.dayLow.toLocaleString('en-IN')}</span>
                                <span>₹{q.dayHigh.toLocaleString('en-IN')}</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-800 rounded-full relative">
                                <div
                                  className="w-2 h-2 rounded-full bg-white absolute -top-[1px] shadow"
                                  style={{ left: `calc(${rangePct}% - 4px)` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>—</p>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-center hidden md:table-cell font-mono">
                          {q?.rsi != null ? (
                            <div>
                              <span
                                className="text-xs font-bold"
                                style={{ color: q.rsi <= 35 ? '#00d68f' : q.rsi >= 70 ? '#ff4d6a' : '#cbd5e1' }}
                              >
                                {q.rsi}
                              </span>
                              {q.rsi <= 35 && <p className="text-[9px]" style={{ color: '#00d68f' }}>Oversold</p>}
                              {q.rsi >= 70 && <p className="text-[9px]" style={{ color: '#ff4d6a' }}>Overbought</p>}
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                          {pred ? (
                            <div className="inline-flex flex-col items-center gap-1">
                              <span
                                className="text-[10px] px-2.5 py-0.5 rounded-full font-bold"
                                style={{
                                  background:
                                    pred.direction === 'bullish'
                                      ? 'rgba(0,214,143,0.14)'
                                      : pred.direction === 'bearish'
                                        ? 'rgba(255,77,106,0.14)'
                                        : 'rgba(251,191,36,0.14)',
                                  color:
                                    pred.direction === 'bullish'
                                      ? '#00d68f'
                                      : pred.direction === 'bearish'
                                        ? '#ff4d6a'
                                        : '#fbbf24',
                                }}
                              >
                                {pred.direction === 'bullish' ? '▲ BULLISH' : pred.direction === 'bearish' ? '▼ BEARISH' : '◆ NEUTRAL'}{' '}
                                {pred.probability}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/stock/${symbol}`}
                              className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-bold transition-all hover:brightness-125"
                              style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}
                            >
                              <span>View</span>
                              <ExternalLink size={10} />
                            </Link>
                            <button
                              type="button"
                              onClick={(e) => removeStock(symbol, e)}
                              className="text-[11px] px-2 py-1 rounded-lg font-bold transition-all hover:brightness-125 cursor-pointer"
                              style={{ background: 'rgba(255,77,106,0.1)', color: '#ff4d6a' }}
                              title={`Remove ${symbol} from watchlist`}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* Empty State */
        <div
          className="rounded-xl p-10 text-center"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <p className="text-4xl mb-3">⭐</p>
          <h2 className="text-base font-bold mb-1 text-white">Your Watchlist is Empty</h2>
          <p className="text-xs mb-6 max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Search above to add any NSE/BSE stock, or start with popular picks below:
          </p>

          <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
            {POPULAR_SUGGESTIONS.map((stock) => (
              <button
                key={stock.symbol}
                type="button"
                onClick={() => addStock(stock.symbol)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:brightness-125 cursor-pointer"
                style={{
                  background: 'rgba(59,130,246,0.1)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59,130,246,0.2)',
                }}
              >
                + {stock.symbol}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setWatchlist(POPULAR_SUGGESTIONS.map((s) => s.symbol))}
              className="text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all hover:brightness-125 cursor-pointer"
              style={{
                background: 'rgba(0,214,143,0.14)',
                color: '#00d68f',
                border: '1px solid rgba(0,214,143,0.3)',
              }}
            >
              + Add All 8 Popular Stocks
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
