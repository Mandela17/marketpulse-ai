'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  officialCategory?: string; // from AMFI scheme_category
  isin?: string | null; // ISIN growth code
  nav: {
    currentNAV: number;
    navDate: string;
    returns: Record<string, number | null>;
    sparkline: number[];
  } | null;
}

const ALL_CATEGORIES = ['All', 'Large Cap', 'Mid Cap', 'Small Cap', 'Flexi Cap', 'ELSS', 'Index', 'Hybrid', 'Sectoral'];
const RETURN_PERIODS = ['1W', '1M', '3M', '6M', '1Y', '3Y', '5Y'] as const;

// ─── Sparkline with gradient fill ────────────────────────────────────
function Sparkline({ data, color, width = 80, height = 28 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const p = 2;
  const pts = data.map((v, i) => {
    const x = p + (i / (data.length - 1)) * (width - 2 * p);
    const y = height - p - ((v - min) / range) * (height - 2 * p);
    return `${x},${y}`;
  });
  const pathD = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt}`).join(' ');
  const areaD = `${pathD} L ${pts[pts.length - 1].split(',')[0]},${height} L ${pts[0].split(',')[0]},${height} Z`;
  const id = `g-${color.replace('#', '')}-${width}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${id})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Risk-o-Meter ────────────────────────────────────────────────────
function RiskOMeter({ risk }: { risk: string }) {
  const levels = ['Low', 'Moderate', 'High', 'Very High'];
  const idx = levels.indexOf(risk);
  const colors = ['#10b981', '#f59e0b', '#f97316', '#ef4444'];
  const angle = -90 + ((idx + 0.5) / levels.length) * 180; // -90 to 90

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width="80" height="48" viewBox="0 0 100 55">
        {/* Background arc segments */}
        {levels.map((_, i) => {
          const startAngle = -90 + (i / levels.length) * 180;
          const endAngle = -90 + ((i + 1) / levels.length) * 180;
          const r = 40;
          const x1 = 50 + r * Math.cos((startAngle * Math.PI) / 180);
          const y1 = 50 + r * Math.sin((startAngle * Math.PI) / 180);
          const x2 = 50 + r * Math.cos((endAngle * Math.PI) / 180);
          const y2 = 50 + r * Math.sin((endAngle * Math.PI) / 180);
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
              fill="none"
              stroke={i <= idx ? colors[i] : 'rgba(255,255,255,0.06)'}
              strokeWidth="8"
              strokeLinecap="round"
            />
          );
        })}
        {/* Needle */}
        <line
          x1="50" y1="50"
          x2={50 + 30 * Math.cos((angle * Math.PI) / 180)}
          y2={50 + 30 * Math.sin((angle * Math.PI) / 180)}
          stroke="white" strokeWidth="2" strokeLinecap="round"
        />
        <circle cx="50" cy="50" r="3" fill="white" />
      </svg>
      <span style={{ fontSize: 10, fontWeight: 700, color: colors[idx] || '#6b7280' }}>{risk} Risk</span>
    </div>
  );
}

// ─── SIP Calculator ──────────────────────────────────────────────────
function SIPCalculator() {
  const [monthly, setMonthly] = useState(5000);
  const [years, setYears] = useState(5);
  const [rate, setRate] = useState(12);

  const totalInvested = monthly * 12 * years;
  const r = rate / 100 / 12;
  const n = years * 12;
  const futureValue = r > 0 ? monthly * (((1 + r) ** n - 1) / r) * (1 + r) : totalInvested;
  const gains = futureValue - totalInvested;

  const investedPercent = (totalInvested / futureValue) * 100;

  return (
    <div style={{
      padding: '20px', borderRadius: 16, background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        📊 SIP Calculator
      </h3>

      <div style={{ display: 'grid', gap: 14 }}>
        {/* Monthly Investment */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Monthly Investment</label>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>₹{monthly.toLocaleString()}</span>
          </div>
          <input type="range" min="500" max="100000" step="500" value={monthly} onChange={e => setMonthly(+e.target.value)}
            style={{ width: '100%', accentColor: '#6366f1' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)' }}>
            <span>₹500</span><span>₹1,00,000</span>
          </div>
        </div>

        {/* Duration */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Time Period</label>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{years} years</span>
          </div>
          <input type="range" min="1" max="30" value={years} onChange={e => setYears(+e.target.value)}
            style={{ width: '100%', accentColor: '#6366f1' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)' }}>
            <span>1 yr</span><span>30 yrs</span>
          </div>
        </div>

        {/* Expected Return */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Expected Return (p.a.)</label>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{rate}%</span>
          </div>
          <input type="range" min="1" max="30" step="0.5" value={rate} onChange={e => setRate(+e.target.value)}
            style={{ width: '100%', accentColor: '#6366f1' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)' }}>
            <span>1%</span><span>30%</span>
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{ marginTop: 16, padding: '14px', borderRadius: 12, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.1)' }}>
        {/* Donut-like bar */}
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(16,185,129,0.2)', overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ height: '100%', width: `${investedPercent}%`, borderRadius: 4, background: '#6366f1' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Invested</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#6366f1' }}>₹{(totalInvested / 100000).toFixed(1)}L</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Gains</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981' }}>₹{(gains / 100000).toFixed(1)}L</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Total Value</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>₹{(futureValue / 100000).toFixed(1)}L</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Lumpsum Calculator ──────────────────────────────────────────────
function LumpsumCalculator() {
  const [amount, setAmount] = useState(100000);
  const [years, setYears] = useState(5);
  const [rate, setRate] = useState(12);

  const futureValue = amount * (1 + rate / 100) ** years;
  const gains = futureValue - amount;
  const investedPercent = (amount / futureValue) * 100;

  return (
    <div style={{
      padding: '20px', borderRadius: 16, background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        💵 Lumpsum Calculator
      </h3>

      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Investment Amount</label>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>₹{amount.toLocaleString()}</span>
          </div>
          <input type="range" min="10000" max="5000000" step="10000" value={amount} onChange={e => setAmount(+e.target.value)}
            style={{ width: '100%', accentColor: '#10b981' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)' }}>
            <span>₹10K</span><span>₹50L</span>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Time Period</label>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{years} years</span>
          </div>
          <input type="range" min="1" max="30" value={years} onChange={e => setYears(+e.target.value)}
            style={{ width: '100%', accentColor: '#10b981' }} />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Expected Return (p.a.)</label>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{rate}%</span>
          </div>
          <input type="range" min="1" max="30" step="0.5" value={rate} onChange={e => setRate(+e.target.value)}
            style={{ width: '100%', accentColor: '#10b981' }} />
        </div>
      </div>

      <div style={{ marginTop: 16, padding: '14px', borderRadius: 12, background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.1)' }}>
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(16,185,129,0.2)', overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ height: '100%', width: `${investedPercent}%`, borderRadius: 4, background: '#10b981' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Invested</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981' }}>₹{(amount / 100000).toFixed(1)}L</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Gains</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#6366f1' }}>₹{(gains / 100000).toFixed(1)}L</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Total Value</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>₹{(futureValue / 100000).toFixed(1)}L</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── "If You Invested" Simulator ─────────────────────────────────────
function IfYouInvested({ fund }: { fund: FundData }) {
  const amounts = [10000, 50000, 100000, 500000];
  const periods = [
    { label: '1Y', returnKey: '1Y' },
    { label: '3Y', returnKey: '3Y' },
    { label: '5Y', returnKey: '5Y' },
  ];

  return (
    <div style={{ marginTop: 12 }}>
      <h4 style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        💡 If You Had Invested...
      </h4>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 700, fontSize: 9, borderBottom: '1px solid var(--border-subtle)' }}>AMOUNT</th>
              {periods.map(p => (
                <th key={p.label} style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 700, fontSize: 9, borderBottom: '1px solid var(--border-subtle)' }}>
                  {p.label} AGO
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {amounts.map(amt => (
              <tr key={amt}>
                <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  ₹{(amt / 1000).toFixed(0)}K
                </td>
                {periods.map(p => {
                  const ret = fund.nav?.returns?.[p.returnKey];
                  if (ret == null) return <td key={p.label} style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)' }}>—</td>;

                  const yearsNum = parseInt(p.label);
                  const currentValue = amt * (1 + ret / 100) ** yearsNum;
                  const gain = currentValue - amt;
                  const isPos = gain >= 0;

                  return (
                    <td key={p.label} style={{ textAlign: 'right', padding: '6px 8px' }}>
                      <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>₹{(currentValue / 1000).toFixed(1)}K</div>
                      <div style={{ fontSize: 9, color: isPos ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {isPos ? '+' : ''}₹{(gain / 1000).toFixed(1)}K
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Fund Compare Modal ──────────────────────────────────────────────
function FundCompare({ funds, selected, onClose }: { funds: FundData[]; selected: number[]; onClose: () => void }) {
  const compareFunds = funds.filter(f => selected.includes(f.schemeCode));
  if (compareFunds.length < 2) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-primary)', borderRadius: 20, padding: 24,
        maxWidth: 700, width: '100%', maxHeight: '80vh', overflowY: 'auto',
        border: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>⚖️ Fund Comparison</h2>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%',
            width: 32, height: 32, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16,
          }}>✕</button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, borderBottom: '1px solid var(--border-subtle)' }}>METRIC</th>
              {compareFunds.map(f => (
                <th key={f.schemeCode} style={{ textAlign: 'center', padding: '10px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>
                  {f.shortName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Category', render: (f: FundData) => f.category },
              { label: 'Risk', render: (f: FundData) => f.risk },
              { label: 'NAV', render: (f: FundData) => f.nav ? `₹${f.nav.currentNAV.toFixed(2)}` : '—' },
              ...RETURN_PERIODS.map(p => ({
                label: `${p} Return`, render: (f: FundData) => {
                  const v = f.nav?.returns?.[p];
                  if (v == null) return '—';
                  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
                }
              })),
              { label: 'Fund House', render: (f: FundData) => f.fundHouse },
            ].map(row => (
              <tr key={row.label}>
                <td style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>{row.label}</td>
                {compareFunds.map(f => {
                  const val = row.render(f);
                  const isReturn = row.label.includes('Return');
                  const numVal = isReturn ? parseFloat(val.replace('+', '').replace('%', '')) : 0;
                  const isBest = isReturn && compareFunds.every(cf => {
                    const cv = cf.nav?.returns?.[row.label.split(' ')[0]];
                    return cv == null || numVal >= cv;
                  });
                  return (
                    <td key={f.schemeCode} style={{
                      textAlign: 'center', padding: '8px 12px', fontSize: 12, fontWeight: 700,
                      color: isReturn ? (numVal >= 0 ? '#10b981' : '#ef4444') : 'var(--text-secondary)',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: isBest ? 'rgba(16,185,129,0.06)' : 'transparent',
                    }}>
                      {val} {isBest && numVal > 0 && <span style={{ fontSize: 8 }}>👑</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function MutualFundsPage() {
  const [funds, setFunds] = useState<FundData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expandedFund, setExpandedFund] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<string>('1Y');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<'explore' | 'sip' | 'lumpsum'>('explore');
  const [compareList, setCompareList] = useState<number[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState<number | null>(null);

  const fetchFunds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mutual-funds');
      const data = await res.json();
      if (data?.funds) setFunds(data.funds);
    } catch (err) { console.error('Failed to fetch funds:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchFunds(); }, [fetchFunds]);

  const [searching, setSearching] = useState(false);

  // External search (debounced)
  useEffect(() => {
    if (searchQuery.length < 3) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mutual-funds?action=search&q=${encodeURIComponent(searchQuery)}`);
        const d = await res.json();
        setSearchResults(d?.results || []);
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Add fund from external search result
  const addFundFromSearch = async (schemeCode: number, schemeName: string) => {
    // Check if already in list
    if (funds.find(f => f.schemeCode === schemeCode)) {
      setSearchQuery('');
      setSearchResults([]);
      setSearchFocused(false);
      setExpandedFund(schemeCode);
      setSelectedCategory('All');
      return;
    }

    setLoadingSearch(schemeCode);
    setSearchResults([]);
    setSearchFocused(false);
    setSearchQuery('');
    setSelectedCategory('All');

    try {
      const res = await fetch(`/api/mutual-funds?action=detail&code=${schemeCode}`);
      const data = await res.json();

      const apiMeta = data?.apiMeta;

      // Use AMFI's official scheme_category if available
      let category = 'Flexi Cap';
      const schemeCategory = (apiMeta?.scheme_category || '').toLowerCase();
      const nameLower = schemeName.toLowerCase();

      if (schemeCategory.includes('large cap') || nameLower.includes('large cap') || nameLower.includes('bluechip')) category = 'Large Cap';
      else if (schemeCategory.includes('small cap') || nameLower.includes('small cap')) category = 'Small Cap';
      else if (schemeCategory.includes('mid cap') || nameLower.includes('mid cap') || nameLower.includes('midcap')) category = 'Mid Cap';
      else if (schemeCategory.includes('elss') || nameLower.includes('elss') || nameLower.includes('tax saver')) category = 'ELSS';
      else if (schemeCategory.includes('index') || nameLower.includes('index') || nameLower.includes('nifty') || nameLower.includes('sensex')) category = 'Index';
      else if (schemeCategory.includes('hybrid') || schemeCategory.includes('balanced') || nameLower.includes('hybrid') || nameLower.includes('balanced')) category = 'Hybrid';
      else if (schemeCategory.includes('debt') || schemeCategory.includes('liquid') || schemeCategory.includes('money market') || nameLower.includes('liquid') || nameLower.includes('bond')) category = 'Debt';
      else if (schemeCategory.includes('sectoral') || schemeCategory.includes('thematic') || nameLower.includes('pharma') || nameLower.includes('banking') || nameLower.includes('technology') || nameLower.includes('infra')) category = 'Sectoral';
      else if (schemeCategory.includes('flexi') || schemeCategory.includes('multi')) category = 'Flexi Cap';

      const riskMap: Record<string, string> = { 'Large Cap': 'Moderate', 'Mid Cap': 'High', 'Small Cap': 'Very High', 'Flexi Cap': 'High', 'ELSS': 'High', 'Index': 'Moderate', 'Hybrid': 'Moderate', 'Debt': 'Low', 'Sectoral': 'Very High' };

      // Clean short name
      const shortName = schemeName
        .replace(/\s*-\s*Direct\s*(Plan)?\s*/i, ' ')
        .replace(/\s*-\s*Growth\s*(Option)?\s*/i, '')
        .replace(/\s*-\s*IDCW\s*/i, '')
        .replace(/\s*(Mutual\s*Fund)\s*/i, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Use fund_house from AMFI meta
      const fundHouse = apiMeta?.fund_house || schemeName.split(/\s+(Fund|Mutual|Small|Large|Mid|Flexi|ELSS)/i)[0] + ' Mutual Fund';

      // Official category from AMFI
      const officialCategory = apiMeta?.scheme_category || category;

      const newFund: FundData = {
        schemeCode,
        name: schemeName,
        shortName: shortName.length > 40 ? shortName.substring(0, 38) + '…' : shortName,
        fundHouse,
        category,
        planType: 'Direct',
        risk: riskMap[category] || 'High',
        nav: data?.nav || null,
        officialCategory: officialCategory,
        isin: apiMeta?.isin_growth || null,
      };

      setFunds(prev => [newFund, ...prev]);
      setExpandedFund(schemeCode);
    } catch (err) {
      console.error('Failed to load fund:', err);
    }
    setLoadingSearch(null);
  };

  const filtered = useMemo(() => {
    let r = funds;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter(f =>
        f.shortName.toLowerCase().includes(q) || f.name.toLowerCase().includes(q) ||
        f.fundHouse.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
      );
    }
    if (selectedCategory !== 'All') r = r.filter(f => f.category === selectedCategory);
    return r.sort((a, b) => (b.nav?.returns?.[sortBy] ?? -999) - (a.nav?.returns?.[sortBy] ?? -999));
  }, [funds, searchQuery, selectedCategory, sortBy]);

  const categoryStats = useMemo(() =>
    ALL_CATEGORIES.slice(1).map(cat => {
      const cf = funds.filter(f => f.category === cat);
      const avg = cf.length > 0 ? cf.reduce((s, f) => s + (f.nav?.returns?.['1Y'] ?? 0), 0) / cf.length : 0;
      return { category: cat, count: cf.length, avg1Y: avg };
    }), [funds]);

  const topPerformers = useMemo(() =>
    [...funds].filter(f => f.nav?.returns?.['1Y'] != null)
      .sort((a, b) => (b.nav?.returns?.['1Y'] ?? 0) - (a.nav?.returns?.['1Y'] ?? 0))
      .slice(0, 3), [funds]);

  const toggleCompare = (code: number) => {
    setCompareList(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : prev.length < 3 ? [...prev, code] : prev
    );
  };

  return (
    <div style={{ minHeight: '100vh', padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ─── Header ─────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            💰 Mutual Funds
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(59,130,246,0.15))', color: '#10b981' }}>LIVE NAV</span>
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, margin: 0 }}>
            {funds.length} Direct-Growth funds · Real-time NAV · SIP & Lumpsum calculators
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {compareList.length >= 2 && (
            <button onClick={() => setShowCompare(true)} style={{
              padding: '8px 16px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white',
              cursor: 'pointer', fontSize: 12, fontWeight: 700,
            }}>
              ⚖️ Compare ({compareList.length})
            </button>
          )}
          <button onClick={fetchFunds} disabled={loading} style={{
            padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer',
            fontSize: 12, fontWeight: 600,
          }}>
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>
      </div>

      {/* ─── Tab Switcher ───────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20, padding: 4, borderRadius: 14,
        background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)',
        width: 'fit-content',
      }}>
        {([
          { key: 'explore', label: '🔍 Explore Funds', icon: '' },
          { key: 'sip', label: '📊 SIP Calculator', icon: '' },
          { key: 'lumpsum', label: '💵 Lumpsum Calculator', icon: '' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
            background: activeTab === tab.key ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: activeTab === tab.key ? '#818cf8' : 'var(--text-muted)',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── SIP Calculator Tab ─────────────────────────── */}
      {activeTab === 'sip' && (
        <div style={{ maxWidth: 500 }}>
          <SIPCalculator />
        </div>
      )}

      {/* ─── Lumpsum Calculator Tab ─────────────────────── */}
      {activeTab === 'lumpsum' && (
        <div style={{ maxWidth: 500 }}>
          <LumpsumCalculator />
        </div>
      )}

      {/* ─── Explore Funds Tab ──────────────────────────── */}
      {activeTab === 'explore' && (
        <>
          {/* Top Performers */}
          {!loading && topPerformers.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 20 }}>
              {topPerformers.map((fund, idx) => {
                const ret1Y = fund.nav?.returns?.['1Y'] ?? 0;
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <div key={fund.schemeCode} style={{
                    padding: '14px 18px', borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(59,130,246,0.04))',
                    border: '1px solid rgba(16,185,129,0.15)',
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}>
                    <span style={{ fontSize: 28 }}>{medals[idx]}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fund.shortName}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fund.category} · {fund.fundHouse}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>+{ret1Y.toFixed(1)}%</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>1Y CAGR</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 16, zIndex: 50 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderRadius: 14,
              background: 'var(--bg-card)', border: `1px solid ${searchFocused ? 'rgba(99,102,241,0.4)' : 'var(--border-color)'}`,
              transition: 'border-color 0.2s',
            }}>
              <span style={{ fontSize: 16 }}>🔍</span>
              <input type="text" placeholder="Search by fund name, house, or category..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)} onBlur={() => setTimeout(() => setSearchFocused(false), 300)}
                style={{ flex: 1, padding: '14px 0', fontSize: 14, fontWeight: 500, background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
              />
              {searching && (
                <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.06)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              )}
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} style={{
                  background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%',
                  width: 22, height: 22, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>✕</button>
              )}
            </div>
            {searchFocused && searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 9999,
                background: '#0f1729', border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 14, maxHeight: 280, overflowY: 'auto',
                boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
              }}>
                <div style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(99,102,241,0.05)' }}>
                  Click to load fund data ({searchResults.length} results)
                </div>
                {searchResults.map((r: any) => (
                  <div key={r.schemeCode}
                    onClick={() => addFundFromSearch(r.schemeCode, r.schemeName)}
                    style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>{r.schemeName}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Code: {r.schemeCode}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', flexShrink: 0, padding: '4px 10px', borderRadius: 6, background: 'rgba(99,102,241,0.1)' }}>
                      {loadingSearch === r.schemeCode ? '⏳ Loading...' : '+ Add'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Category Pills */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
            {ALL_CATEGORIES.map(cat => {
              const isA = selectedCategory === cat;
              const c = cat === 'All' ? { bg: 'rgba(99,102,241,0.12)', text: '#818cf8', border: 'rgba(99,102,241,0.25)' } : (CATEGORY_COLORS[cat] || CATEGORY_COLORS['Large Cap']);
              const st = categoryStats.find(s => s.category === cat);
              return (
                <button key={cat} onClick={() => setSelectedCategory(cat)} style={{
                  padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                  background: isA ? c.bg : 'rgba(255,255,255,0.03)',
                  color: isA ? c.text : 'var(--text-muted)',
                  boxShadow: isA ? `0 0 0 1px ${c.border}` : 'none',
                }}>
                  {cat}{st && <span style={{ marginLeft: 4, opacity: 0.6 }}>({st.count})</span>}
                </button>
              );
            })}
          </div>

          {/* Sort + Count Bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, padding: '8px 14px',
            borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginRight: 4 }}>SORT:</span>
            {RETURN_PERIODS.map(p => (
              <button key={p} onClick={() => setSortBy(p)} style={{
                padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                background: sortBy === p ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: sortBy === p ? '#818cf8' : 'var(--text-muted)',
              }}>{p}</button>
            ))}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {filtered.length} fund{filtered.length !== 1 ? 's' : ''}
              {compareList.length > 0 && ` · ${compareList.length} selected`}
            </span>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{
                width: 44, height: 44, border: '3px solid rgba(255,255,255,0.06)',
                borderTopColor: '#6366f1', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
              }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>Loading live NAV data...</p>
            </div>
          )}
          {/* Loading search fund */}
          {loadingSearch && (
            <div style={{
              padding: '14px 20px', borderRadius: 14, marginBottom: 10,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.04))',
              border: '1px solid rgba(99,102,241,0.2)',
              display: 'flex', alignItems: 'center', gap: 12,
              animation: 'fadeIn 0.2s ease',
            }}>
              <div style={{
                width: 20, height: 20, border: '2px solid rgba(255,255,255,0.06)',
                borderTopColor: '#6366f1', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Loading fund data from AMFI...
              </span>
            </div>
          )}

          {/* Fund Cards */}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(fund => {
                const colors = CATEGORY_COLORS[fund.category] || CATEGORY_COLORS['Large Cap'];
                const riskColor = RISK_COLORS[fund.risk] || '#6b7280';
                const ret1Y = fund.nav?.returns?.['1Y'] ?? 0;
                const sparkColor = ret1Y >= 0 ? '#10b981' : '#ef4444';
                const isExpanded = expandedFund === fund.schemeCode;
                const isCompared = compareList.includes(fund.schemeCode);

                return (
                  <div key={fund.schemeCode}>
                    <div style={{
                      borderRadius: isExpanded ? '16px 16px 0 0' : 16, padding: '16px 20px',
                      background: isExpanded ? 'rgba(99,102,241,0.04)' : 'var(--bg-card)',
                      border: `1px solid ${isExpanded ? 'rgba(99,102,241,0.2)' : isCompared ? 'rgba(168,85,247,0.3)' : 'var(--border-color)'}`,
                      borderBottom: isExpanded ? '1px dashed var(--border-subtle)' : undefined,
                      transition: 'all 0.15s',
                    }}>
                      {/* Top Row */}
                      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                        {/* Compare checkbox */}
                        <div onClick={e => { e.stopPropagation(); toggleCompare(fund.schemeCode); }} style={{
                          width: 20, height: 20, borderRadius: 6, marginTop: 2, cursor: 'pointer', flexShrink: 0,
                          border: `2px solid ${isCompared ? '#a855f7' : 'rgba(255,255,255,0.12)'}`,
                          background: isCompared ? 'rgba(168,85,247,0.2)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: '#a855f7',
                        }}>
                          {isCompared && '✓'}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setExpandedFund(isExpanded ? null : fund.schemeCode)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, textTransform: 'uppercase', letterSpacing: 0.3 }}>{fund.category}</span>
                            <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: `${riskColor}12`, color: riskColor }}>{fund.risk}</span>
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fund.shortName}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{fund.fundHouse}</div>
                        </div>

                        {/* NAV + Sparkline */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                          {fund.nav?.sparkline && <Sparkline data={fund.nav.sparkline} color={sparkColor} width={80} height={32} />}
                          {fund.nav && (
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>₹{fund.nav.currentNAV.toFixed(2)}</div>
                              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{fund.nav.navDate}</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Returns Row */}
                      {fund.nav?.returns && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 14, overflowX: 'auto' }}>
                          {RETURN_PERIODS.map(p => {
                            const v = fund.nav?.returns?.[p] ?? null;
                            const isPos = (v ?? 0) >= 0;
                            return (
                              <div key={p} style={{
                                flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 8, minWidth: 44,
                                background: sortBy === p ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.015)',
                              }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)' }}>{p}</div>
                                <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2, color: v == null ? 'var(--text-muted)' : isPos ? '#10b981' : '#ef4444' }}>
                                  {v == null ? '—' : `${isPos ? '+' : ''}${(v ?? 0).toFixed(1)}%`}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div style={{
                        padding: '20px', borderRadius: '0 0 16px 16px',
                        background: 'rgba(15,20,42,0.5)', border: '1px solid rgba(99,102,241,0.15)', borderTop: 'none',
                        animation: 'fadeIn 0.2s ease',
                      }}>
                        {/* Fund Info Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                          {[
                            { label: 'Fund House', value: fund.fundHouse, icon: '🏦' },
                            { label: 'Category', value: fund.officialCategory || fund.category, icon: '📂' },
                            { label: 'Plan', value: `${fund.planType} · Growth`, icon: '📋' },
                            { label: 'NAV', value: fund.nav ? `₹${fund.nav.currentNAV.toFixed(2)}` : '—', icon: '💰' },
                            { label: 'Scheme Code', value: `${fund.schemeCode}`, icon: '🔢' },
                            ...(fund.isin ? [{ label: 'ISIN', value: fund.isin, icon: '🏷️' }] : []),
                          ].map(item => (
                            <div key={item.label} style={{
                              padding: '10px 12px', borderRadius: 10,
                              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                            }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                                {item.icon} {item.label}
                              </div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                                {item.value}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                          {/* Risk-o-Meter */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
                            <RiskOMeter risk={fund.risk} />
                          </div>

                          {/* Holdings */}
                          {fund.topHoldings ? (
                            <div>
                              <h4 style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>📊 Top Holdings</h4>
                              {fund.topHoldings.slice(0, 7).map((h, i) => (
                                <div key={h.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11 }}>
                                  <span style={{ color: 'var(--text-muted)', width: 14, fontWeight: 700, fontSize: 10 }}>{i + 1}</span>
                                  <span style={{ flex: 1, color: 'var(--text-secondary)', fontWeight: 600 }}>{h.name}</span>
                                  <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.min(100, (h.weight / 20) * 100)}%`, background: colors.text, borderRadius: 2 }} />
                                  </div>
                                  <span style={{ fontWeight: 700, color: colors.text, width: 32, textAlign: 'right', fontSize: 10 }}>{h.weight.toFixed(1)}%</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 0', gap: 8 }}>
                              <div style={{ fontSize: 28 }}>📊</div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>Holdings data not available via API</div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>Check the fund factsheet on<br/><span style={{ color: '#818cf8', fontWeight: 600 }}>{fund.fundHouse}</span> website</div>
                            </div>
                          )}
                        </div>

                        {/* If You Invested */}
                        <IfYouInvested fund={fund} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty */}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>No funds match your search</p>
              <button onClick={() => { setSearchQuery(''); setSelectedCategory('All'); }} style={{
                marginTop: 12, padding: '10px 24px', borderRadius: 10, border: 'none',
                background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}>Clear Filters</button>
            </div>
          )}
        </>
      )}

      {/* Fund Compare Modal */}
      {showCompare && <FundCompare funds={funds} selected={compareList} onClose={() => setShowCompare(false)} />}

      {/* Compare FAB */}
      {compareList.length >= 2 && !showCompare && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 50,
          padding: '12px 24px', borderRadius: 16,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white',
          fontWeight: 700, fontSize: 13, cursor: 'pointer',
          boxShadow: '0 8px 30px rgba(99,102,241,0.4)',
          animation: 'fadeIn 0.2s ease',
        }} onClick={() => setShowCompare(true)}>
          ⚖️ Compare {compareList.length} Funds
        </div>
      )}

      {/* Disclaimer */}
      <div style={{
        marginTop: 32, padding: '14px 18px', borderRadius: 12,
        background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.12)',
        fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7,
      }}>
        <strong style={{ color: '#f59e0b' }}>⚠️ Disclaimer:</strong> Mutual fund investments are subject to market risks.
        Past performance is not indicative of future returns. NAV data sourced from AMFI via mfapi.in.
        Holdings data is approximate. Please read scheme documents carefully before investing.
      </div>
    </div>
  );
}
