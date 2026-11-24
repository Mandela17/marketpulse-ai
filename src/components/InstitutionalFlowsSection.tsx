'use client';

import { useEffect, useState, useMemo } from 'react';
import { FIIDIIFlow } from '@/lib/fiiDiiData';
import Link from 'next/link';

// ─── Types ───
interface BlockDeal {
  id: string;
  symbol: string;
  timestamp: string;
  price: number;
  quantity: number;
  valueCr: number;
  buyerName: string;
  sellerName: string;
  dealType: 'Block' | 'Ultra Block';
  action: 'BUY' | 'SELL';
}

interface FIIDIIData {
  today: FIIDIIFlow | null;
  recent: FIIDIIFlow[];
}

type TabType = 'overview' | 'fii-dii' | 'block-deals';

// ─── Analysis Engine ───
function computeAnalysis(fiiDii: FIIDIIData | null, deals: BlockDeal[]) {
  const recent = fiiDii?.recent || [];
  const today = fiiDii?.today;

  // FII/DII cumulative flows
  const fii30dNet = recent.reduce((s, f) => s + f.fiiNet, 0);
  const dii30dNet = recent.reduce((s, f) => s + f.diiNet, 0);
  const fii7dNet = recent.slice(0, 7).reduce((s, f) => s + f.fiiNet, 0);
  const dii7dNet = recent.slice(0, 7).reduce((s, f) => s + f.diiNet, 0);
  const fiiBuyDays = recent.filter(f => f.fiiNet > 0).length;
  const fiiSellDays = recent.filter(f => f.fiiNet < 0).length;
  const diiBuyDays = recent.filter(f => f.diiNet > 0).length;
  const diiSellDays = recent.filter(f => f.diiNet < 0).length;

  // FII streak
  let fiiStreak = 0;
  if (recent.length > 0) {
    const dir = recent[0]?.fiiNet >= 0 ? 'buy' : 'sell';
    for (const f of recent) {
      if ((dir === 'buy' && f.fiiNet >= 0) || (dir === 'sell' && f.fiiNet < 0)) {
        fiiStreak++;
      } else break;
    }
    if (dir === 'sell') fiiStreak = -fiiStreak;
  }

  // Block deal stats
  const totalDealValue = deals.reduce((s, d) => s + d.valueCr, 0);
  const buyDeals = deals.filter(d => d.action === 'BUY');
  const sellDeals = deals.filter(d => d.action === 'SELL');
  const buyValue = buyDeals.reduce((s, d) => s + d.valueCr, 0);
  const sellValue = sellDeals.reduce((s, d) => s + d.valueCr, 0);
  const ultraBlockDeals = deals.filter(d => d.dealType === 'Ultra Block');

  // Top stocks by deal value
  const stockMap = new Map<string, number>();
  deals.forEach(d => stockMap.set(d.symbol, (stockMap.get(d.symbol) || 0) + d.valueCr));
  const topStocks = [...stockMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // ─── Generate Recommendation ───
  let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  const reasons: string[] = [];

  // FII flow signals
  if (fii30dNet > 5000) {
    reasons.push(`FII cumulative net buying ₹${(fii30dNet / 1000).toFixed(1)}K Cr (strong inflow)`);
    signal = 'BULLISH';
    confidence = 'HIGH';
  } else if (fii30dNet > 1000) {
    reasons.push(`FII net buying ₹${(fii30dNet / 1000).toFixed(1)}K Cr (moderate inflow)`);
    signal = 'BULLISH';
    confidence = 'MEDIUM';
  } else if (fii30dNet < -5000) {
    reasons.push(`FII cumulative net selling ₹${(Math.abs(fii30dNet) / 1000).toFixed(1)}K Cr (heavy outflow)`);
    signal = 'BEARISH';
    confidence = 'HIGH';
  } else if (fii30dNet < -1000) {
    reasons.push(`FII net selling ₹${(Math.abs(fii30dNet) / 1000).toFixed(1)}K Cr (moderate outflow)`);
    signal = 'BEARISH';
    confidence = 'MEDIUM';
  } else {
    reasons.push(`FII flows are range-bound at ₹${(fii30dNet / 1000).toFixed(1)}K Cr`);
  }

  // DII counter-flow
  if (fii30dNet < 0 && dii30dNet > 0) {
    reasons.push(`DII absorbing FII selling — net DII buying ₹${(dii30dNet / 1000).toFixed(1)}K Cr (domestic support)`);
    if (signal === 'BEARISH') {
      signal = 'NEUTRAL';
      confidence = 'MEDIUM';
    }
  } else if (fii30dNet > 0 && dii30dNet > 0) {
    reasons.push(`Both FII + DII buying — strong institutional consensus`);
    signal = 'BULLISH';
    confidence = 'HIGH';
  }

  // Streak signal
  if (Math.abs(fiiStreak) >= 5) {
    reasons.push(`FII ${fiiStreak > 0 ? 'buying' : 'selling'} streak: ${Math.abs(fiiStreak)} consecutive days`);
  }

  // 7-day momentum vs 30-day
  if (fii7dNet > 0 && fii30dNet < 0) {
    reasons.push('FII reversing from selling to buying in last 7 days — early trend change signal');
    signal = 'BULLISH';
    confidence = 'MEDIUM';
  } else if (fii7dNet < 0 && fii30dNet > 0) {
    reasons.push('FII reversing from buying to selling in last 7 days — caution');
    signal = 'BEARISH';
    confidence = 'MEDIUM';
  }

  // Block deal signals
  if (buyValue > sellValue * 1.5) {
    reasons.push(`Block deal bias: institutional buying (₹${buyValue.toFixed(0)} Cr) outpacing selling (₹${sellValue.toFixed(0)} Cr)`);
  } else if (sellValue > buyValue * 1.5) {
    reasons.push(`Block deal bias: institutional selling (₹${sellValue.toFixed(0)} Cr) dominating buys (₹${buyValue.toFixed(0)} Cr)`);
  }

  if (ultraBlockDeals.length >= 5) {
    reasons.push(`${ultraBlockDeals.length} ultra-block deals (₹50+ Cr each) — heavy institutional repositioning`);
  }

  return {
    fii30dNet, dii30dNet, fii7dNet, dii7dNet,
    fiiBuyDays, fiiSellDays, diiBuyDays, diiSellDays,
    fiiStreak,
    totalDealValue, buyDeals: buyDeals.length, sellDeals: sellDeals.length,
    buyValue, sellValue,
    ultraBlockDeals: ultraBlockDeals.length,
    topStocks,
    signal, confidence, reasons,
    today,
  };
}

// ─── Main Component ───
export default function InstitutionalFlowsSection() {
  const [fiiDiiData, setFiiDiiData] = useState<FIIDIIData | null>(null);
  const [deals, setDeals] = useState<BlockDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showAllDays, setShowAllDays] = useState(false);
  const [showAllDeals, setShowAllDeals] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [fiiRes, dealsRes] = await Promise.all([
          fetch(`/api/fii-dii?_t=${Date.now()}`, { cache: 'no-store' }),
          fetch(`/api/block-deals?limit=50&_t=${Date.now()}`, { cache: 'no-store' }),
        ]);
        const [fiiData, dealsData] = await Promise.all([fiiRes.json(), dealsRes.json()]);
        setFiiDiiData(fiiData);
        if (dealsData.success) setDeals(dealsData.deals || []);
      } catch (err) {
        console.error('[InstitutionalFlows] Fetch failed:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const analysis = useMemo(
    () => computeAnalysis(fiiDiiData, deals),
    [fiiDiiData, deals]
  );

  if (loading) {
    return (
      <div className="glass-card-static rounded-2xl p-6 animate-pulse mb-6">
        <div className="h-5 w-64 rounded mb-4" style={{ background: 'var(--border-color)' }} />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--border-color)' }} />
          ))}
        </div>
      </div>
    );
  }

  const recent = fiiDiiData?.recent || [];
  const today = analysis.today;

  const signalColors = {
    BULLISH: { bg: 'rgba(0,214,143,0.12)', color: '#00d68f', border: 'rgba(0,214,143,0.3)', emoji: '🟢' },
    BEARISH: { bg: 'rgba(255,77,106,0.12)', color: '#ff4d6a', border: 'rgba(255,77,106,0.3)', emoji: '🔴' },
    NEUTRAL: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.3)', emoji: '🟡' },
  };
  const sc = signalColors[analysis.signal];

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview & Analysis', icon: '📊' },
    { key: 'fii-dii', label: 'FII / DII Flows', icon: '🏛️' },
    { key: 'block-deals', label: 'Block Deals', icon: '💰' },
  ];

  // maxFlow for FII/DII bars
  const maxFlow = recent.length > 0
    ? Math.max(...recent.map(f => Math.max(Math.abs(f.fiiNet), Math.abs(f.diiNet))), 1) : 1;

  return (
    <div className="mb-6 animate-fade-in-up">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          🏛️ Institutional Money Flow
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2.5 py-1 rounded-full font-bold"
            style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
            {sc.emoji} {analysis.signal} — {analysis.confidence} Confidence
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {tabs.map(tab => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex-1 text-xs font-bold py-2 px-3 rounded-lg transition-all"
            style={{
              background: activeTab === tab.key ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: activeTab === tab.key ? '#60a5fa' : 'var(--text-muted)',
              border: activeTab === tab.key ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════ TAB: OVERVIEW ═══════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Signal Card */}
          <div className="glass-card-static rounded-2xl p-5" style={{ border: `1px solid ${sc.border}` }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="text-3xl font-black" style={{ color: sc.color }}>
                {sc.emoji}
              </div>
              <div>
                <p className="text-base font-black text-white">
                  Institutional Signal: {analysis.signal}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Confidence: {analysis.confidence} — Based on {recent.length}-day FII/DII flows + {deals.length} block deals
                </p>
              </div>
            </div>

            {/* Recommendation Reasons */}
            <div className="space-y-2">
              {analysis.reasons.map((reason, i) => (
                <div key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="text-[10px] mt-0.5 shrink-0" style={{ color: sc.color }}>▸</span>
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* FII 30D Net */}
            <div className="glass-card-static rounded-xl p-4">
              <p className="text-[9px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                FII {recent.length}D Net
              </p>
              <p className="text-lg font-black" style={{ color: analysis.fii30dNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
                {analysis.fii30dNet >= 0 ? '+' : ''}{(analysis.fii30dNet / 1000).toFixed(1)}K Cr
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {analysis.fiiBuyDays} buy / {analysis.fiiSellDays} sell days
              </p>
            </div>

            {/* DII 30D Net */}
            <div className="glass-card-static rounded-xl p-4">
              <p className="text-[9px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                DII {recent.length}D Net
              </p>
              <p className="text-lg font-black" style={{ color: analysis.dii30dNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
                {analysis.dii30dNet >= 0 ? '+' : ''}{(analysis.dii30dNet / 1000).toFixed(1)}K Cr
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {analysis.diiBuyDays} buy / {analysis.diiSellDays} sell days
              </p>
            </div>

            {/* Block Deal Volume */}
            <div className="glass-card-static rounded-xl p-4">
              <p className="text-[9px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                Block Deal Value
              </p>
              <p className="text-lg font-black text-white">
                ₹{analysis.totalDealValue.toFixed(0)} Cr
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {analysis.buyDeals} buy / {analysis.sellDeals} sell deals
              </p>
            </div>

            {/* FII Streak */}
            <div className="glass-card-static rounded-xl p-4">
              <p className="text-[9px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                FII Streak
              </p>
              <p className="text-lg font-black" style={{ color: analysis.fiiStreak >= 0 ? '#00d68f' : '#ff4d6a' }}>
                {analysis.fiiStreak > 0 ? '🔥' : analysis.fiiStreak < 0 ? '❄️' : '—'} {Math.abs(analysis.fiiStreak)}d
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {analysis.fiiStreak > 0 ? 'Consecutive buying' : analysis.fiiStreak < 0 ? 'Consecutive selling' : 'No streak'}
              </p>
            </div>
          </div>

          {/* Today's Flow Summary */}
          {today && (
            <div className="glass-card-static rounded-xl p-4">
              <p className="text-[10px] uppercase font-bold tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Today&apos;s Flow
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ background: 'rgba(59,130,246,0.1)' }}>
                    <span className="text-sm">🏦</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>FII / FPI</p>
                    <p className="text-sm font-black" style={{ color: today.fiiNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
                      {today.fiiNet >= 0 ? '+' : ''}{today.fiiNet.toLocaleString('en-IN')} Cr
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ background: 'rgba(139,92,246,0.1)' }}>
                    <span className="text-sm">🏛️</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>DII</p>
                    <p className="text-sm font-black" style={{ color: today.diiNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
                      {today.diiNet >= 0 ? '+' : ''}{today.diiNet.toLocaleString('en-IN')} Cr
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top Stocks in Block Deals */}
          {analysis.topStocks.length > 0 && (
            <div className="glass-card-static rounded-xl p-4">
              <p className="text-[10px] uppercase font-bold tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                🔥 Top Stocks by Block Deal Value
              </p>
              <div className="space-y-2">
                {analysis.topStocks.map(([symbol, value], i) => {
                  const pct = (value / analysis.totalDealValue) * 100;
                  return (
                    <div key={symbol} className="flex items-center gap-2">
                      <span className="text-[9px] w-4 text-right font-bold" style={{ color: 'var(--text-muted)' }}>
                        {i + 1}
                      </span>
                      <Link href={`/stock/${symbol}`}
                        className="text-xs font-bold text-white hover:text-blue-400 w-24 shrink-0">
                        {symbol}
                      </Link>
                      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${Math.max(pct, 3)}%`,
                          background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                        }} />
                      </div>
                      <span className="text-[10px] font-bold text-white w-16 text-right">₹{value.toFixed(0)} Cr</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB: FII/DII FLOWS ═══════════════════ */}
      {activeTab === 'fii-dii' && (
        <div className="glass-card-static rounded-2xl p-5">
          {/* Today's Flow */}
          {today && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>FII / FPI</p>
                <p className="text-lg font-black" style={{ color: today.fiiNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
                  {today.fiiNet >= 0 ? '+' : ''}{today.fiiNet.toLocaleString('en-IN')} Cr
                </p>
                <div className="flex gap-3 mt-1.5">
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Buy: <span style={{ color: '#00d68f' }}>{today.fiiBuy.toLocaleString('en-IN')}</span>
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Sell: <span style={{ color: '#ff4d6a' }}>{today.fiiSell.toLocaleString('en-IN')}</span>
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>DII</p>
                <p className="text-lg font-black" style={{ color: today.diiNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
                  {today.diiNet >= 0 ? '+' : ''}{today.diiNet.toLocaleString('en-IN')} Cr
                </p>
                <div className="flex gap-3 mt-1.5">
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Buy: <span style={{ color: '#00d68f' }}>{today.diiBuy.toLocaleString('en-IN')}</span>
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Sell: <span style={{ color: '#ff4d6a' }}>{today.diiSell.toLocaleString('en-IN')}</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Bar Chart */}
          {recent.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {showAllDays ? `Last ${recent.length} Days` : `Last ${Math.min(10, recent.length)} Days`} Net Flow (₹ Cr)
                </p>
                {recent.length > 10 && (
                  <button onClick={() => setShowAllDays(!showAllDays)}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full transition-all hover:opacity-80"
                    style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                    {showAllDays ? '▲ Show 10 days' : `▼ Show all ${recent.length} days`}
                  </button>
                )}
              </div>
              <div className={`space-y-1 ${showAllDays ? 'max-h-[500px] overflow-y-auto pr-1' : ''}`}
                style={showAllDays ? { scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' } : {}}>
                {(showAllDays ? recent : recent.slice(0, 10)).slice().reverse().map((flow, i) => {
                  const fiiPct = (Math.abs(flow.fiiNet) / maxFlow) * 100;
                  const diiPct = (Math.abs(flow.diiNet) / maxFlow) * 100;
                  const dayLabel = new Date(flow.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
                  return (
                    <div key={flow.date} className="flex items-center gap-2">
                      <span className="text-[9px] w-14 shrink-0 text-right" style={{ color: 'var(--text-muted)' }}>{dayLabel}</span>
                      <div className="flex-1 flex gap-0.5 items-center">
                        <div className="flex-1 h-3 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <div className="h-full rounded-sm transition-all duration-500" style={{
                            width: `${Math.max(fiiPct, 3)}%`,
                            background: flow.fiiNet >= 0 ? 'linear-gradient(90deg, #00d68f, #34d399)' : 'linear-gradient(90deg, #ff4d6a, #f87171)',
                          }} />
                        </div>
                        <span className="text-[8px] font-bold w-12 text-right shrink-0"
                          style={{ color: flow.fiiNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
                          {flow.fiiNet >= 0 ? '+' : ''}{(flow.fiiNet / 1000).toFixed(1)}k
                        </span>
                        <div className="flex-1 h-3 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <div className="h-full rounded-sm transition-all duration-500" style={{
                            width: `${Math.max(diiPct, 3)}%`,
                            background: flow.diiNet >= 0 ? 'linear-gradient(90deg, #818cf8, #a78bfa)' : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                          }} />
                        </div>
                        <span className="text-[8px] font-bold w-12 text-right shrink-0"
                          style={{ color: flow.diiNet >= 0 ? '#a78bfa' : '#f59e0b' }}>
                          {flow.diiNet >= 0 ? '+' : ''}{(flow.diiNet / 1000).toFixed(1)}k
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-1.5 text-[9px]" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-1">
                  <span className="font-semibold text-white/70">FII:</span>
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#00d68f' }} /> Buy
                  <span className="w-2 h-2 rounded-sm inline-block ml-1" style={{ background: '#ff4d6a' }} /> Sell
                </span>
                <span className="flex items-center gap-1">
                  <span className="font-semibold text-white/70">DII:</span>
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#a78bfa' }} /> Buy
                  <span className="w-2 h-2 rounded-sm inline-block ml-1" style={{ background: '#f59e0b' }} /> Sell
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB: BLOCK DEALS ═══════════════════ */}
      {activeTab === 'block-deals' && (
        <div className="glass-card-static rounded-2xl p-5">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="px-3 py-2 rounded-lg" style={{ background: 'rgba(0,214,143,0.06)', border: '1px solid rgba(0,214,143,0.1)' }}>
              <p className="text-[9px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Total Value</p>
              <p className="text-sm font-black text-white">₹{analysis.totalDealValue.toFixed(0)} Cr</p>
            </div>
            <div className="px-3 py-2 rounded-lg" style={{ background: 'rgba(0,214,143,0.06)', border: '1px solid rgba(0,214,143,0.1)' }}>
              <p className="text-[9px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Buys</p>
              <p className="text-sm font-black" style={{ color: '#00d68f' }}>{analysis.buyDeals} deals</p>
            </div>
            <div className="px-3 py-2 rounded-lg" style={{ background: 'rgba(255,77,106,0.06)', border: '1px solid rgba(255,77,106,0.1)' }}>
              <p className="text-[9px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Sells</p>
              <p className="text-sm font-black" style={{ color: '#ff4d6a' }}>{analysis.sellDeals} deals</p>
            </div>
          </div>

          {/* Toggle */}
          {deals.length > 10 && (
            <div className="flex justify-end mb-2">
              <button onClick={() => setShowAllDeals(!showAllDeals)}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full transition-all hover:opacity-80"
                style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                {showAllDeals ? '▲ Show 10 deals' : `▼ Show all ${deals.length} deals`}
              </button>
            </div>
          )}

          {/* Deal List */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            {(showAllDeals ? deals : deals.slice(0, 10)).map((deal) => {
              const isUltra = deal.dealType === 'Ultra Block';
              const isBuy = deal.action === 'BUY';
              const dateStr = new Date(deal.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
              const timeStr = new Date(deal.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

              return (
                <div key={deal.id} className="p-3 rounded-xl transition-all border border-white/[0.02] hover:border-white/10"
                  style={{ background: 'rgba(255,255,255,0.01)' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Link href={`/stock/${deal.symbol}`} className="text-xs font-black text-white hover:text-blue-400">
                        {deal.symbol}
                      </Link>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                        style={{
                          background: isBuy ? 'rgba(0,214,143,0.15)' : 'rgba(255,77,106,0.15)',
                          color: isBuy ? '#00d68f' : '#ff4d6a'
                        }}>
                        {deal.action}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                        style={{
                          background: isUltra ? 'rgba(251,191,36,0.15)' : 'rgba(59,130,246,0.15)',
                          color: isUltra ? '#fbbf24' : '#60a5fa',
                          border: `1px solid ${isUltra ? 'rgba(251,191,36,0.3)' : 'rgba(59,130,246,0.3)'}`
                        }}>
                        {deal.dealType}
                      </span>
                    </div>
                    <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{dateStr}, {timeStr}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Price: <span className="font-bold text-white">₹{deal.price.toLocaleString('en-IN')}</span>
                    </span>
                    <span className="font-extrabold text-sm" style={{ color: isUltra ? '#fbbf24' : '#ffffff' }}>
                      ₹{deal.valueCr.toFixed(2)} Cr
                    </span>
                  </div>
                  <div className="text-[10px] space-y-0.5 border-t border-white/[0.04] pt-1.5 mt-1.5" style={{ color: 'var(--text-muted)' }}>
                    <div className="flex justify-between">
                      <span>Buyer: <span className="text-white font-medium">{deal.buyerName}</span></span>
                    </div>
                    <div className="flex justify-between">
                      <span>Seller: <span className="text-white font-medium">{deal.sellerName}</span></span>
                    </div>
                    <div className="text-[9px] text-white/40">Shares: {deal.quantity.toLocaleString('en-IN')}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

