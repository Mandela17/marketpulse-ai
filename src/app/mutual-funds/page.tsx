'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CATEGORY_COLORS, RISK_COLORS } from '@/lib/mutualFundsData';

interface FundData {
  schemeCode: number;
  name: string;
  shortName: string;
  fundHouse: string;
  category: string;
  planType: string;
  risk: string;
  topHoldings?: { name: string; weight: number }[];
  nav: {
    currentNAV: number;
    navDate: string;
    returns: Record<string, number | null>;
    sparkline: number[];
  } | null;
}

const ALL_CATEGORIES = ['All', 'Large Cap', 'Mid Cap', 'Small Cap', 'Flexi Cap', 'ELSS', 'Index', 'Hybrid', 'Sectoral'];
const RETURN_PERIODS = ['1W', '1M', '3M', '6M', '1Y', '3Y', '5Y'] as const;

// Mini sparkline SVG component
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 100;
  const height = 32;
  const padding = 2;

  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((val - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MutualFundsPage() {
  const [funds, setFunds] = useState<FundData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedFund, setSelectedFund] = useState<FundData | null>(null);
  const [sortBy, setSortBy] = useState<string>('1Y');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Fetch all curated funds
  const fetchFunds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mutual-funds');
      const data = await res.json();
      if (data?.funds) {
        setFunds(data.funds);
      }
    } catch (err) {
      console.error('Failed to fetch funds:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchFunds(); }, [fetchFunds]);

  // Search
  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }

    setSearching(true);
    try {
      const res = await fetch(`/api/mutual-funds?action=search&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data?.results || []);
    } catch {}
    setSearching(false);
  };

  // Filter + sort
  const filtered = funds
    .filter(f => selectedCategory === 'All' || f.category === selectedCategory)
    .sort((a, b) => {
      const aRet = a.nav?.returns?.[sortBy] ?? -999;
      const bRet = b.nav?.returns?.[sortBy] ?? -999;
      return bRet - aRet;
    });

  // Category stats
  const categoryStats = ALL_CATEGORIES.slice(1).map(cat => {
    const catFunds = funds.filter(f => f.category === cat);
    const avg1Y = catFunds.reduce((s, f) => s + (f.nav?.returns?.['1Y'] ?? 0), 0) / (catFunds.length || 1);
    return { category: cat, count: catFunds.length, avg1Y };
  });

  return (
    <div style={{ minHeight: '100vh', padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
          💰 Mutual Funds
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Track returns, compare funds, and explore holdings of India&apos;s top mutual funds.
          <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 600 }}>
            Live NAV Data
          </span>
        </p>
      </div>

      {/* Category Overview Cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 10, marginBottom: 20,
      }}>
        {categoryStats.map(({ category, count, avg1Y }) => {
          const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['Large Cap'];
          const isActive = selectedCategory === category;
          return (
            <button
              key={category}
              onClick={() => setSelectedCategory(isActive ? 'All' : category)}
              style={{
                padding: '12px 14px', borderRadius: 12, border: `1px solid ${isActive ? colors.text : colors.border}`,
                background: isActive ? colors.bg : 'var(--bg-card)', cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.2s ease',
                transform: isActive ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {category}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: avg1Y >= 0 ? '#10b981' : '#ef4444', marginTop: 2 }}>
                {avg1Y > 0 ? '+' : ''}{avg1Y.toFixed(1)}%
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>
                Avg 1Y · {count} fund{count > 1 ? 's' : ''}
              </div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <input
          type="text"
          placeholder="🔍 Search mutual funds by name..."
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 12, fontSize: 14,
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            color: 'var(--text-primary)', outline: 'none',
          }}
        />
        {searchResults.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 12, marginTop: 4, maxHeight: 300, overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            {searchResults.map((r: any) => (
              <div
                key={r.schemeCode}
                style={{
                  padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.schemeName}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Code: {r.schemeCode}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sort Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sort by Return:</span>
        {RETURN_PERIODS.map(period => (
          <button
            key={period}
            onClick={() => setSortBy(period)}
            style={{
              padding: '4px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, transition: 'all 0.15s',
              background: sortBy === period ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
              color: sortBy === period ? '#818cf8' : 'var(--text-muted)',
            }}
          >
            {period}
          </button>
        ))}
        <button
          onClick={() => setSelectedCategory('All')}
          style={{
            marginLeft: 'auto', padding: '4px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)',
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
            background: 'transparent', color: 'var(--text-muted)',
          }}
        >
          Clear Filters
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{
            width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: '#6366f1', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
          }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Fetching live NAV data for {funds.length || 17} funds...</p>
        </div>
      )}

      {/* Fund Cards */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
          {filtered.map(fund => {
            const colors = CATEGORY_COLORS[fund.category] || CATEGORY_COLORS['Large Cap'];
            const riskColor = RISK_COLORS[fund.risk] || '#6b7280';
            const return1Y = fund.nav?.returns?.['1Y'];
            const sparkColor = (return1Y ?? 0) >= 0 ? '#10b981' : '#ef4444';

            return (
              <div
                key={fund.schemeCode}
                onClick={() => setSelectedFund(selectedFund?.schemeCode === fund.schemeCode ? null : fund)}
                style={{
                  borderRadius: 16, padding: '18px 20px',
                  background: 'var(--bg-card)', border: `1px solid ${selectedFund?.schemeCode === fund.schemeCode ? colors.text : 'var(--border-color)'}`,
                  cursor: 'pointer', transition: 'all 0.2s ease',
                  transform: selectedFund?.schemeCode === fund.schemeCode ? 'scale(1.01)' : 'scale(1)',
                }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                        background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                      }}>
                        {fund.category}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        background: `${riskColor}15`, color: riskColor,
                      }}>
                        {fund.risk}
                      </span>
                    </div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 2px', lineHeight: 1.3 }}>
                      {fund.shortName}
                    </h3>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>{fund.fundHouse}</p>
                  </div>

                  {/* Sparkline */}
                  {fund.nav?.sparkline && (
                    <Sparkline data={fund.nav.sparkline} color={sparkColor} />
                  )}
                </div>

                {/* NAV */}
                {fund.nav && (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
                      ₹{fund.nav.currentNAV.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      NAV · {fund.nav.navDate}
                    </span>
                  </div>
                )}

                {/* Returns Grid */}
                {fund.nav?.returns && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 12,
                    padding: '10px 0', borderTop: '1px solid var(--border-subtle)',
                  }}>
                    {RETURN_PERIODS.map(period => {
                      const ret = fund.nav?.returns?.[period];
                      const isPositive = (ret ?? 0) >= 0;
                      const isSorted = sortBy === period;
                      return (
                        <div key={period} style={{
                          textAlign: 'center',
                          background: isSorted ? 'rgba(99,102,241,0.06)' : 'transparent',
                          borderRadius: 6, padding: '4px 0',
                        }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{period}</div>
                          <div style={{
                            fontSize: 12, fontWeight: 800, marginTop: 2,
                            color: ret === null ? 'var(--text-muted)' : isPositive ? '#10b981' : '#ef4444',
                          }}>
                            {ret == null ? '—' : `${isPositive ? '+' : ''}${(ret ?? 0).toFixed(1)}%`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Expanded: Holdings */}
                {selectedFund?.schemeCode === fund.schemeCode && fund.topHoldings && (
                  <div style={{
                    marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)',
                    animation: 'fadeIn 0.2s ease',
                  }}>
                    <h4 style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      📊 Top 10 Holdings
                    </h4>
                    <div style={{ display: 'grid', gap: 4 }}>
                      {fund.topHoldings.map((holding, idx) => (
                        <div key={holding.name} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '5px 8px', borderRadius: 8,
                          background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        }}>
                          <span style={{
                            fontSize: 10, fontWeight: 800, width: 18, textAlign: 'center',
                            color: 'var(--text-muted)',
                          }}>
                            {idx + 1}
                          </span>
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {holding.name}
                          </span>
                          {/* Weight bar */}
                          <div style={{ width: 60, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 3,
                              width: `${Math.min(100, (holding.weight / 15) * 100)}%`,
                              background: colors.text,
                              transition: 'width 0.3s ease',
                            }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: colors.text, width: 40, textAlign: 'right' }}>
                            {holding.weight.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No NAV */}
                {!fund.nav && (
                  <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: 11 }}>
                    NAV data unavailable
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <p style={{ fontSize: 14, fontWeight: 600 }}>No funds found for this category.</p>
          <button onClick={() => setSelectedCategory('All')} style={{
            marginTop: 8, padding: '8px 20px', borderRadius: 10, border: 'none',
            background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 700,
            fontSize: 12, cursor: 'pointer',
          }}>
            Show All Funds
          </button>
        </div>
      )}

      {/* Disclaimer */}
      <div style={{
        marginTop: 32, padding: '12px 16px', borderRadius: 10,
        background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)',
        fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        <strong style={{ color: '#f59e0b' }}>⚠️ Disclaimer:</strong> Mutual fund investments are subject to market risks.
        Past performance is not indicative of future returns. NAV data sourced from AMFI via mfapi.in.
        Holdings data is approximate and may not reflect the latest portfolio.
        Please read scheme documents carefully before investing.
      </div>
    </div>
  );
}
