'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  Clock,
  Zap,
  CheckCircle2,
  Search,
  LayoutGrid,
  Grid2x2,
  ListOrdered,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Brain,
  Flame,
} from 'lucide-react';
import { getBrokerConfig } from '@/lib/brokerApi';
import { isMarketOpenNow } from '@/lib/marketHolidays';
import {
  loadHeatmapCache,
  saveHeatmapCache,
  formatScanTimestamp,
  formatTimeAgo,
} from '@/lib/heatmapCache';
import type { HeatmapStockItem, HeatmapStats, HeatmapResponse } from '@/lib/heatmapData';

type SortOption = 'weight' | 'changeDesc' | 'changeAsc' | 'impact' | 'volume';
type ViewMode = 'treemap' | 'sectorGrid' | 'flatRank';
type ColorMode = 'change' | 'ai';
type QuickFilter = 'all' | 'gainers' | 'losers' | 'movers' | 'bullish' | 'bearish';

function getChangeBg(changePct: number): string {
  if (changePct >= 3) return 'rgba(0, 214, 143, 0.36)';
  if (changePct >= 2) return 'rgba(0, 214, 143, 0.27)';
  if (changePct >= 1) return 'rgba(0, 214, 143, 0.19)';
  if (changePct >= 0.25) return 'rgba(0, 214, 143, 0.11)';
  if (changePct > -0.25) return 'rgba(148, 163, 184, 0.06)';
  if (changePct > -1) return 'rgba(255, 77, 106, 0.11)';
  if (changePct > -2) return 'rgba(255, 77, 106, 0.19)';
  if (changePct > -3) return 'rgba(255, 77, 106, 0.27)';
  return 'rgba(255, 77, 106, 0.36)';
}

function getChangeBorder(changePct: number): string {
  if (changePct >= 2) return 'rgba(0, 214, 143, 0.45)';
  if (changePct >= 0.25) return 'rgba(0, 214, 143, 0.2)';
  if (changePct <= -2) return 'rgba(255, 77, 106, 0.45)';
  if (changePct <= -0.25) return 'rgba(255, 77, 106, 0.2)';
  return 'rgba(255, 255, 255, 0.08)';
}

function getTextColor(changePct: number): string {
  if (changePct >= 0.25) return '#00d68f';
  if (changePct > -0.25) return '#94a3b8';
  return '#ff4d6a';
}

function getAiTileStyle(pred: HeatmapStockItem['prediction']): { bg: string; border: string; accent: string } {
  if (!pred || pred.direction === 'neutral') {
    return {
      bg: 'rgba(251, 191, 36, 0.08)',
      border: 'rgba(251, 191, 36, 0.22)',
      accent: '#fbbf24',
    };
  }
  const strong = pred.probability >= 70;
  if (pred.direction === 'bullish') {
    return {
      bg: strong ? 'rgba(0, 214, 143, 0.30)' : 'rgba(0, 214, 143, 0.16)',
      border: strong ? 'rgba(0, 214, 143, 0.45)' : 'rgba(0, 214, 143, 0.22)',
      accent: '#00d68f',
    };
  }
  return {
    bg: strong ? 'rgba(255, 77, 106, 0.30)' : 'rgba(255, 77, 106, 0.16)',
    border: strong ? 'rgba(255, 77, 106, 0.45)' : 'rgba(255, 77, 106, 0.22)',
    accent: '#ff4d6a',
  };
}

function formatVolumeShort(vol: number): string {
  if (vol >= 10000000) return `${(vol / 10000000).toFixed(2)} Cr`;
  if (vol >= 100000) return `${(vol / 100000).toFixed(1)} L`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)} K`;
  return String(vol);
}

export default function HeatmapPage() {
  const [stocks, setStocks] = useState<HeatmapStockItem[]>([]);
  const [stats, setStats] = useState<HeatmapStats | null>(null);
  const [source, setSource] = useState<HeatmapResponse['source']>('upstox');
  const [fetchMs, setFetchMs] = useState<number | null>(null);

  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(null);
  const [isCachedView, setIsCachedView] = useState<boolean>(false);
  const [timeAgoText, setTimeAgoText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [justUpdated, setJustUpdated] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Interactive Controls
  const [viewMode, setViewMode] = useState<ViewMode>('treemap');
  const [colorMode, setColorMode] = useState<ColorMode>('change');
  const [sortBy, setSortBy] = useState<SortOption>('weight');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [hoveredStock, setHoveredStock] = useState<HeatmapStockItem | null>(null);

  const fetchHeatmap = useCallback(async (isUserInitiated = false) => {
    if (isUserInitiated) {
      setRefreshing(true);
    } else {
      setLoading((prev) => (stocks.length === 0 ? true : prev));
    }
    setError(null);

    try {
      const brokerConfig = getBrokerConfig();
      const headers: Record<string, string> = {};
      if (brokerConfig.provider === 'upstox' && brokerConfig.connected && brokerConfig.accessToken) {
        headers['X-Upstox-Token'] = brokerConfig.accessToken;
      }

      const res = await fetch(`/api/heatmap${isUserInitiated ? '?refresh=true' : ''}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HeatmapResponse = await res.json();

      if (Array.isArray(data.stocks) && data.stocks.length > 0) {
        const now = Date.now();
        setStocks(data.stocks);
        setStats(data.stats);
        setSource(data.source);
        setFetchMs(data.fetchMs ?? null);
        setCacheTimestamp(now);
        setTimeAgoText(formatTimeAgo(now));
        setIsCachedView(false);

        saveHeatmapCache({
          stocks: data.stocks,
          stats: data.stats,
          source: data.source,
          timestampMs: now,
        });

        if (isUserInitiated) {
          setJustUpdated(true);
          setTimeout(() => setJustUpdated(false), 3000);
        }
      } else {
        throw new Error('No constituent quotes returned');
      }
    } catch (err: any) {
      console.error('[Heatmap] Fetch failed:', err);
      setError('Unable to fetch fresh market quotes right now. Showing last cached snapshot if available.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [stocks.length]);

  // Instant post-mount localStorage hydration -> fallback fetch if no valid cache
  useEffect(() => {
    const cached = loadHeatmapCache();
    if (cached && cached.stocks.length > 0) {
      setStocks(cached.stocks);
      setStats(cached.stats);
      setSource(cached.source);
      setCacheTimestamp(cached.timestamp);
      setTimeAgoText(formatTimeAgo(cached.timestamp));
      setIsCachedView(true);
      setLoading(false);
    } else {
      fetchHeatmap(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update relative time-ago badge every 30s
  useEffect(() => {
    if (!cacheTimestamp) return;
    const id = setInterval(() => setTimeAgoText(formatTimeAgo(cacheTimestamp)), 30000);
    return () => clearInterval(id);
  }, [cacheTimestamp]);

  // Optional live auto-refresh during market hours
  useEffect(() => {
    if (!autoRefresh) return;
    if (!isMarketOpenNow()) return;
    const id = setInterval(() => fetchHeatmap(true), 60 * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchHeatmap]);

  // Dynamic filter counts
  const filterCounts = useMemo(() => {
    return {
      all: stocks.length,
      gainers: stocks.filter((s) => s.changePercent > 0.05).length,
      losers: stocks.filter((s) => s.changePercent < -0.05).length,
      movers: stocks.filter((s) => Math.abs(s.changePercent) >= 1.5).length,
      bullish: stocks.filter((s) => s.prediction?.direction === 'bullish').length,
      bearish: stocks.filter((s) => s.prediction?.direction === 'bearish').length,
    };
  }, [stocks]);

  const sectorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of stocks) set.add(s.sector);
    return ['all', ...Array.from(set).sort()];
  }, [stocks]);

  // Filtered + Sorted list
  const visibleStocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = stocks.filter((s) => {
      if (q) {
        const hit =
          s.symbol.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.sector.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (selectedSector !== 'all' && s.sector !== selectedSector) return false;

      switch (quickFilter) {
        case 'gainers':
          return s.changePercent > 0.05;
        case 'losers':
          return s.changePercent < -0.05;
        case 'movers':
          return Math.abs(s.changePercent) >= 1.5;
        case 'bullish':
          return s.prediction?.direction === 'bullish';
        case 'bearish':
          return s.prediction?.direction === 'bearish';
        default:
          return true;
      }
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'changeDesc') return b.changePercent - a.changePercent;
      if (sortBy === 'changeAsc') return a.changePercent - b.changePercent;
      if (sortBy === 'impact') return Math.abs(b.indexImpact) - Math.abs(a.indexImpact);
      if (sortBy === 'volume') return b.volume - a.volume;
      return b.weight - a.weight;
    });
  }, [stocks, search, selectedSector, quickFilter, sortBy]);

  // Group into sectors ordered by total sector weight or performance
  const sectorGroups = useMemo(() => {
    const map = new Map<string, HeatmapStockItem[]>();
    for (const s of visibleStocks) {
      if (!map.has(s.sector)) map.set(s.sector, []);
      map.get(s.sector)!.push(s);
    }
    return Array.from(map.entries())
      .map(([name, items]) => {
        const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
        const weightedAvg =
          totalWeight > 0
            ? items.reduce((sum, i) => sum + i.weight * i.changePercent, 0) / totalWeight
            : items.reduce((sum, i) => sum + i.changePercent, 0) / items.length;
        const adv = items.filter((i) => i.changePercent > 0.05).length;
        const dec = items.filter((i) => i.changePercent < -0.05).length;
        return { name, items, totalWeight, weightedAvg, adv, dec };
      })
      .sort((a, b) => {
        if (sortBy === 'changeDesc') return b.weightedAvg - a.weightedAvg;
        if (sortBy === 'changeAsc') return a.weightedAvg - b.weightedAvg;
        return b.totalWeight - a.totalWeight;
      });
  }, [visibleStocks, sortBy]);

  const filterButtons: { key: QuickFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: filterCounts.all },
    { key: 'gainers', label: 'Gainers', count: filterCounts.gainers },
    { key: 'losers', label: 'Losers', count: filterCounts.losers },
    { key: 'movers', label: 'Movers (±1.5%)', count: filterCounts.movers },
    { key: 'bullish', label: 'AI Bullish', count: filterCounts.bullish },
    { key: 'bearish', label: 'AI Bearish', count: filterCounts.bearish },
  ];

  const breadthTotal = stats ? Math.max(stats.total, 1) : 1;
  const advPct = stats ? (stats.advancers / breadthTotal) * 100 : 0;
  const unchPct = stats ? (stats.unchanged / breadthTotal) * 100 : 0;
  const decPct = stats ? (stats.decliners / breadthTotal) * 100 : 0;

  return (
    <div className="w-full max-w-7xl mx-auto pb-12">
      {/* ─── Header Row ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5 animate-fade-in-up">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Nifty 50 Heatmap</h1>
            {!loading && stocks.length > 0 && (
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
            Real-time weighted performance, sector breadth &amp; AI sentiment across {stocks.length || 50} Nifty leaders
          </p>
        </div>

        {/* Timestamp & User Re-Fetch Controls (Matching Screener UX) */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
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

          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className="px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all"
            style={{
              background: autoRefresh ? 'rgba(0,214,143,0.15)' : 'rgba(255,255,255,0.03)',
              color: autoRefresh ? '#00d68f' : 'var(--text-muted)',
              border: `1px solid ${autoRefresh ? 'rgba(0,214,143,0.35)' : 'var(--border-subtle)'}`,
            }}
            title="Auto-refresh every 60s when NSE market is open"
          >
            {autoRefresh ? '● Auto 60s' : 'Auto Off'}
          </button>

          <button
            type="button"
            onClick={() => fetchHeatmap(true)}
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
        </div>
      </div>

      {/* ─── Instant Cache Banner ─── */}
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
              Loaded instantly from local cache{' '}
              <span className="text-white font-semibold">({timeAgoText || 'recently'})</span>. Want live quotes?
            </span>
          </div>
          <button
            type="button"
            onClick={() => fetchHeatmap(true)}
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
            Live heatmap updated ({stocks.length} stocks in {fetchMs ?? '—'}ms) and cached locally for instant reload.
          </span>
        </div>
      )}

      {error && !loading && (
        <div
          className="p-4 rounded-xl mb-5 flex items-center justify-between"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <p className="text-xs text-red-400">{error}</p>
          <button type="button" onClick={() => fetchHeatmap(true)} className="text-xs text-white underline cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* ─── Breadth & Index Impact KPI Cards ─── */}
      {!loading && stats && (
        <div className="space-y-4 mb-5 animate-fade-in-up">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Advance / Decline Breadth Card */}
            <div className="glass-card-static rounded-xl p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Market Breadth
                </span>
                <span className="text-[11px] font-bold text-white">
                  <span style={{ color: '#00d68f' }}>{stats.advancers}▲</span>{' '}
                  <span style={{ color: '#94a3b8' }}>{stats.unchanged}—</span>{' '}
                  <span style={{ color: '#ff4d6a' }}>{stats.decliners}▼</span>
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full overflow-hidden flex my-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ width: `${advPct}%`, background: '#00d68f' }} title={`Advancers: ${stats.advancers}`} />
                <div style={{ width: `${unchPct}%`, background: '#64748b' }} title={`Unchanged: ${stats.unchanged}`} />
                <div style={{ width: `${decPct}%`, background: '#ff4d6a' }} title={`Decliners: ${stats.decliners}`} />
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                A/D Ratio:{' '}
                <strong className="text-white">
                  {stats.decliners > 0 ? (stats.advancers / stats.decliners).toFixed(2) : stats.advancers}
                </strong>
              </p>
            </div>

            {/* Weighted Index Impact Card */}
            <div className="glass-card-static rounded-xl p-4">
              <p className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                Nifty Weighted Move
              </p>
              <div className="flex items-baseline gap-2.5">
                <span
                  className="text-2xl font-black"
                  style={{ color: stats.weightedIndexChange >= 0 ? '#00d68f' : '#ff4d6a' }}
                >
                  {stats.weightedIndexChange >= 0 ? '+' : ''}
                  {stats.weightedIndexChange.toFixed(2)}%
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Avg: {stats.avgChange >= 0 ? '+' : ''}
                  {stats.avgChange.toFixed(2)}%
                </span>
              </div>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Weighted by constituent Nifty index weights
              </p>
            </div>

            {/* Top Gainers / Positive Impact */}
            <div className="glass-card-static rounded-xl p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Top Gainers
                </span>
                <TrendingUp size={13} style={{ color: '#00d68f' }} />
              </div>
              <div className="space-y-1">
                {stats.topGainers.map((g) => (
                  <Link
                    key={g.symbol}
                    href={`/stock/${g.symbol}`}
                    className="flex items-center justify-between text-xs hover:underline"
                  >
                    <span className="font-bold text-slate-200">{g.symbol}</span>
                    <span className="font-mono font-bold" style={{ color: '#00d68f' }}>
                      +{g.changePercent.toFixed(2)}%
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Top Losers / Drag */}
            <div className="glass-card-static rounded-xl p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Top Losers &amp; Drags
                </span>
                <TrendingDown size={13} style={{ color: '#ff4d6a' }} />
              </div>
              <div className="space-y-1">
                {stats.topLosers.map((l) => (
                  <Link
                    key={l.symbol}
                    href={`/stock/${l.symbol}`}
                    className="flex items-center justify-between text-xs hover:underline"
                  >
                    <span className="font-bold text-slate-200">{l.symbol}</span>
                    <span className="font-mono font-bold" style={{ color: '#ff4d6a' }}>
                      {l.changePercent >= 0 ? '+' : ''}
                      {l.changePercent.toFixed(2)}%
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Index Heavyweight Contributors Strip */}
          {(stats.topPositiveImpact.length > 0 || stats.topNegativeImpact.length > 0) && (
            <div
              className="rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
            >
              <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Index Impact Leaders:
              </span>
              {stats.topPositiveImpact.map((s) => (
                <Link key={s.symbol} href={`/stock/${s.symbol}`} className="flex items-center gap-1.5 hover:underline">
                  <span className="font-bold text-white">{s.symbol}</span>
                  <span className="font-mono font-semibold" style={{ color: '#00d68f' }}>
                    +{s.indexImpact.toFixed(2)}pt ({s.weight}%)
                  </span>
                </Link>
              ))}
              {stats.topNegativeImpact.map((s) => (
                <Link key={s.symbol} href={`/stock/${s.symbol}`} className="flex items-center gap-1.5 hover:underline">
                  <span className="font-bold text-white">{s.symbol}</span>
                  <span className="font-mono font-semibold" style={{ color: '#ff4d6a' }}>
                    {s.indexImpact.toFixed(2)}pt ({s.weight}%)
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Interactive Filter & View Controls ─── */}
      {!loading && stocks.length > 0 && (
        <div className="space-y-3 mb-5">
          <div className="flex flex-col lg:flex-row gap-2.5">
            {/* Search */}
            <div
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl flex-1"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
            >
              <Search size={15} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search symbol, name, or sector (e.g. HDFCBANK, Auto, Tata)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent outline-none text-sm w-full text-white placeholder:text-gray-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-xs text-gray-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sector Select */}
            <div className="relative min-w-[155px]">
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs appearance-none cursor-pointer outline-none font-semibold text-white"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
              >
                <option value="all" className="bg-gray-900">
                  All Sectors ({sectorOptions.length - 1})
                </option>
                {sectorOptions
                  .filter((s) => s !== 'all')
                  .map((sec) => (
                    <option key={sec} value={sec} className="bg-gray-900">
                      {sec}
                    </option>
                  ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-2.5 pointer-events-none text-gray-400" />
            </div>

            {/* Sort Select */}
            <div className="relative min-w-[165px]">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="w-full px-3 py-2 rounded-xl text-xs appearance-none cursor-pointer outline-none font-semibold text-white"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
              >
                <option value="weight" className="bg-gray-900">Sort: Index Weight</option>
                <option value="changeDesc" className="bg-gray-900">Sort: Top Gainers First</option>
                <option value="changeAsc" className="bg-gray-900">Sort: Top Losers First</option>
                <option value="impact" className="bg-gray-900">Sort: Index Impact</option>
                <option value="volume" className="bg-gray-900">Sort: Volume</option>
              </select>
              <ChevronDown size={13} className="absolute right-3 top-2.5 pointer-events-none text-gray-400" />
            </div>

            {/* View Mode Pills */}
            <div
              className="flex items-center rounded-xl p-1 gap-1"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
            >
              <button
                type="button"
                onClick={() => setViewMode('treemap')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
                style={{
                  background: viewMode === 'treemap' ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: viewMode === 'treemap' ? '#60a5fa' : 'var(--text-muted)',
                }}
                title="Proportional weighted tiles by sector"
              >
                <LayoutGrid size={12} />
                <span>Treemap</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('sectorGrid')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
                style={{
                  background: viewMode === 'sectorGrid' ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: viewMode === 'sectorGrid' ? '#60a5fa' : 'var(--text-muted)',
                }}
                title="Uniform sector grid cards"
              >
                <Grid2x2 size={12} />
                <span>Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('flatRank')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
                style={{
                  background: viewMode === 'flatRank' ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: viewMode === 'flatRank' ? '#60a5fa' : 'var(--text-muted)',
                }}
                title="Flat ranked heatmap without sector groups"
              >
                <ListOrdered size={12} />
                <span>Ranked</span>
              </button>
            </div>

            {/* Color By Mode */}
            <div
              className="flex items-center rounded-xl p-1 gap-1"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
            >
              <button
                type="button"
                onClick={() => setColorMode('change')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
                style={{
                  background: colorMode === 'change' ? 'rgba(0,214,143,0.18)' : 'transparent',
                  color: colorMode === 'change' ? '#00d68f' : 'var(--text-muted)',
                }}
              >
                <Flame size={12} />
                <span>% Move</span>
              </button>
              <button
                type="button"
                onClick={() => setColorMode('ai')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
                style={{
                  background: colorMode === 'ai' ? 'rgba(139,92,246,0.22)' : 'transparent',
                  color: colorMode === 'ai' ? '#c4b5fd' : 'var(--text-muted)',
                }}
              >
                <Brain size={12} />
                <span>AI Signal</span>
              </button>
            </div>
          </div>

          {/* Quick Filter Pills + Live Hover Inspector Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {filterButtons.map((f) => {
                const active = quickFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setQuickFilter(f.key)}
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

            <div className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
              Showing <strong className="text-white">{visibleStocks.length}</strong> of {stocks.length} stocks
            </div>
          </div>

          {/* Live Hover Inspector Strip (fixed min-height to prevent layout shift on hover) */}
          <div
            className="rounded-xl px-4 py-2.5 min-h-[42px] flex flex-wrap items-center justify-between gap-3 text-xs transition-colors"
            style={{
              background: hoveredStock ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${hoveredStock ? 'rgba(59,130,246,0.35)' : 'var(--border-subtle)'}`,
            }}
          >
            {hoveredStock ? (
              <>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-black text-white">{hoveredStock.symbol}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{hoveredStock.name}</span>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}
                  >
                    {hoveredStock.sector} · Wt {hoveredStock.weight}%
                  </span>
                </div>
                <div className="flex items-center gap-4 flex-wrap font-mono text-[11px]">
                  <span className="text-white font-bold">
                    ₹{hoveredStock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span style={{ color: getTextColor(hoveredStock.changePercent) }} className="font-bold">
                    {hoveredStock.change >= 0 ? '+' : ''}
                    {hoveredStock.change.toFixed(2)} ({hoveredStock.changePercent >= 0 ? '+' : ''}
                    {hoveredStock.changePercent.toFixed(2)}%)
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Prev: ₹{hoveredStock.previousClose.toLocaleString('en-IN')}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Range: ₹{hoveredStock.dayLow.toLocaleString('en-IN')}–₹{hoveredStock.dayHigh.toLocaleString('en-IN')}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>Vol: {formatVolumeShort(hoveredStock.volume)}</span>
                  {hoveredStock.rsi !== null && (
                    <span
                      style={{
                        color: hoveredStock.rsi > 70 ? '#ff4d6a' : hoveredStock.rsi < 35 ? '#00d68f' : '#cbd5e1',
                      }}
                    >
                      RSI: {hoveredStock.rsi}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>
                Hover any tile to inspect Open, Day Range, Prev Close, Volume &amp; RSI — click any stock to open full analysis.
              </span>
            )}
          </div>
        </div>
      )}

      {/* ─── Loading Skeleton ─── */}
      {loading && (
        <div
          className="rounded-xl p-10 text-center border"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
        >
          <div
            className="w-10 h-10 border-3 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }}
          />
          <p className="text-sm font-semibold text-white">Fetching Nifty 50 batch market feed...</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Compiling live prices, index weights, and AI signals
          </p>
        </div>
      )}

      {/* ─── Heatmap Visualization ─── */}
      {!loading && visibleStocks.length > 0 && (
        <div className="space-y-5 animate-fade-in-up">
          {viewMode === 'flatRank' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
              {visibleStocks.map((stock) => {
                const aiStyle = getAiTileStyle(stock.prediction);
                const bg = colorMode === 'ai' ? aiStyle.bg : getChangeBg(stock.changePercent);
                const border = colorMode === 'ai' ? aiStyle.border : getChangeBorder(stock.changePercent);
                return (
                  <Link
                    key={stock.symbol}
                    href={`/stock/${stock.symbol}`}
                    onMouseEnter={() => setHoveredStock(stock)}
                    className="min-h-[96px] p-3 rounded-xl transition-all duration-150 hover:scale-[1.02] hover:brightness-125 flex flex-col justify-between"
                    style={{ background: bg, border: `1px solid ${border}` }}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-white truncate">{stock.symbol}</p>
                        <p className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {stock.sector} · {stock.weight}%
                        </p>
                      </div>
                      {stock.prediction && (
                        <span
                          className="text-[9px] font-bold px-1 rounded"
                          style={{
                            color:
                              stock.prediction.direction === 'bullish'
                                ? '#00d68f'
                                : stock.prediction.direction === 'bearish'
                                  ? '#ff4d6a'
                                  : '#fbbf24',
                          }}
                        >
                          {stock.prediction.direction === 'bullish' ? '▲' : stock.prediction.direction === 'bearish' ? '▼' : '◆'}
                          {stock.prediction.probability}%
                        </span>
                      )}
                    </div>
                    <div className="mt-2">
                      <p className="text-[11px] font-medium text-slate-200 tabular-nums">
                        ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-sm font-black tabular-nums" style={{ color: getTextColor(stock.changePercent) }}>
                        {stock.changePercent >= 0 ? '+' : ''}
                        {stock.changePercent.toFixed(2)}%
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            sectorGroups.map((group) => (
              <div
                key={group.name}
                className="rounded-xl p-4"
                style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-subtle)' }}
              >
                {/* Sector Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
                      {group.name}
                    </h3>
                    <span
                      className="text-[11px] font-mono font-bold px-2 py-0.5 rounded"
                      style={{
                        background: getChangeBg(group.weightedAvg),
                        color: getTextColor(group.weightedAvg),
                      }}
                    >
                      {group.weightedAvg >= 0 ? '+' : ''}
                      {group.weightedAvg.toFixed(2)}%
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      Wt: {group.totalWeight.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold">
                    <span style={{ color: '#00d68f' }}>{group.adv}▲</span>
                    <span style={{ color: '#ff4d6a' }}>{group.dec}▼</span>
                  </div>
                </div>

                {/* Tiles Grid: Treemap uses proportional col/row spans for index heavyweights */}
                <div
                  className={`grid gap-2 ${
                    viewMode === 'treemap'
                      ? 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6 auto-rows-[minmax(82px,auto)]'
                      : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6'
                  }`}
                >
                  {group.items.map((stock) => {
                    const aiStyle = getAiTileStyle(stock.prediction);
                    const bg = colorMode === 'ai' ? aiStyle.bg : getChangeBg(stock.changePercent);
                    const border = colorMode === 'ai' ? aiStyle.border : getChangeBorder(stock.changePercent);

                    let spanClass = '';
                    if (viewMode === 'treemap') {
                      if (stock.weight >= 7) {
                        spanClass = 'col-span-2 row-span-2 min-h-[172px]';
                      } else if (stock.weight >= 3) {
                        spanClass = 'col-span-2 min-h-[104px]';
                      } else {
                        spanClass = 'col-span-1 min-h-[86px]';
                      }
                    } else {
                      spanClass = 'min-h-[88px]';
                    }

                    const isLarge = viewMode === 'treemap' && stock.weight >= 7;

                    return (
                      <Link
                        key={stock.symbol}
                        href={`/stock/${stock.symbol}`}
                        onMouseEnter={() => setHoveredStock(stock)}
                        className={`${spanClass} p-3 rounded-xl transition-all duration-150 hover:scale-[1.015] hover:brightness-125 cursor-pointer flex flex-col justify-between`}
                        style={{ background: bg, border: `1px solid ${border}` }}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0">
                            <p className={`${isLarge ? 'text-base' : 'text-xs'} font-black text-white truncate`}>
                              {stock.symbol}
                            </p>
                            <p className={`${isLarge ? 'text-[11px]' : 'text-[9px]'} truncate`} style={{ color: 'var(--text-muted)' }}>
                              {stock.name}
                            </p>
                          </div>
                          <span
                            className="text-[9px] font-mono px-1.5 py-0.2 rounded shrink-0"
                            style={{ background: 'rgba(0,0,0,0.22)', color: 'var(--text-muted)' }}
                          >
                            {stock.weight}%
                          </span>
                        </div>

                        <div className="flex items-end justify-between gap-2 mt-2">
                          <div>
                            <p className={`${isLarge ? 'text-sm' : 'text-[10px]'} font-medium text-slate-200 tabular-nums`}>
                              ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                            <p
                              className={`${isLarge ? 'text-xl' : 'text-sm'} font-black tabular-nums`}
                              style={{ color: getTextColor(stock.changePercent) }}
                            >
                              {stock.changePercent >= 0 ? '+' : ''}
                              {stock.changePercent.toFixed(2)}%
                            </p>
                          </div>

                          {stock.prediction && (
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                              style={{
                                background: 'rgba(0,0,0,0.25)',
                                color:
                                  stock.prediction.direction === 'bullish'
                                    ? '#00d68f'
                                    : stock.prediction.direction === 'bearish'
                                      ? '#ff4d6a'
                                      : '#fbbf24',
                              }}
                            >
                              {stock.prediction.direction === 'bullish' ? '▲' : stock.prediction.direction === 'bearish' ? '▼' : '◆'}{' '}
                              {stock.prediction.probability}%
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {/* Color Scale Legend */}
          <div
            className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[11px]"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
          >
            {colorMode === 'change' ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-white">Heat Scale:</span>
                {[
                  { label: '≤ -3%', pct: -3.5 },
                  { label: '-2%', pct: -2 },
                  { label: '-1%', pct: -1 },
                  { label: '0%', pct: 0 },
                  { label: '+1%', pct: 1 },
                  { label: '+2%', pct: 2 },
                  { label: '≥ +3%', pct: 3.5 },
                ].map((item) => (
                  <span
                    key={item.label}
                    className="px-2 py-0.5 rounded font-mono text-[10px]"
                    style={{
                      background: getChangeBg(item.pct),
                      color: getTextColor(item.pct),
                      border: `1px solid ${getChangeBorder(item.pct)}`,
                    }}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-semibold text-white">AI Signal Scale:</span>
                <span className="px-2 py-0.5 rounded text-[10px]" style={{ background: 'rgba(0,214,143,0.3)', color: '#00d68f' }}>
                  ▲ High Conviction Bullish (≥70%)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px]" style={{ background: 'rgba(0,214,143,0.16)', color: '#00d68f' }}>
                  ▲ Moderate Bullish
                </span>
                <span className="px-2 py-0.5 rounded text-[10px]" style={{ background: 'rgba(255,77,106,0.3)', color: '#ff4d6a' }}>
                  ▼ High Conviction Bearish (≥70%)
                </span>
              </div>
            )}
            <span>Click any stock tile for charts, AI outlook &amp; financials</span>
          </div>
        </div>
      )}

      {/* Empty Filter State */}
      {!loading && stocks.length > 0 && visibleStocks.length === 0 && (
        <div
          className="text-center py-14 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <p className="text-2xl mb-2">🗺️</p>
          <p className="text-sm font-bold text-white">No stocks match your heatmap filters</p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSelectedSector('all');
              setQuickFilter('all');
            }}
            className="mt-3 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
}
