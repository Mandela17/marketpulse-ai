'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { searchStocks, getStockBySymbol } from '@/lib/sectorData';

interface Holding {
  symbol: string;
  name: string;
  sector: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  change: number;
  changePercent: number;
  pnl: number;
  pnlPercent: number;
  invested: number;
  currentValue: number;
  weight: number;
  // AI & Technical Analysis
  aiSignal?: 'bullish' | 'bearish' | 'neutral';
  aiConfidence?: number;
  targetPrice?: number;
  stopLoss?: number;
  technicalSignal?: string;
  rsi?: number;
  trend?: string;
  support?: number;
  resistance?: number;
}

const STORAGE_KEY = 'marketpulse_portfolio';

interface SavedHolding {
  symbol: string;
  name: string;
  sector?: string;
  qty: number;
  avgPrice: number;
}

const SECTOR_ICONS: Record<string, string> = {
  energy: '⛽', power: '⚡', auto: '🚗', gold: '🥇', ev: '🔋',
  banking: '🏦', it: '💻', pharma: '💊', defense: '🛡️',
  metals: '⛏️', fmcg: '🛒', realestate: '🏗️', aviation: '✈️',
  general: '📈',
};

const SECTOR_COLORS: Record<string, string> = {
  banking: '#3b82f6',
  it: '#8b5cf6',
  auto: '#ec4899',
  energy: '#f59e0b',
  power: '#eab308',
  pharma: '#10b981',
  fmcg: '#06b6d4',
  metals: '#64748b',
  defense: '#6366f1',
  gold: '#fbbf24',
  aviation: '#38bdf8',
  realestate: '#a855f7',
  general: '#94a3b8',
};

const SAMPLE_PORTFOLIO: SavedHolding[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd.', sector: 'energy', qty: 25, avgPrice: 1240 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd.', sector: 'banking', qty: 40, avgPrice: 1680 },
  { symbol: 'TCS', name: 'Tata Consultancy Services Ltd.', sector: 'it', qty: 15, avgPrice: 3850 },
  { symbol: 'TMCV', name: 'Tata Motors CV Ltd.', sector: 'auto', qty: 80, avgPrice: 420 },
  { symbol: 'INDIGO', name: 'InterGlobe Aviation Ltd. (IndiGo)', sector: 'aviation', qty: 10, avgPrice: 5100 },
];

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [savedHoldings, setSavedHoldings] = useState<SavedHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePredictions, setActivePredictions] = useState<Record<string, any>>({});

  // Add / Edit form states
  const [showAdd, setShowAdd] = useState(false);
  const [editingStock, setEditingStock] = useState<SavedHolding | null>(null);

  // Search input states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string; sector: string }[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Form values
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [selectedSector, setSelectedSector] = useState('general');
  const [newQty, setNewQty] = useState('');
  const [newAvgPrice, setNewAvgPrice] = useState('');
  const [liveCmp, setLiveCmp] = useState<number | null>(null);
  const [fetchingCmp, setFetchingCmp] = useState(false);

  // Filter & Search table states
  const [tableFilter, setTableFilter] = useState<'all' | 'gainers' | 'losers'>('all');
  const [tableSearch, setTableSearch] = useState('');

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Load saved holdings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as SavedHolding[];
        setSavedHoldings(parsed);
      } catch {}
    }
    setLoading(false);
  }, []);

  // Fetch active AI predictions in bulk once
  useEffect(() => {
    async function loadPredictions() {
      try {
        const res = await fetch('/api/predictions?type=active');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.predictions)) {
            const predMap: Record<string, any> = {};
            data.predictions.forEach((p: any) => {
              if (p?.symbol) predMap[p.symbol.toUpperCase()] = p;
            });
            setActivePredictions(predMap);
          }
        }
      } catch (err) {
        console.warn('Could not load active predictions for portfolio:', err);
      }
    }
    loadPredictions();
  }, []);

  // Click outside search dropdown to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live stock search autocomplete
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length >= 1) {
      const results = searchStocks(q);
      setSearchResults(results);
      setIsDropdownOpen(true);
      setSelectedIndex(0);
    } else {
      setSearchResults([]);
      setIsDropdownOpen(false);
    }
  }, [searchQuery]);

  // When stock is selected from search, fetch its live CMP automatically
  const handleSelectStock = async (stock: { symbol: string; name: string; sector: string }) => {
    setSelectedSymbol(stock.symbol);
    setSelectedName(stock.name);
    setSelectedSector(stock.sector);
    setSearchQuery(`${stock.symbol} — ${stock.name}`);
    setIsDropdownOpen(false);
    setFetchingCmp(true);

    try {
      const res = await fetch(`/api/stock?symbol=${encodeURIComponent(stock.symbol)}`);
      if (res.ok) {
        const data = await res.json();
        const price = data?.quote?.price;
        if (price > 0) {
          setLiveCmp(price);
          if (!newAvgPrice) {
            setNewAvgPrice(price.toString());
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch CMP for', stock.symbol, e);
    } finally {
      setFetchingCmp(false);
      // Automatically focus quantity input for smooth UX
      setTimeout(() => qtyInputRef.current?.focus(), 50);
    }
  };

  // Fetch live prices and technicals when saved holdings change
  useEffect(() => {
    if (savedHoldings.length === 0) {
      setHoldings([]);
      return;
    }

    async function fetchPricesAndTechnicals() {
      const results: Holding[] = [];

      // Fetch all stocks in parallel
      const promises = savedHoldings.map(async (h) => {
        try {
          const res = await fetch(`/api/stock?symbol=${encodeURIComponent(h.symbol)}`);
          const data = await res.json();
          const q = data?.quote || data;
          const tech = data?.technicals;
          const pred = activePredictions[h.symbol.toUpperCase()];

          if (q?.price > 0) {
            const currentPrice = q.price;
            const currentValue = currentPrice * h.qty;
            const invested = h.avgPrice * h.qty;
            const pnl = currentValue - invested;
            const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

            const holdingMeta = getStockBySymbol(h.symbol);
            const sector = h.sector || holdingMeta?.sector || 'general';
            const name = h.name && h.name !== h.symbol ? h.name : (holdingMeta?.name || q.name || h.symbol);

            // Derive AI conviction signal from active predictions or real technicals
            let aiSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
            let aiConfidence = 60;
            let targetPrice: number | undefined = tech?.resistance || Math.round(currentPrice * 1.05);
            let stopLoss: number | undefined = tech?.support || Math.round(currentPrice * 0.95);

            if (pred) {
              aiSignal = pred.predictedDirection === 'up' ? 'bullish' : 'bearish';
              let prob = Number(pred.probability);
              if (isNaN(prob) || prob <= 0) prob = 65;
              // If stored as decimal (0.0 to 1.0), convert to percentage
              if (prob > 0 && prob <= 1) {
                prob *= 100;
              }
              aiConfidence = Math.round(Math.min(99, Math.max(50, prob)));
            } else if (tech?.signal) {
              if (tech.signal === 'STRONG_BUY' || tech.signal === 'BUY') {
                aiSignal = 'bullish';
                aiConfidence = tech.signal === 'STRONG_BUY' ? 82 : 72;
              } else if (tech.signal === 'STRONG_SELL' || tech.signal === 'SELL') {
                aiSignal = 'bearish';
                aiConfidence = tech.signal === 'STRONG_SELL' ? 80 : 70;
              }
            }

            return {
              symbol: h.symbol,
              name,
              sector,
              qty: h.qty,
              avgPrice: h.avgPrice,
              currentPrice,
              change: q.change || 0,
              changePercent: q.changePercent || 0,
              pnl,
              pnlPercent,
              invested,
              currentValue,
              weight: 0, // Calculated after total is known
              aiSignal,
              aiConfidence,
              targetPrice,
              stopLoss,
              technicalSignal: tech?.signal || (q.changePercent >= 0 ? 'BUY' : 'NEUTRAL'),
              rsi: tech?.rsi ? Math.round(tech.rsi) : undefined,
              trend: tech?.trend || (q.changePercent >= 0 ? 'BULLISH' : 'BEARISH'),
              support: tech?.support,
              resistance: tech?.resistance,
            } as Holding;
          }
        } catch {
          // Fallback if quote fails
          const invested = h.avgPrice * h.qty;
          return {
            symbol: h.symbol,
            name: h.name || h.symbol,
            sector: h.sector || 'general',
            qty: h.qty,
            avgPrice: h.avgPrice,
            currentPrice: h.avgPrice,
            change: 0,
            changePercent: 0,
            pnl: 0,
            pnlPercent: 0,
            invested,
            currentValue: invested,
            weight: 0,
          } as Holding;
        }
      });

      const settled = await Promise.all(promises);
      const validHoldings = settled.filter(Boolean) as Holding[];

      const totalVal = validHoldings.reduce((sum, h) => sum + h.currentValue, 0);
      const weightedHoldings = validHoldings.map(h => ({
        ...h,
        weight: totalVal > 0 ? (h.currentValue / totalVal) * 100 : 0,
      }));

      setHoldings(weightedHoldings);
    }

    fetchPricesAndTechnicals();
  }, [savedHoldings, activePredictions]);

  const saveToStorage = (list: SavedHolding[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setSavedHoldings(list);
  };

  const handleAddOrUpdateHolding = () => {
    const symbol = selectedSymbol.trim().toUpperCase() || searchQuery.trim().toUpperCase();
    const qty = parseFloat(newQty);
    const avgPrice = parseFloat(newAvgPrice);

    if (!symbol || isNaN(qty) || qty <= 0 || isNaN(avgPrice) || avgPrice <= 0) return;

    const meta = getStockBySymbol(symbol);
    const name = selectedName || meta?.name || symbol;
    const sector = selectedSector || meta?.sector || 'general';

    if (editingStock) {
      // Update existing
      const updated = savedHoldings.map(h =>
        h.symbol === editingStock.symbol ? { ...h, qty, avgPrice, name, sector } : h
      );
      saveToStorage(updated);
      setEditingStock(null);
    } else {
      // Add or average out
      const existing = savedHoldings.find(h => h.symbol === symbol);
      if (existing) {
        const totalQty = existing.qty + qty;
        const totalCost = existing.avgPrice * existing.qty + avgPrice * qty;
        const newAvg = totalCost / totalQty;
        const updated = savedHoldings.map(h =>
          h.symbol === symbol
            ? { ...h, qty: totalQty, avgPrice: parseFloat(newAvg.toFixed(2)), name, sector }
            : h
        );
        saveToStorage(updated);
      } else {
        saveToStorage([...savedHoldings, { symbol, name, sector, qty, avgPrice }]);
      }
    }

    // Reset form
    setSearchQuery('');
    setSelectedSymbol('');
    setSelectedName('');
    setSelectedSector('general');
    setNewQty('');
    setNewAvgPrice('');
    setLiveCmp(null);
    setShowAdd(false);
  };

  const handleEditClick = (h: Holding) => {
    setEditingStock({ symbol: h.symbol, name: h.name, sector: h.sector, qty: h.qty, avgPrice: h.avgPrice });
    setSelectedSymbol(h.symbol);
    setSelectedName(h.name);
    setSelectedSector(h.sector);
    setSearchQuery(`${h.symbol} — ${h.name}`);
    setNewQty(h.qty.toString());
    setNewAvgPrice(h.avgPrice.toString());
    setLiveCmp(h.currentPrice);
    setShowAdd(true);
  };

  const removeHolding = (symbol: string) => {
    saveToStorage(savedHoldings.filter(h => h.symbol !== symbol));
  };

  const loadSamplePortfolio = () => {
    saveToStorage(SAMPLE_PORTFOLIO);
  };

  const clearPortfolio = () => {
    if (confirm('Are you sure you want to clear your portfolio holdings?')) {
      saveToStorage([]);
    }
  };

  // CSV Export for taxation / tracking
  const exportToCSV = () => {
    if (holdings.length === 0) return;
    const headers = ['Symbol', 'Company', 'Sector', 'Quantity', 'Avg Buy Price', 'LTP', 'Invested', 'Current Value', 'P&L (Rs)', 'P&L (%)', 'Weight (%)', 'AI Conviction'];
    const rows = holdings.map(h => [
      h.symbol,
      `"${h.name}"`,
      h.sector,
      h.qty,
      h.avgPrice.toFixed(2),
      h.currentPrice.toFixed(2),
      h.invested.toFixed(2),
      h.currentValue.toFixed(2),
      h.pnl.toFixed(2),
      h.pnlPercent.toFixed(2),
      h.weight.toFixed(2),
      h.aiSignal?.toUpperCase() || 'NEUTRAL',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `marketpulse_portfolio_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ─── Financial Calculations ───
  const totalInvested = useMemo(() => holdings.reduce((s, h) => s + h.invested, 0), [holdings]);
  const totalCurrent = useMemo(() => holdings.reduce((s, h) => s + h.currentValue, 0), [holdings]);
  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const todayPnl = useMemo(() => holdings.reduce((s, h) => s + (h.change * h.qty), 0), [holdings]);

  // ─── Sector Allocation Diagnostics ───
  const sectorAllocation = useMemo(() => {
    const map: Record<string, { value: number; count: number }> = {};
    holdings.forEach(h => {
      const sec = h.sector || 'general';
      if (!map[sec]) map[sec] = { value: 0, count: 0 };
      map[sec].value += h.currentValue;
      map[sec].count += 1;
    });

    return Object.entries(map).map(([sec, data]) => ({
      sector: sec,
      name: sec.charAt(0).toUpperCase() + sec.slice(1),
      value: data.value,
      count: data.count,
      pct: totalCurrent > 0 ? (data.value / totalCurrent) * 100 : 0,
      color: SECTOR_COLORS[sec] || '#94a3b8',
      icon: SECTOR_ICONS[sec] || '📈',
    })).sort((a, b) => b.value - a.value);
  }, [holdings, totalCurrent]);

  // ─── Portfolio Health Score (0-100) ───
  const portfolioHealth = useMemo(() => {
    if (holdings.length === 0) return { score: 0, label: 'N/A', status: 'neutral' };

    // 1. Diversification score (max 30 pts)
    const uniqueSectors = sectorAllocation.length;
    const sectorScore = Math.min(30, uniqueSectors * 6);

    // 2. Concentration risk penalty (max 25 pts)
    const maxWeight = Math.max(...holdings.map(h => h.weight), 0);
    const concentrationScore = maxWeight > 40 ? 5 : maxWeight > 25 ? 15 : 25;

    // 3. Profitability ratio (max 25 pts)
    const profitableCount = holdings.filter(h => h.pnl >= 0).length;
    const winRatio = holdings.length > 0 ? (profitableCount / holdings.length) : 0;
    const profitScore = Math.round(winRatio * 25);

    // 4. AI Conviction Alignment (max 20 pts)
    const bullishCount = holdings.filter(h => h.aiSignal === 'bullish').length;
    const aiAlignmentScore = Math.round((bullishCount / holdings.length) * 20);

    const score = sectorScore + concentrationScore + profitScore + aiAlignmentScore;

    let label = 'Moderate';
    let status = 'amber';
    if (score >= 80) { label = 'Excellent'; status = 'green'; }
    else if (score >= 60) { label = 'Balanced'; status = 'blue'; }
    else if (score < 45) { label = 'High Risk'; status = 'red'; }

    return { score, label, status };
  }, [holdings, sectorAllocation]);

  // ─── AI Actionable Suggestions ───
  const aiSuggestions = useMemo(() => {
    if (holdings.length === 0) return [];

    const suggestions: {
      type: 'profit' | 'accumulate' | 'risk' | 'balance';
      title: string;
      desc: string;
      symbol?: string;
      actionText: string;
      actionUrl?: string;
      badgeColor: string;
    }[] = [];

    // 1. Profit Booking Suggestion
    const topGainer = holdings.find(h => h.pnlPercent >= 15 && (h.rsi ? h.rsi > 68 : true));
    if (topGainer) {
      suggestions.push({
        type: 'profit',
        title: `Lock in Gains: ${topGainer.symbol} (+${topGainer.pnlPercent.toFixed(1)}%)`,
        desc: `${topGainer.symbol} has surged past your target price. Technical RSI (${topGainer.rsi || 70}) indicates overbought momentum. Consider booking 25-30% partial profit.`,
        symbol: topGainer.symbol,
        actionText: 'Analyze Stock',
        actionUrl: `/stock/${topGainer.symbol}`,
        badgeColor: '#10b981',
      });
    }

    // 2. Accumulation on Dip
    const dipCandidate = holdings.find(h => h.aiSignal === 'bullish' && h.pnlPercent < 2 && h.pnlPercent > -8);
    if (dipCandidate) {
      suggestions.push({
        type: 'accumulate',
        title: `Favorable Entry: ${dipCandidate.symbol} (${dipCandidate.aiConfidence}% Bullish)`,
        desc: `AI models project positive continuation towards ₹${dipCandidate.targetPrice || (dipCandidate.currentPrice * 1.08).toFixed(0)}. Currently consolidating near your cost basis.`,
        symbol: dipCandidate.symbol,
        actionText: 'View AI Prediction',
        actionUrl: `/stock/${dipCandidate.symbol}`,
        badgeColor: '#3b82f6',
      });
    }

    // 3. Stop Loss / Downside Warning
    const lossRisk = holdings.find(h => h.pnlPercent < -7 && h.aiSignal === 'bearish');
    if (lossRisk) {
      suggestions.push({
        type: 'risk',
        title: `Risk Advisory: ${lossRisk.symbol} (${lossRisk.pnlPercent.toFixed(1)}%)`,
        desc: `Persistent selling pressure and bearish momentum. Key support at ₹${lossRisk.support || (lossRisk.currentPrice * 0.94).toFixed(0)}. Review holding to prevent capital erosion.`,
        symbol: lossRisk.symbol,
        actionText: 'Inspect Support',
        actionUrl: `/stock/${lossRisk.symbol}`,
        badgeColor: '#ff4d6a',
      });
    }

    // 4. Sector Concentration Alert
    const topSector = sectorAllocation[0];
    if (topSector && topSector.pct > 38 && holdings.length >= 3) {
      suggestions.push({
        type: 'balance',
        title: `Sector Overweight: ${topSector.name} (${topSector.pct.toFixed(0)}%)`,
        desc: `Over ${topSector.pct.toFixed(0)}% of your portfolio is in ${topSector.name}. Broaden risk exposure by channeling new capital into defensive sectors like Pharma or FMCG.`,
        actionText: 'Explore Sectors',
        actionUrl: '/sectors',
        badgeColor: '#f59e0b',
      });
    }

    return suggestions;
  }, [holdings, sectorAllocation]);

  // Filtered table rows
  const filteredHoldings = useMemo(() => {
    return holdings
      .filter(h => {
        if (tableFilter === 'gainers') return h.pnl >= 0;
        if (tableFilter === 'losers') return h.pnl < 0;
        return true;
      })
      .filter(h => {
        if (!tableSearch.trim()) return true;
        const q = tableSearch.toLowerCase();
        return h.symbol.toLowerCase().includes(q) || h.name.toLowerCase().includes(q);
      })
      .sort((a, b) => b.currentValue - a.currentValue);
  }, [holdings, tableFilter, tableSearch]);

  return (
    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* ─── Top Header Bar ─── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">💼 Portfolio Tracker</h1>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
              style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>
              Live AI Analytics
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Real-time P&L tracking, AI price targets, sector allocation & automated risk suggestions
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {holdings.length > 0 && (
            <button
              onClick={exportToCSV}
              className="text-xs px-3.5 py-2 rounded-xl font-semibold transition-all cursor-pointer flex items-center gap-1.5"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
              title="Export portfolio as CSV spreadsheet"
            >
              📥 Export CSV
            </button>
          )}

          <button
            onClick={() => {
              setShowAdd(!showAdd);
              setEditingStock(null);
              setSearchQuery('');
              setSelectedSymbol('');
              setNewQty('');
              setNewAvgPrice('');
            }}
            className="text-xs px-4 py-2 rounded-xl font-bold transition-all cursor-pointer shadow-lg hover:brightness-110 flex items-center gap-1.5"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white' }}
          >
            {showAdd ? '✕ Close Form' : '+ Add Holding'}
          </button>
        </div>
      </div>

      {/* ─── Search & Add Holding Modal/Drawer ─── */}
      {showAdd && (
        <div className="glass-card-static rounded-2xl p-5 mb-6 animate-fade-in-up"
          style={{ border: '1px solid rgba(59,130,246,0.3)', background: 'linear-gradient(180deg, rgba(30,41,59,0.7) 0%, rgba(15,23,42,0.85) 100%)' }}>
          
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">{editingStock ? '✏️' : '🔍'}</span>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                {editingStock ? `Edit Holding: ${editingStock.symbol}` : 'Search & Add New Holding'}
              </h2>
            </div>
            {liveCmp && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Current Market Price:</span>
                <span className="text-xs font-black text-white px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                  ₹{liveCmp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <button
                  type="button"
                  onClick={() => setNewAvgPrice(liveCmp.toString())}
                  className="text-[10px] px-2 py-0.5 rounded bg-blue-600 text-white font-bold hover:brightness-110 cursor-pointer"
                >
                  Use CMP
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
            {/* Stock Search Input with Live Dropdown */}
            <div className="sm:col-span-5 relative" ref={searchContainerRef}>
              <label className="text-[10px] uppercase font-bold block mb-1 tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Stock Search (Symbol or Company Name)
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-sm text-slate-400 pointer-events-none">🔍</span>
                <input
                  type="text"
                  placeholder="Type to search (e.g. TMCV, IndiGo, Reliance, HDFC, Zomato)..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (selectedSymbol) {
                      setSelectedSymbol('');
                      setLiveCmp(null);
                    }
                  }}
                  onFocus={() => {
                    if (searchQuery.trim().length >= 1) setIsDropdownOpen(true);
                  }}
                  className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm bg-slate-900/80 outline-none text-white transition-all font-medium"
                  style={{ border: '1px solid var(--accent-blue)', boxShadow: '0 0 12px rgba(59,130,246,0.15)' }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedSymbol('');
                      setSelectedName('');
                      setLiveCmp(null);
                    }}
                    className="absolute right-2.5 text-xs text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {isDropdownOpen && searchResults.length > 0 && (
                <div
                  className="absolute top-full left-0 right-0 mt-1.5 rounded-xl overflow-hidden z-50 shadow-2xl glass-card"
                  style={{
                    background: '#0f172a',
                    border: '1px solid rgba(59,130,246,0.3)',
                    maxHeight: '260px',
                    overflowY: 'auto',
                  }}
                >
                  {searchResults.map((stock, i) => (
                    <div
                      key={stock.symbol}
                      onClick={() => handleSelectStock(stock)}
                      className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-slate-800"
                      style={{
                        background: i === selectedIndex ? 'rgba(59,130,246,0.15)' : 'transparent',
                        borderBottom: i < searchResults.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      }}
                    >
                      <span className="text-base">{SECTOR_ICONS[stock.sector] || '📈'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-blue-400">{stock.symbol}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded uppercase font-semibold text-slate-400 bg-slate-800">
                            {stock.sector}
                          </span>
                        </div>
                        <p className="text-[11px] truncate text-slate-300">{stock.name}</p>
                      </div>
                      <span className="text-[10px] text-blue-400 font-semibold">Select ➔</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quantity */}
            <div className="sm:col-span-3">
              <label className="text-[10px] uppercase font-bold block mb-1 tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Quantity (Shares)
              </label>
              <input
                ref={qtyInputRef}
                type="number"
                min="1"
                step="any"
                placeholder="e.g. 50"
                value={newQty}
                onChange={e => setNewQty(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-900/80 outline-none text-white font-medium"
                style={{ border: '1px solid var(--border-color)' }}
              />
            </div>

            {/* Average Buy Price */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Avg Price (₹)
                </label>
                {fetchingCmp && <span className="text-[9px] text-blue-400 animate-pulse">fetching CMP...</span>}
              </div>
              <input
                type="number"
                min="0.01"
                step="any"
                placeholder="e.g. 1450.50"
                value={newAvgPrice}
                onChange={e => setNewAvgPrice(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-900/80 outline-none text-white font-medium"
                style={{ border: '1px solid var(--border-color)' }}
              />
            </div>

            {/* Submit Button */}
            <div className="sm:col-span-2 flex items-end">
              <button
                type="button"
                onClick={handleAddOrUpdateHolding}
                disabled={!selectedSymbol && !searchQuery.trim()}
                className="w-full py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md hover:brightness-110 disabled:opacity-50"
                style={{ background: '#00d68f', color: '#000' }}
              >
                {editingStock ? 'Save Changes' : '+ Add Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Financial Overview Cards ─── */}
      {holdings.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 mb-6 animate-fade-in-up">
          {/* Current Value */}
          <div className="glass-card-static rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Portfolio Value</span>
            <div className="mt-2">
              <p className="text-xl sm:text-2xl font-black text-white tracking-tight">
                ₹{totalCurrent.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              <p className="text-[11px] font-semibold mt-0.5 text-slate-400">
                Cost Basis: ₹{totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          {/* Total Unrealized P&L */}
          <div className="glass-card-static rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Unrealized P&L</span>
            <div className="mt-2">
              <p className="text-xl sm:text-2xl font-black tracking-tight" style={{ color: totalPnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5"
                style={{ background: totalPnl >= 0 ? 'rgba(0,214,143,0.15)' : 'rgba(255,77,106,0.15)', color: totalPnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                {totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}% Overall
              </span>
            </div>
          </div>

          {/* Today's P&L */}
          <div className="glass-card-static rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Today&apos;s Movement</span>
            <div className="mt-2">
              <p className="text-xl sm:text-2xl font-black tracking-tight" style={{ color: todayPnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                {todayPnl >= 0 ? '+' : ''}₹{todayPnl.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                {totalCurrent > 0 ? `${((todayPnl / totalCurrent) * 100).toFixed(2)}% change today` : '0.00%'}
              </p>
            </div>
          </div>

          {/* Health Score */}
          <div className="glass-card-static rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Health & Risk</span>
              <span className="text-[10px] font-black px-1.5 py-0.2 rounded uppercase"
                style={{
                  background: portfolioHealth.status === 'green' ? 'rgba(0,214,143,0.2)' : portfolioHealth.status === 'blue' ? 'rgba(59,130,246,0.2)' : 'rgba(245,158,11,0.2)',
                  color: portfolioHealth.status === 'green' ? '#00d68f' : portfolioHealth.status === 'blue' ? '#60a5fa' : '#f59e0b',
                }}>
                {portfolioHealth.label}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-xl sm:text-2xl font-black text-white">{portfolioHealth.score}</p>
              <span className="text-xs text-slate-400">/ 100</span>
            </div>
          </div>

          {/* Holdings Count & Green Ratio */}
          <div className="glass-card-static rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Positions Status</span>
            <div className="mt-2">
              <p className="text-xl sm:text-2xl font-black text-white">{holdings.length} Stocks</p>
              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-semibold text-slate-400">
                <span className="text-emerald-400">{holdings.filter(h => h.pnl >= 0).length} Green</span>
                <span>•</span>
                <span className="text-rose-400">{holdings.filter(h => h.pnl < 0).length} Red</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Sector Allocation & AI Insights ─── */}
      {holdings.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
          {/* Sector Allocation Breakdown */}
          <div className="lg:col-span-5 glass-card-static rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <span>📊</span> Sector Allocation
                </h3>
                <span className="text-[10px] text-slate-400 font-medium">{sectorAllocation.length} Active Sectors</span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-slate-800 my-3">
                {sectorAllocation.map(s => (
                  <div
                    key={s.sector}
                    style={{ width: `${s.pct}%`, background: s.color }}
                    className="h-full transition-all"
                    title={`${s.name}: ${s.pct.toFixed(1)}%`}
                  />
                ))}
              </div>

              {/* Sector Chips */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                {sectorAllocation.map(s => (
                  <div key={s.sector} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-xs truncate text-slate-300 font-medium">{s.name}</span>
                    </div>
                    <span className="text-xs font-bold text-white ml-2">{s.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span>Top Weight: {sectorAllocation[0]?.name} ({sectorAllocation[0]?.pct.toFixed(0)}%)</span>
              <span className={sectorAllocation[0]?.pct > 35 ? 'text-amber-400 font-semibold' : 'text-emerald-400'}>
                {sectorAllocation[0]?.pct > 35 ? '⚠️ High Sector Bias' : '✓ Well Distributed'}
              </span>
            </div>
          </div>

          {/* AI Actionable Insights */}
          <div className="lg:col-span-7 glass-card-static rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <span>🤖</span> AI Portfolio Advisor &amp; Rebalancing
              </h3>
              <span className="text-[10px] text-blue-400 font-semibold">Live Algorithmic Suggestions</span>
            </div>

            {aiSuggestions.length > 0 ? (
              <div className="space-y-2.5">
                {aiSuggestions.map((sug, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl flex items-start justify-between gap-3 transition-colors"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      borderLeft: `4px solid ${sug.badgeColor}`,
                      borderTop: '1px solid rgba(255,255,255,0.05)',
                      borderRight: '1px solid rgba(255,255,255,0.05)',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white flex items-center gap-1.5">
                        {sug.title}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{sug.desc}</p>
                    </div>

                    {sug.actionUrl && (
                      <Link
                        href={sug.actionUrl}
                        className="text-[11px] px-2.5 py-1 rounded-lg font-bold flex-shrink-0 cursor-pointer transition-all hover:brightness-125 whitespace-nowrap"
                        style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}
                      >
                        {sug.actionText} ➔
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-xs">
                Your portfolio risk is well-balanced across all metrics with no critical alerts.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Holdings Table ─── */}
      {holdings.length > 0 ? (
        <div className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          
          {/* Table Controls (Search & Filter) */}
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {(['all', 'gainers', 'losers'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTableFilter(tab)}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold capitalize transition-all cursor-pointer"
                  style={{
                    background: tableFilter === tab ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
                    color: tableFilter === tab ? '#ffffff' : 'var(--text-secondary)',
                  }}
                >
                  {tab === 'all' ? `All (${holdings.length})` : tab === 'gainers' ? `Gainers (${holdings.filter(h => h.pnl >= 0).length})` : `Losers (${holdings.filter(h => h.pnl < 0).length})`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <input
                type="text"
                placeholder="Filter holdings..."
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-800 text-white outline-none w-full sm:w-48"
              />
              <button
                type="button"
                onClick={clearPortfolio}
                className="text-[11px] text-rose-400 hover:text-rose-300 transition-colors whitespace-nowrap cursor-pointer px-2"
                title="Remove all holdings"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900/50" style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-semibold text-slate-400">Stock &amp; Sector</th>
                  <th className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-400 hidden sm:table-cell">Qty</th>
                  <th className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-400 hidden sm:table-cell">Avg Buy</th>
                  <th className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-400">LTP (CMP)</th>
                  <th className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-400 hidden md:table-cell">Current Val (Weight)</th>
                  <th className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-400">Unrealized P&amp;L</th>
                  <th className="px-3 py-3 text-center text-[10px] uppercase tracking-wider font-semibold text-slate-400">AI Conviction &amp; Targets</th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHoldings.map(h => (
                  <tr
                    key={h.symbol}
                    className="transition-colors border-b border-slate-800/60 hover:bg-slate-800/30"
                  >
                    {/* Stock Symbol + Sector */}
                    <td className="px-4 py-3.5">
                      <Link href={`/stock/${h.symbol}`} className="group block">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{SECTOR_ICONS[h.sector] || '📈'}</span>
                          <div>
                            <p className="text-sm font-bold text-blue-400 group-hover:underline flex items-center gap-1.5">
                              {h.symbol}
                              <span className="text-[10px] font-normal text-slate-500 uppercase tracking-wider hidden sm:inline">
                                • {h.sector}
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-400 truncate max-w-[180px]">{h.name}</p>
                          </div>
                        </div>
                      </Link>
                    </td>

                    {/* Qty */}
                    <td className="px-3 py-3.5 text-right hidden sm:table-cell">
                      <span className="text-xs font-bold text-white">{h.qty}</span>
                    </td>

                    {/* Avg Buy */}
                    <td className="px-3 py-3.5 text-right hidden sm:table-cell">
                      <span className="text-xs font-semibold text-slate-300">
                        ₹{h.avgPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>

                    {/* Current Price (CMP) */}
                    <td className="px-3 py-3.5 text-right">
                      <p className="text-xs font-black text-white">
                        ₹{h.currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] font-bold" style={{ color: h.changePercent >= 0 ? '#00d68f' : '#ff4d6a' }}>
                        {h.changePercent >= 0 ? '+' : ''}{h.changePercent.toFixed(2)}%
                      </p>
                    </td>

                    {/* Current Value + Weight */}
                    <td className="px-3 py-3.5 text-right hidden md:table-cell">
                      <p className="text-xs font-bold text-white">
                        ₹{h.currentValue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </p>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {h.weight.toFixed(1)}% of port.
                      </span>
                    </td>

                    {/* Unrealized P&L */}
                    <td className="px-3 py-3.5 text-right">
                      <p className="text-xs font-black" style={{ color: h.pnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                        {h.pnl >= 0 ? '+' : ''}₹{h.pnl.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-[10px] font-bold" style={{ color: h.pnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                        {h.pnlPercent >= 0 ? '+' : ''}{h.pnlPercent.toFixed(2)}%
                      </p>
                    </td>

                    {/* AI Signal Badge & Target Price */}
                    <td className="px-3 py-3.5 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span
                          className="text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1"
                          style={{
                            background: h.aiSignal === 'bullish' ? 'rgba(0,214,143,0.15)' : h.aiSignal === 'bearish' ? 'rgba(255,77,106,0.15)' : 'rgba(245,158,11,0.15)',
                            color: h.aiSignal === 'bullish' ? '#00d68f' : h.aiSignal === 'bearish' ? '#ff4d6a' : '#f59e0b',
                            border: `1px solid ${h.aiSignal === 'bullish' ? 'rgba(0,214,143,0.3)' : h.aiSignal === 'bearish' ? 'rgba(255,77,106,0.3)' : 'rgba(245,158,11,0.3)'}`,
                          }}
                        >
                          <span>{h.aiSignal === 'bullish' ? '▲' : h.aiSignal === 'bearish' ? '▼' : '◆'}</span>
                          <span>{h.aiSignal?.toUpperCase()} ({h.aiConfidence}%)</span>
                        </span>
                        {h.targetPrice && (
                          <span className="text-[9px] text-slate-400 mt-0.5">
                            Target: <span className="text-slate-200 font-semibold">₹{h.targetPrice}</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions: Edit & Delete */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEditClick(h)}
                          className="text-[11px] px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors"
                          title="Edit Quantity or Avg Price"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => removeHolding(h.symbol)}
                          className="text-[11px] px-2 py-1 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 cursor-pointer transition-colors"
                          title="Remove from portfolio"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !loading ? (
        /* Empty State */
        <div className="text-center py-16 px-4 rounded-2xl border border-slate-800 bg-slate-900/40">
          <p className="text-5xl mb-4">💼</p>
          <h2 className="text-lg font-bold text-white mb-1.5">No Portfolio Holdings Yet</h2>
          <p className="text-xs max-w-md mx-auto mb-6 text-slate-400 leading-relaxed">
            Add your stock investments to track live P&amp;L, sector concentration, and receive automated AI profit-booking and accumulation suggestions.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                setShowAdd(true);
                setEditingStock(null);
              }}
              className="text-xs px-5 py-2.5 rounded-xl font-bold transition-all cursor-pointer shadow-lg hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white' }}
            >
              + Add Your First Holding
            </button>

            <button
              onClick={loadSamplePortfolio}
              className="text-xs px-5 py-2.5 rounded-xl font-bold transition-all cursor-pointer border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
            >
              ⚡ Load Sample Portfolio (5 Stocks)
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
