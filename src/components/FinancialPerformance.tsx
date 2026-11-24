'use client';

import { useState, useEffect, useMemo } from 'react';
import type { FinancialPeriod, FinancialSummary } from '@/lib/financialData';

function formatCroresValue(value: number): string {
  const absVal = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const crores = absVal / 1e7;

  if (crores >= 100000) {
    return `${sign}₹${(crores / 100000).toFixed(2)} Lk Cr`;
  }
  if (crores >= 1) {
    return `${sign}₹${Math.round(crores).toLocaleString('en-IN')}Cr`;
  }
  if (absVal >= 1e5) {
    return `${sign}₹${(absVal / 1e5).toFixed(1)}L`;
  }
  return `${sign}₹${Math.round(absVal).toLocaleString('en-IN')}`;
}

function formatAxisTickCr(valueInInr: number): string {
  const cr = valueInInr / 1e7;
  const absCr = Math.abs(cr);
  const sign = cr < 0 ? '-' : '';
  if (absCr === 0) return '0';
  if (absCr >= 100000) return `${sign}${(absCr / 100000).toFixed(1)}L`;
  if (absCr >= 1000) {
    const k = absCr / 1000;
    return `${sign}${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `${sign}${Math.round(absCr)}`;
}

/** Pick clean horizontal grid ticks in INR spanning [minVal, maxVal]. */
function computeGridTicks(minVal: number, maxVal: number): { ticks: number[]; scaleMin: number; scaleMax: number } {
  const safeMax = maxVal > 0 ? maxVal : 1e9;
  const safeMin = minVal < 0 ? minVal : 0;

  const spanCr = (safeMax - safeMin) / 1e7;
  const rawStep = Math.max(spanCr, 1) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 0.1))));
  const norm = rawStep / mag;
  let niceNorm = 10;
  if (norm <= 1) niceNorm = 1;
  else if (norm <= 1.25) niceNorm = 1.25;
  else if (norm <= 2) niceNorm = 2;
  else if (norm <= 2.5) niceNorm = 2.5;
  else if (norm <= 5) niceNorm = 5;
  else if (norm <= 7.5) niceNorm = 7.5;

  const stepInr = niceNorm * mag * 1e7;
  const minUnits = safeMin < 0 ? Math.floor(safeMin / stepInr) : 0;
  const maxUnits = Math.max(1, Math.ceil(safeMax / stepInr));

  const ticks: number[] = [];
  for (let u = minUnits; u <= maxUnits; u++) {
    ticks.push(u * stepInr);
  }

  return {
    ticks,
    scaleMin: minUnits * stepInr,
    scaleMax: maxUnits * stepInr,
  };
}

function ChangePct({ value, tag }: { value: number | null; tag?: string }) {
  if (value === null || value === undefined) return null;
  const isPos = value >= 0;
  return (
    <span
      className="text-xs font-bold inline-flex items-center gap-1"
      style={{ color: isPos ? '#00d68f' : '#ff4d6a' }}
    >
      {isPos ? '+' : ''}{value.toFixed(2)}%
      {tag && (
        <span className="text-[9px] font-semibold px-1 py-0.2 rounded opacity-75"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
          {tag}
        </span>
      )}
    </span>
  );
}

function GrowthStatValue({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>N/A</span>;
  }
  const isPos = value >= 0;
  return (
    <span
      className="text-sm font-extrabold"
      style={{ color: isPos ? '#00d68f' : '#ff4d6a' }}
    >
      {isPos ? '+' : ''}{Math.round(value) === value ? value : value.toFixed(1)}%
    </span>
  );
}

export default function FinancialPerformance({ symbol }: { symbol: string }) {
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'quarterly' | 'yearly'>('quarterly');
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [showRevenue, setShowRevenue] = useState(true);
  const [showProfit, setShowProfit] = useState(true);
  const [showAllTable, setShowAllTable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSelectedIdx(-1);

    fetch(`/api/financials?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          setData(null);
        } else {
          setData(json);
          setSelectedIdx(-1);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message || 'Failed to load financials');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [symbol]);

  const periods: FinancialPeriod[] = useMemo(() => {
    if (!data) return [];
    return view === 'quarterly' ? data.quarterly : data.annual;
  }, [data, view]);

  const activeIdx = periods.length === 0 ? -1 : (selectedIdx >= 0 && selectedIdx < periods.length ? selectedIdx : periods.length - 1);
  const activePeriod = activeIdx >= 0 ? periods[activeIdx] : undefined;

  const { ticks, scaleMin, scaleMax } = useMemo(() => {
    if (periods.length === 0) return { ticks: [0], scaleMin: 0, scaleMax: 1e9 };
    const values: number[] = [];
    for (const p of periods) {
      if (showRevenue) values.push(p.revenue);
      if (showProfit) values.push(p.profit);
    }
    const maxV = values.length > 0 ? Math.max(...values, 0) : 1e9;
    const minV = values.length > 0 ? Math.min(...values, 0) : 0;
    return computeGridTicks(minV, maxV);
  }, [periods, showRevenue, showProfit]);

  const toggleSeries = (series: 'revenue' | 'profit') => {
    if (series === 'revenue') {
      if (showRevenue && !showProfit) return; // keep at least one visible
      setShowRevenue((prev) => !prev);
    } else {
      if (showProfit && !showRevenue) return;
      setShowProfit((prev) => !prev);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl p-10 text-center border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="w-8 h-8 border-3 rounded-full animate-spin mx-auto mb-3"
          style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          Fetching quarterly &amp; annual financials for {symbol}...
        </p>
      </div>
    );
  }

  if (error || !data || (data.quarterly.length === 0 && data.annual.length === 0)) {
    return (
      <div className="rounded-xl p-10 text-center border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <p className="text-3xl mb-3">📊</p>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Financial statements unavailable for {symbol}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {error || 'No income statement records returned for this stock.'}
        </p>
      </div>
    );
  }

  const totalRange = Math.max(scaleMax - scaleMin, 1);
  const zeroPctFromBottom = ((0 - scaleMin) / totalRange) * 100;
  const chartHeightPx = 200;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ─── Header Row: Title + Quarterly/Yearly Pills + All Financials Toggle ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Financial performance
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setView('quarterly'); setSelectedIdx(-1); }}
              className="px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer"
              style={{
                background: view === 'quarterly' ? 'rgba(59,130,246,0.16)' : 'transparent',
                color: view === 'quarterly' ? '#60a5fa' : 'var(--text-muted)',
                border: `1px solid ${view === 'quarterly' ? 'rgba(59,130,246,0.45)' : 'var(--border-color)'}`,
              }}
            >
              Quarterly
            </button>
            <button
              type="button"
              onClick={() => { setView('yearly'); setSelectedIdx(-1); }}
              className="px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer"
              style={{
                background: view === 'yearly' ? 'rgba(59,130,246,0.16)' : 'transparent',
                color: view === 'yearly' ? '#60a5fa' : 'var(--text-muted)',
                border: `1px solid ${view === 'yearly' ? 'rgba(59,130,246,0.45)' : 'var(--border-color)'}`,
              }}
            >
              Yearly
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAllTable((prev) => !prev)}
          className="text-xs font-bold flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer hover:brightness-125"
          style={{ color: '#60a5fa', background: showAllTable ? 'rgba(59,130,246,0.12)' : 'transparent' }}
        >
          <span>{showAllTable ? 'Hide Statement' : 'All Financials'}</span>
          <span>{showAllTable ? '⌄' : '›'}</span>
        </button>
      </div>

      {/* ─── Main Chart Card (Groww/Tickertape Style) ─── */}
      {periods.length > 0 ? (
        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          {/* Selected Period Summary Header */}
          {activePeriod && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {activePeriod.label}
                </span>
                {activePeriod.netMarginPct !== null && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}
                  >
                    Net Margin: <strong style={{ color: activePeriod.netMarginPct >= 0 ? '#14b8a6' : '#ff4d6a' }}>{activePeriod.netMarginPct}%</strong>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-start gap-8">
                {/* Revenue Toggle + Value */}
                <button
                  type="button"
                  onClick={() => toggleSeries('revenue')}
                  className="text-left cursor-pointer transition-opacity"
                  style={{ opacity: showRevenue ? 1 : 0.45 }}
                  title="Click to toggle Revenue bars"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="w-3.5 h-3.5 rounded-[3px] flex items-center justify-center text-[9px] font-bold"
                      style={{
                        background: showRevenue ? '#64748b' : 'transparent',
                        border: '1px solid #64748b',
                        color: '#fff',
                      }}
                    >
                      {showRevenue ? '✓' : ''}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Revenue
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-extrabold" style={{ color: 'var(--text-primary)' }}>
                      {formatCroresValue(activePeriod.revenue)}
                    </span>
                    {activePeriod.revenueYoY !== null ? (
                      <ChangePct value={activePeriod.revenueYoY} tag="YoY" />
                    ) : activePeriod.revenueQoQ !== null ? (
                      <ChangePct value={activePeriod.revenueQoQ} tag="QoQ" />
                    ) : null}
                  </div>
                </button>

                {/* Profit Toggle + Value */}
                <button
                  type="button"
                  onClick={() => toggleSeries('profit')}
                  className="text-left cursor-pointer transition-opacity"
                  style={{ opacity: showProfit ? 1 : 0.45 }}
                  title="Click to toggle Profit bars"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="w-3.5 h-3.5 rounded-[3px] flex items-center justify-center text-[9px] font-bold"
                      style={{
                        background: showProfit ? '#00b386' : 'transparent',
                        border: '1px solid #00b386',
                        color: '#fff',
                      }}
                    >
                      {showProfit ? '✓' : ''}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Profit
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-extrabold" style={{ color: 'var(--text-primary)' }}>
                      {formatCroresValue(activePeriod.profit)}
                    </span>
                    {activePeriod.profitYoY !== null ? (
                      <ChangePct value={activePeriod.profitYoY} tag="YoY" />
                    ) : activePeriod.profitQoQ !== null ? (
                      <ChangePct value={activePeriod.profitQoQ} tag="QoQ" />
                    ) : null}
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Chart Body with Dashed Gridlines & Right-Side Y-Axis Labels */}
          <div className="relative flex">
            {/* Bars Plot Area */}
            <div className="relative flex-1" style={{ height: `${chartHeightPx}px` }}>
              {/* Horizontal Dashed Gridlines */}
              {ticks.map((t, i) => {
                const bottomPct = ((t - scaleMin) / totalRange) * 100;
                const isZero = Math.abs(t) < 1;
                return (
                  <div
                    key={i}
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{
                      bottom: `${bottomPct}%`,
                      borderBottom: isZero
                        ? '1px dashed rgba(148,163,184,0.35)'
                        : '1px dashed rgba(148,163,184,0.14)',
                    }}
                  />
                );
              })}

              {/* Columns for each period */}
              <div className="relative h-full flex items-stretch justify-around px-2 z-10">
                {periods.map((period, idx) => {
                  const isActive = idx === activeIdx;

                  const revPct = (Math.max(0, period.revenue) / totalRange) * 100;
                  const profPositive = period.profit >= 0;
                  const profHeightPct = (Math.abs(period.profit) / totalRange) * 100;

                  return (
                    <div
                      key={period.endDate}
                      onClick={() => setSelectedIdx(idx)}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      className="flex-1 relative cursor-pointer group flex justify-center items-end"
                    >
                      <div className="relative w-full h-full flex justify-center gap-1.5">
                        {/* Revenue Bar */}
                        {showRevenue && (
                          <div className="relative w-5 sm:w-7 h-full">
                            <div
                              className="absolute left-0 right-0 rounded-t-md transition-all duration-300"
                              style={{
                                bottom: `${zeroPctFromBottom}%`,
                                height: `${Math.max(1.5, revPct)}%`,
                                background: isActive ? '#64748b' : 'rgba(100,116,139,0.42)',
                              }}
                            />
                          </div>
                        )}

                        {/* Profit Bar (extends upward if positive, downward below zero if loss) */}
                        {showProfit && (
                          <div className="relative w-5 sm:w-7 h-full">
                            <div
                              className={`absolute left-0 right-0 transition-all duration-300 ${
                                profPositive ? 'rounded-t-md' : 'rounded-b-md'
                              }`}
                              style={{
                                bottom: profPositive
                                  ? `${zeroPctFromBottom}%`
                                  : `${Math.max(0, zeroPctFromBottom - profHeightPct)}%`,
                                height: `${Math.max(1.5, profHeightPct)}%`,
                                background: profPositive
                                  ? isActive ? '#00b386' : 'rgba(0,179,134,0.45)'
                                  : isActive ? '#ff4d6a' : 'rgba(255,77,106,0.5)',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Y-Axis Labels (in Crores) */}
            <div className="relative w-12 flex-shrink-0 pl-2" style={{ height: `${chartHeightPx}px` }}>
              {ticks.map((t, i) => {
                const bottomPct = ((t - scaleMin) / totalRange) * 100;
                return (
                  <span
                    key={i}
                    className="absolute right-0 text-[10px] font-medium tabular-nums"
                    style={{
                      bottom: `${bottomPct}%`,
                      transform: 'translateY(50%)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {formatAxisTickCr(t)}
                  </span>
                );
              })}
            </div>
          </div>

          {/* X-Axis Period Labels */}
          <div className="flex pr-12 mt-2.5">
            {periods.map((period, idx) => {
              const isActive = idx === activeIdx;
              return (
                <button
                  key={period.endDate}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  className="flex-1 text-center text-[11px] cursor-pointer transition-colors"
                  style={{
                    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: isActive ? 700 : 500,
                  }}
                >
                  {period.label}
                </button>
              );
            })}
          </div>
          <p className="text-[9px] text-right mt-2" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
            Values in ₹ Crores ({data.currency}) • Source: {data.yahooTicker}
          </p>
        </div>
      ) : (
        <div className="rounded-xl p-6 text-center border"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No {view} chart data available for {symbol}. Try switching between Quarterly and Yearly.
          </p>
        </div>
      )}

      {/* ─── Revenue Growth & Profit Growth Two-Column Summary ─── */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Revenue Growth Column */}
          <div className="md:pr-6 md:border-r" style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider mb-3"
              style={{ color: 'var(--text-muted)' }}>
              <span>Revenue Growth</span>
              <span>Value</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {data.revenueGrowth.ttm1YLabel}
                </span>
                <GrowthStatValue value={data.revenueGrowth.ttm1Y} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {data.revenueGrowth.cagrYears}Y CAGR
                </span>
                <GrowthStatValue value={data.revenueGrowth.cagr3Y} />
              </div>
            </div>
          </div>

          {/* Profit Growth Column */}
          <div>
            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider mb-3"
              style={{ color: 'var(--text-muted)' }}>
              <span>Profit Growth</span>
              <span>Value</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {data.profitGrowth.ttm1YLabel}
                </span>
                <GrowthStatValue value={data.profitGrowth.ttm1Y} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {data.profitGrowth.cagrYears}Y CAGR
                </span>
                <GrowthStatValue value={data.profitGrowth.cagr3Y} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Expandable "All Financials" Statement Table ─── */}
      {showAllTable && (
        <div
          className="rounded-xl p-5 space-y-5 animate-fade-in"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              📋 Detailed {view === 'quarterly' ? 'Quarterly' : 'Annual'} Income Statement
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
              All values in ₹ Crores except EPS
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <th className="text-left py-2.5 pr-4 font-bold uppercase text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Metric
                  </th>
                  {periods.map((p) => (
                    <th key={p.endDate} className="text-right py-2.5 px-2 font-bold text-[11px]" style={{ color: 'var(--text-primary)' }}>
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <td className="py-2.5 pr-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>Revenue</td>
                  {periods.map((p) => (
                    <td key={p.endDate} className="text-right py-2.5 px-2 font-bold text-white tabular-nums">
                      {formatCroresValue(p.revenue)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <td className="py-2.5 pr-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>Operating Profit</td>
                  {periods.map((p) => (
                    <td key={p.endDate} className="text-right py-2.5 px-2 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {p.operatingIncome !== null ? formatCroresValue(p.operatingIncome) : '—'}
                    </td>
                  ))}
                </tr>
                <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <td className="py-2.5 pr-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>EBITDA</td>
                  {periods.map((p) => (
                    <td key={p.endDate} className="text-right py-2.5 px-2 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {p.ebitda !== null ? formatCroresValue(p.ebitda) : '—'}
                    </td>
                  ))}
                </tr>
                <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <td className="py-2.5 pr-4 font-semibold" style={{ color: '#14b8a6' }}>Net Profit</td>
                  {periods.map((p) => (
                    <td
                      key={p.endDate}
                      className="text-right py-2.5 px-2 font-bold tabular-nums"
                      style={{ color: p.profit >= 0 ? '#00d68f' : '#ff4d6a' }}
                    >
                      {formatCroresValue(p.profit)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <td className="py-2.5 pr-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>Net Margin %</td>
                  {periods.map((p) => (
                    <td key={p.endDate} className="text-right py-2.5 px-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {p.netMarginPct !== null ? `${p.netMarginPct.toFixed(1)}%` : '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>Diluted EPS (₹)</td>
                  {periods.map((p) => (
                    <td key={p.endDate} className="text-right py-2.5 px-2 font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {p.eps !== null ? `₹${p.eps.toFixed(2)}` : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Annual Balance Sheet & Cash Flow Snapshot */}
          {data.latestAnnualHealth && (
            <div className="pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <p className="text-[10px] uppercase font-bold tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Cash Flow &amp; Balance Sheet Health (FY {data.latestAnnualHealth.asOfDate.slice(0, 4)})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Operating Cash Flow</p>
                  <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                    {data.latestAnnualHealth.operatingCashFlow !== null
                      ? formatCroresValue(data.latestAnnualHealth.operatingCashFlow)
                      : '—'}
                  </p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Free Cash Flow</p>
                  <p
                    className="text-sm font-bold mt-1"
                    style={{
                      color: data.latestAnnualHealth.freeCashFlow !== null
                        ? data.latestAnnualHealth.freeCashFlow >= 0 ? '#00d68f' : '#ff4d6a'
                        : 'var(--text-primary)',
                    }}
                  >
                    {data.latestAnnualHealth.freeCashFlow !== null
                      ? formatCroresValue(data.latestAnnualHealth.freeCashFlow)
                      : '—'}
                  </p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Total Debt</p>
                  <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                    {data.latestAnnualHealth.totalDebt !== null
                      ? formatCroresValue(data.latestAnnualHealth.totalDebt)
                      : '—'}
                  </p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Debt / Equity</p>
                  <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                    {data.latestAnnualHealth.debtToEquity !== null
                      ? `${data.latestAnnualHealth.debtToEquity.toFixed(2)}x`
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
