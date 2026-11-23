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

// ─── Analysis Engine ───
function computeAnalysis(fiiDii: FIIDIIData | null, deals: BlockDeal[]) {
  const recent = fiiDii?.recent || [];
  const today = fiiDii?.today;

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
      if ((dir === 'buy' && f.fiiNet >= 0) || (dir === 'sell' && f.fiiNet < 0)) fiiStreak++;
      else break;
    }
    if (dir === 'sell') fiiStreak = -fiiStreak;
  }

  // DII streak
  let diiStreak = 0;
  if (recent.length > 0) {
    const dir = recent[0]?.diiNet >= 0 ? 'buy' : 'sell';
    for (const f of recent) {
      if ((dir === 'buy' && f.diiNet >= 0) || (dir === 'sell' && f.diiNet < 0)) diiStreak++;
      else break;
    }
    if (dir === 'sell') diiStreak = -diiStreak;
  }

  // Block deal stats
  const totalDealValue = deals.reduce((s, d) => s + d.valueCr, 0);
  const buyDeals = deals.filter(d => d.action === 'BUY');
  const sellDeals = deals.filter(d => d.action === 'SELL');
  const buyValue = buyDeals.reduce((s, d) => s + d.valueCr, 0);
  const sellValue = sellDeals.reduce((s, d) => s + d.valueCr, 0);
  const ultraBlockDeals = deals.filter(d => d.dealType === 'Ultra Block');

  // Top stocks
  const stockMap = new Map<string, { buy: number; sell: number; total: number }>();
  deals.forEach(d => {
    const prev = stockMap.get(d.symbol) || { buy: 0, sell: 0, total: 0 };
    if (d.action === 'BUY') prev.buy += d.valueCr;
    else prev.sell += d.valueCr;
    prev.total += d.valueCr;
    stockMap.set(d.symbol, prev);
  });
  const topStocks = [...stockMap.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10);

  // Top institutions
  const instMap = new Map<string, { buy: number; sell: number; deals: number }>();
  deals.forEach(d => {
    const buyer = instMap.get(d.buyerName) || { buy: 0, sell: 0, deals: 0 };
    buyer.buy += d.valueCr; buyer.deals++;
    instMap.set(d.buyerName, buyer);
    const seller = instMap.get(d.sellerName) || { buy: 0, sell: 0, deals: 0 };
    seller.sell += d.valueCr; seller.deals++;
    instMap.set(d.sellerName, seller);
  });
  const topInstitutions = [...instMap.entries()]
    .map(([name, v]) => ({ name, net: v.buy - v.sell, buy: v.buy, sell: v.sell, deals: v.deals }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    .slice(0, 10);

  // ─── Signal ───
  let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  const reasons: string[] = [];

  if (fii30dNet > 5000) {
    reasons.push(`FII cumulative net buying ₹${(fii30dNet / 1000).toFixed(1)}K Cr (strong inflow)`);
    signal = 'BULLISH'; confidence = 'HIGH';
  } else if (fii30dNet > 1000) {
    reasons.push(`FII net buying ₹${(fii30dNet / 1000).toFixed(1)}K Cr (moderate inflow)`);
    signal = 'BULLISH'; confidence = 'MEDIUM';
  } else if (fii30dNet < -5000) {
    reasons.push(`FII cumulative net selling ₹${(Math.abs(fii30dNet) / 1000).toFixed(1)}K Cr (heavy outflow)`);
    signal = 'BEARISH'; confidence = 'HIGH';
  } else if (fii30dNet < -1000) {
    reasons.push(`FII net selling ₹${(Math.abs(fii30dNet) / 1000).toFixed(1)}K Cr (moderate outflow)`);
    signal = 'BEARISH'; confidence = 'MEDIUM';
  } else {
    reasons.push(`FII flows are range-bound at ₹${(fii30dNet / 1000).toFixed(1)}K Cr`);
  }

  if (fii30dNet < 0 && dii30dNet > 0) {
    reasons.push(`DII absorbing FII selling — net DII buying ₹${(dii30dNet / 1000).toFixed(1)}K Cr (domestic support)`);
    if (signal === 'BEARISH') { signal = 'NEUTRAL'; confidence = 'MEDIUM'; }
  } else if (fii30dNet > 0 && dii30dNet > 0) {
    reasons.push('Both FII + DII buying — strong institutional consensus');
    signal = 'BULLISH'; confidence = 'HIGH';
  }

  if (Math.abs(fiiStreak) >= 5)
    reasons.push(`FII ${fiiStreak > 0 ? 'buying' : 'selling'} streak: ${Math.abs(fiiStreak)} consecutive days`);
  if (Math.abs(diiStreak) >= 5)
    reasons.push(`DII ${diiStreak > 0 ? 'buying' : 'selling'} streak: ${Math.abs(diiStreak)} consecutive days`);

  if (fii7dNet > 0 && fii30dNet < 0) {
    reasons.push('FII reversing from selling to buying in last 7 days — early trend change signal');
    signal = 'BULLISH'; confidence = 'MEDIUM';
  } else if (fii7dNet < 0 && fii30dNet > 0) {
    reasons.push('FII reversing from buying to selling in last 7 days — caution');
    signal = 'BEARISH'; confidence = 'MEDIUM';
  }

  if (buyValue > sellValue * 1.5)
    reasons.push(`Block deal bias: buying (₹${buyValue.toFixed(0)} Cr) outpacing selling (₹${sellValue.toFixed(0)} Cr)`);
  else if (sellValue > buyValue * 1.5)
    reasons.push(`Block deal bias: selling (₹${sellValue.toFixed(0)} Cr) dominating buys (₹${buyValue.toFixed(0)} Cr)`);

  if (ultraBlockDeals.length >= 5)
    reasons.push(`${ultraBlockDeals.length} ultra-block deals (₹50+ Cr each) — heavy institutional repositioning`);

  return {
    fii30dNet, dii30dNet, fii7dNet, dii7dNet,
    fiiBuyDays, fiiSellDays, diiBuyDays, diiSellDays,
    fiiStreak, diiStreak,
    totalDealValue, buyDeals: buyDeals.length, sellDeals: sellDeals.length,
    buyValue, sellValue,
    ultraBlockDeals: ultraBlockDeals.length,
    topStocks, topInstitutions,
    signal, confidence, reasons, today,
  };
}

// ─── Page Component ───
export default function InstitutionalFlowsPage() {
  const [fiiDiiData, setFiiDiiData] = useState<FIIDIIData | null>(null);
  const [deals, setDeals] = useState<BlockDeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [fiiRes, dealsRes] = await Promise.all([
          fetch(`/api/fii-dii?_t=${Date.now()}`, { cache: 'no-store' }),
          fetch(`/api/block-deals?limit=100&_t=${Date.now()}`, { cache: 'no-store' }),
        ]);
        const [fiiData, dealsData] = await Promise.all([fiiRes.json(), dealsRes.json()]);
        setFiiDiiData(fiiData);
        if (dealsData.success) setDeals(dealsData.deals || []);
      } catch (err) {
        console.error('[Institutional] Fetch failed:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const analysis = useMemo(() => computeAnalysis(fiiDiiData, deals), [fiiDiiData, deals]);
  const recent = fiiDiiData?.recent || [];
  const today = analysis.today;
  const maxFlow = recent.length > 0
    ? Math.max(...recent.map(f => Math.max(Math.abs(f.fiiNet), Math.abs(f.diiNet))), 1) : 1;

  const signalColors = {
    BULLISH: { bg: 'rgba(0,214,143,0.12)', color: '#00d68f', border: 'rgba(0,214,143,0.3)', emoji: '🟢', gradient: 'linear-gradient(135deg, rgba(0,214,143,0.08), rgba(59,130,246,0.08))' },
    BEARISH: { bg: 'rgba(255,77,106,0.12)', color: '#ff4d6a', border: 'rgba(255,77,106,0.3)', emoji: '🔴', gradient: 'linear-gradient(135deg, rgba(255,77,106,0.08), rgba(251,191,36,0.08))' },
    NEUTRAL: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.3)', emoji: '🟡', gradient: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(59,130,246,0.08))' },
  };
  const sc = signalColors[analysis.signal];

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="h-8 w-80 rounded mb-6 animate-pulse" style={{ background: 'var(--border-color)' }} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1,2,3,4].map(i => (
            <div key={i} className="glass-card-static rounded-2xl p-5 animate-pulse">
              <div className="h-4 w-20 rounded mb-2" style={{ background: 'var(--border-color)' }} />
              <div className="h-8 w-24 rounded" style={{ background: 'var(--border-color)' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ─── Page Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            🏛️ Institutional Money Flow
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            FII/DII flows, block deals, and smart money analysis — last {recent.length} trading days
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1.5 rounded-full font-bold"
            style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
            {sc.emoji} {analysis.signal} — {analysis.confidence} Confidence
          </span>
        </div>
      </div>

      {/* ═══════════ SIGNAL & RECOMMENDATION ═══════════ */}
      <div className="glass-card-static rounded-2xl p-6 mb-6" style={{ background: sc.gradient, border: `1px solid ${sc.border}` }}>
        <div className="flex items-start gap-4 mb-5">
          <div className="text-4xl">{sc.emoji}</div>
          <div>
            <p className="text-xl font-black text-white mb-1">
              Institutional Signal: {analysis.signal}
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Based on {recent.length}-day FII/DII flows, {deals.length} block deals, and momentum analysis
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {analysis.reasons.map((reason, i) => (
            <div key={i} className="flex items-start gap-2 text-sm p-3 rounded-xl"
              style={{ background: 'rgba(0,0,0,0.2)' }}>
              <span className="text-xs mt-0.5 shrink-0" style={{ color: sc.color }}>▸</span>
              <span style={{ color: 'var(--text-secondary)' }}>{reason}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════ KEY METRICS ROW ═══════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <div className="glass-card-static rounded-xl p-4">
          <p className="text-[9px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>FII {recent.length}D Net</p>
          <p className="text-xl font-black" style={{ color: analysis.fii30dNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
            {analysis.fii30dNet >= 0 ? '+' : ''}{(analysis.fii30dNet / 1000).toFixed(1)}K
          </p>
          <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>₹ Cr • {analysis.fiiBuyDays}B/{analysis.fiiSellDays}S</p>
        </div>
        <div className="glass-card-static rounded-xl p-4">
          <p className="text-[9px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>DII {recent.length}D Net</p>
          <p className="text-xl font-black" style={{ color: analysis.dii30dNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
            {analysis.dii30dNet >= 0 ? '+' : ''}{(analysis.dii30dNet / 1000).toFixed(1)}K
          </p>
          <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>₹ Cr • {analysis.diiBuyDays}B/{analysis.diiSellDays}S</p>
        </div>
        <div className="glass-card-static rounded-xl p-4">
          <p className="text-[9px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>FII 7D Net</p>
          <p className="text-xl font-black" style={{ color: analysis.fii7dNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
            {analysis.fii7dNet >= 0 ? '+' : ''}{(analysis.fii7dNet / 1000).toFixed(1)}K
          </p>
          <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>₹ Cr recent</p>
        </div>
        <div className="glass-card-static rounded-xl p-4">
          <p className="text-[9px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>FII Streak</p>
          <p className="text-xl font-black" style={{ color: analysis.fiiStreak >= 0 ? '#00d68f' : '#ff4d6a' }}>
            {analysis.fiiStreak > 0 ? '🔥' : analysis.fiiStreak < 0 ? '❄️' : '—'} {Math.abs(analysis.fiiStreak)}d
          </p>
          <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{analysis.fiiStreak > 0 ? 'Buying' : analysis.fiiStreak < 0 ? 'Selling' : 'No streak'}</p>
        </div>
        <div className="glass-card-static rounded-xl p-4">
          <p className="text-[9px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Block Deals</p>
          <p className="text-xl font-black text-white">{deals.length}</p>
          <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>₹{analysis.totalDealValue.toFixed(0)} Cr total</p>
        </div>
        <div className="glass-card-static rounded-xl p-4">
          <p className="text-[9px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Ultra Blocks</p>
          <p className="text-xl font-black" style={{ color: '#fbbf24' }}>{analysis.ultraBlockDeals}</p>
          <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>₹50+ Cr deals</p>
        </div>
      </div>

      {/* ═══════════ TODAY'S FLOW ═══════════ */}
      {today && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="glass-card-static rounded-2xl p-5" style={{ border: '1px solid rgba(59,130,246,0.15)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Today — FII / FPI</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: today.fiiNet >= 0 ? 'rgba(0,214,143,0.15)' : 'rgba(255,77,106,0.15)', color: today.fiiNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
                {today.fiiNet >= 0 ? '🟢 BUYING' : '🔴 SELLING'}
              </span>
            </div>
            <p className="text-3xl font-black mb-2" style={{ color: today.fiiNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
              {today.fiiNet >= 0 ? '+' : ''}{today.fiiNet.toLocaleString('en-IN')} Cr
            </p>
            <div className="grid grid-cols-2 gap-4 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Gross Buy</p>
                <p className="text-sm font-bold" style={{ color: '#00d68f' }}>₹{today.fiiBuy.toLocaleString('en-IN')} Cr</p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Gross Sell</p>
                <p className="text-sm font-bold" style={{ color: '#ff4d6a' }}>₹{today.fiiSell.toLocaleString('en-IN')} Cr</p>
              </div>
            </div>
          </div>
          <div className="glass-card-static rounded-2xl p-5" style={{ border: '1px solid rgba(139,92,246,0.15)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Today — DII</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: today.diiNet >= 0 ? 'rgba(0,214,143,0.15)' : 'rgba(255,77,106,0.15)', color: today.diiNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
                {today.diiNet >= 0 ? '🟢 BUYING' : '🔴 SELLING'}
              </span>
            </div>
            <p className="text-3xl font-black mb-2" style={{ color: today.diiNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
              {today.diiNet >= 0 ? '+' : ''}{today.diiNet.toLocaleString('en-IN')} Cr
            </p>
            <div className="grid grid-cols-2 gap-4 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Gross Buy</p>
                <p className="text-sm font-bold" style={{ color: '#00d68f' }}>₹{today.diiBuy.toLocaleString('en-IN')} Cr</p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Gross Sell</p>
                <p className="text-sm font-bold" style={{ color: '#ff4d6a' }}>₹{today.diiSell.toLocaleString('en-IN')} Cr</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ MAIN 2-COLUMN GRID ═══════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ─── Left: FII/DII Daily Chart ─── */}
        <div className="xl:col-span-2 space-y-6">
          {/* FII/DII Bar Chart */}
          <div className="glass-card-static rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              📊 Daily FII / DII Net Flow — Last {recent.length} Days
            </h3>
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1"
              style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
              {recent.slice().reverse().map((flow) => {
                const fiiPct = (Math.abs(flow.fiiNet) / maxFlow) * 100;
                const diiPct = (Math.abs(flow.diiNet) / maxFlow) * 100;
                const dayLabel = new Date(flow.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
                return (
                  <div key={flow.date} className="flex items-center gap-2 py-0.5">
                    <span className="text-[10px] w-20 shrink-0 text-right font-medium" style={{ color: 'var(--text-muted)' }}>{dayLabel}</span>
                    <div className="flex-1 flex gap-1 items-center">
                      <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <div className="h-full rounded transition-all duration-500" style={{
                          width: `${Math.max(fiiPct, 3)}%`,
                          background: flow.fiiNet >= 0 ? 'linear-gradient(90deg, #00d68f, #34d399)' : 'linear-gradient(90deg, #ff4d6a, #f87171)',
                        }} />
                      </div>
                      <span className="text-[9px] font-bold w-14 text-right shrink-0"
                        style={{ color: flow.fiiNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
                        {flow.fiiNet >= 0 ? '+' : ''}{(flow.fiiNet / 1000).toFixed(1)}k
                      </span>
                      <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <div className="h-full rounded transition-all duration-500" style={{
                          width: `${Math.max(diiPct, 3)}%`,
                          background: flow.diiNet >= 0 ? 'linear-gradient(90deg, #818cf8, #a78bfa)' : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                        }} />
                      </div>
                      <span className="text-[9px] font-bold w-14 text-right shrink-0"
                        style={{ color: flow.diiNet >= 0 ? '#a78bfa' : '#f59e0b' }}>
                        {flow.diiNet >= 0 ? '+' : ''}{(flow.diiNet / 1000).toFixed(1)}k
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span className="w-3 h-2 rounded-sm" style={{ background: '#3b82f6' }} /> FII
              </span>
              <span className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span className="w-3 h-2 rounded-sm" style={{ background: '#8b5cf6' }} /> DII
              </span>
              <span className="flex items-center gap-1.5 text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>
                <span className="w-3 h-2 rounded-sm" style={{ background: '#00d68f' }} /> Buy
                <span className="w-3 h-2 rounded-sm ml-2" style={{ background: '#ff4d6a' }} /> Sell
              </span>
            </div>
          </div>

          {/* ─── Block Deals Table ─── */}
          <div className="glass-card-static rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                💰 Institutional Block Deals ({deals.length})
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(0,214,143,0.12)', color: '#00d68f' }}>
                  {analysis.buyDeals} Buys • ₹{analysis.buyValue.toFixed(0)} Cr
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(255,77,106,0.12)', color: '#ff4d6a' }}>
                  {analysis.sellDeals} Sells • ₹{analysis.sellValue.toFixed(0)} Cr
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th className="text-left py-2 px-2 font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Date</th>
                    <th className="text-left py-2 px-2 font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Stock</th>
                    <th className="text-center py-2 px-2 font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Action</th>
                    <th className="text-center py-2 px-2 font-bold uppercase tracking-wider hidden sm:table-cell" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Type</th>
                    <th className="text-right py-2 px-2 font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Value</th>
                    <th className="text-right py-2 px-2 font-bold uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Price</th>
                    <th className="text-left py-2 px-2 font-bold uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Buyer</th>
                    <th className="text-left py-2 px-2 font-bold uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Seller</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.slice(0, 30).map((deal) => {
                    const isBuy = deal.action === 'BUY';
                    const isUltra = deal.dealType === 'Ultra Block';
                    return (
                      <tr key={deal.id} className="transition-colors hover:bg-white/[0.02]"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td className="py-2 px-2" style={{ color: 'var(--text-muted)' }}>
                          {new Date(deal.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </td>
                        <td className="py-2 px-2">
                          <Link href={`/stock/${deal.symbol}`} className="font-bold text-white hover:text-blue-400">{deal.symbol}</Link>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                            style={{ background: isBuy ? 'rgba(0,214,143,0.15)' : 'rgba(255,77,106,0.15)', color: isBuy ? '#00d68f' : '#ff4d6a' }}>
                            {deal.action}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center hidden sm:table-cell">
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                            style={{ background: isUltra ? 'rgba(251,191,36,0.15)' : 'rgba(59,130,246,0.1)', color: isUltra ? '#fbbf24' : '#60a5fa' }}>
                            {deal.dealType}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-bold" style={{ color: isUltra ? '#fbbf24' : '#fff' }}>
                          ₹{deal.valueCr.toFixed(1)} Cr
                        </td>
                        <td className="py-2 px-2 text-right hidden md:table-cell text-white">₹{deal.price.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-2 hidden lg:table-cell" style={{ color: 'var(--text-secondary)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {deal.buyerName}
                        </td>
                        <td className="py-2 px-2 hidden lg:table-cell" style={{ color: 'var(--text-secondary)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {deal.sellerName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ─── Right Column: Rankings & Insights ─── */}
        <div className="xl:col-span-1 space-y-4">
          {/* Top Stocks by Block Deal Value */}
          <div className="glass-card-static rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              🔥 Top Stocks — Block Deals
            </h3>
            <div className="space-y-3">
              {analysis.topStocks.map(([symbol, data], i) => {
                const pct = (data.total / analysis.totalDealValue) * 100;
                return (
                  <div key={symbol}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] w-4 text-right font-bold" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                        <Link href={`/stock/${symbol}`} className="text-xs font-bold text-white hover:text-blue-400">{symbol}</Link>
                      </div>
                      <span className="text-xs font-bold text-white">₹{data.total.toFixed(0)} Cr</span>
                    </div>
                    <div className="flex gap-0.5 ml-6">
                      <div className="h-2 rounded-l" style={{
                        width: `${(data.buy / data.total) * 100}%`,
                        background: '#00d68f',
                        minWidth: data.buy > 0 ? '4px' : '0',
                      }} />
                      <div className="h-2 rounded-r" style={{
                        width: `${(data.sell / data.total) * 100}%`,
                        background: '#ff4d6a',
                        minWidth: data.sell > 0 ? '4px' : '0',
                      }} />
                    </div>
                    <div className="flex justify-between ml-6 mt-0.5">
                      <span className="text-[8px]" style={{ color: '#00d68f' }}>Buy ₹{data.buy.toFixed(0)}</span>
                      <span className="text-[8px]" style={{ color: '#ff4d6a' }}>Sell ₹{data.sell.toFixed(0)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Institutions */}
          <div className="glass-card-static rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              🏦 Top Institutions
            </h3>
            <div className="space-y-2">
              {analysis.topInstitutions.map((inst, i) => (
                <div key={inst.name} className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-white" style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inst.name}
                    </span>
                    <span className="text-xs font-bold" style={{ color: inst.net >= 0 ? '#00d68f' : '#ff4d6a' }}>
                      {inst.net >= 0 ? '+' : ''}{inst.net.toFixed(0)} Cr
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    <span>{inst.deals} deals</span>
                    <span style={{ color: '#00d68f' }}>Buy ₹{inst.buy.toFixed(0)}</span>
                    <span style={{ color: '#ff4d6a' }}>Sell ₹{inst.sell.toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FII vs DII Comparison */}
          <div className="glass-card-static rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4">⚔️ FII vs DII — 30 Day Battle</h3>
            <div className="space-y-4">
              {/* Net Flow Comparison */}
              <div>
                <p className="text-[9px] uppercase font-bold mb-2" style={{ color: 'var(--text-muted)' }}>Cumulative Net Flow</p>
                <div className="flex gap-1 h-6 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-center text-[9px] font-bold" style={{
                    width: analysis.fii30dNet >= 0 ? '50%' : '50%',
                    background: analysis.fii30dNet >= 0 ? 'rgba(0,214,143,0.3)' : 'rgba(255,77,106,0.3)',
                    color: analysis.fii30dNet >= 0 ? '#00d68f' : '#ff4d6a',
                  }}>
                    FII: {(analysis.fii30dNet / 1000).toFixed(1)}K
                  </div>
                  <div className="flex items-center justify-center text-[9px] font-bold" style={{
                    width: '50%',
                    background: analysis.dii30dNet >= 0 ? 'rgba(129,140,248,0.3)' : 'rgba(245,158,11,0.3)',
                    color: analysis.dii30dNet >= 0 ? '#a78bfa' : '#f59e0b',
                  }}>
                    DII: {(analysis.dii30dNet / 1000).toFixed(1)}K
                  </div>
                </div>
              </div>

              {/* Streaks */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.06)' }}>
                  <p className="text-[9px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>FII Streak</p>
                  <p className="text-sm font-black" style={{ color: analysis.fiiStreak >= 0 ? '#00d68f' : '#ff4d6a' }}>
                    {analysis.fiiStreak > 0 ? '🔥' : '❄️'} {Math.abs(analysis.fiiStreak)} days
                  </p>
                  <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{analysis.fiiStreak > 0 ? 'Buying' : 'Selling'}</p>
                </div>
                <div className="p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.06)' }}>
                  <p className="text-[9px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>DII Streak</p>
                  <p className="text-sm font-black" style={{ color: analysis.diiStreak >= 0 ? '#00d68f' : '#ff4d6a' }}>
                    {analysis.diiStreak > 0 ? '🔥' : '❄️'} {Math.abs(analysis.diiStreak)} days
                  </p>
                  <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{analysis.diiStreak > 0 ? 'Buying' : 'Selling'}</p>
                </div>
              </div>

              {/* Buy/Sell Day Distribution */}
              <div>
                <p className="text-[9px] uppercase font-bold mb-2" style={{ color: 'var(--text-muted)' }}>Buy vs Sell Days</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] w-6 shrink-0" style={{ color: '#3b82f6' }}>FII</span>
                    <div className="flex-1 flex gap-0.5 h-3 rounded overflow-hidden">
                      <div style={{ width: `${(analysis.fiiBuyDays / recent.length) * 100}%`, background: '#00d68f' }} />
                      <div style={{ width: `${(analysis.fiiSellDays / recent.length) * 100}%`, background: '#ff4d6a' }} />
                    </div>
                    <span className="text-[9px] w-10 text-right" style={{ color: 'var(--text-muted)' }}>{analysis.fiiBuyDays}B/{analysis.fiiSellDays}S</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] w-6 shrink-0" style={{ color: '#8b5cf6' }}>DII</span>
                    <div className="flex-1 flex gap-0.5 h-3 rounded overflow-hidden">
                      <div style={{ width: `${(analysis.diiBuyDays / recent.length) * 100}%`, background: '#00d68f' }} />
                      <div style={{ width: `${(analysis.diiSellDays / recent.length) * 100}%`, background: '#ff4d6a' }} />
                    </div>
                    <span className="text-[9px] w-10 text-right" style={{ color: 'var(--text-muted)' }}>{analysis.diiBuyDays}B/{analysis.diiSellDays}S</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

