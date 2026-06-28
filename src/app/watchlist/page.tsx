'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ALL_STOCKS, searchStocks, getStockBySymbol } from '@/lib/sectorData';
import { getSentimentColor, getSentimentLabel, SectorData } from '@/lib/types';
import { DEMO_SECTORS } from '@/lib/mockData';
import { useAuth } from '@/context/AuthContext';

interface LiveQuote {
  price: number;
  change: number;
  changePercent: number;
  prediction?: { direction: string; probability: number } | null;
}

export default function WatchlistPage() {
  const { watchlist, toggleWatchlist } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string; sector: string }[]>([]);
  const [sectors, setSectors] = useState<SectorData[]>(DEMO_SECTORS);
  const [quotes, setQuotes] = useState<Map<string, LiveQuote>>(new Map());
  const [loading, setLoading] = useState(true);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'change' | 'price'>('default');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch live sentiments on mount
  useEffect(() => {
    async function fetchLiveSentiments() {
      try {
        const res = await fetch('/api/news').then(r => r.json());
        if (res && res.sectorSentiments) {
          setSectors(Object.values(res.sectorSentiments));
        }
      } catch (e) {
        console.error('Failed to fetch live sentiments for watchlist:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchLiveSentiments();
  }, []);

  // Fetch live quotes for watchlist stocks
  useEffect(() => {
    if (watchlist.length === 0) return;
    setQuotesLoading(true);

    async function fetchQuotes() {
      const results = new Map<string, LiveQuote>();
      const batchSize = 5;

      for (let i = 0; i < watchlist.length; i += batchSize) {
        const batch = watchlist.slice(i, i + batchSize);
        const promises = batch.map(async (symbol) => {
          try {
            const [stockRes, predRes] = await Promise.all([
              fetch(`/api/stock?symbol=${symbol}`).then(r => r.json()).catch(() => null),
              fetch(`/api/predict?symbol=${symbol}`).then(r => r.json()).catch(() => null),
            ]);

            if (stockRes) {
              const q = stockRes.quote || stockRes;
              if (q.price > 0) {
                results.set(symbol, {
                  price: q.price,
                  change: q.change || 0,
                  changePercent: q.changePercent || 0,
                  prediction: predRes?.prediction ? {
                    direction: predRes.prediction.direction,
                    probability: predRes.prediction.probability,
                  } : null,
                });
              }
            }
          } catch {}
        });
        await Promise.all(promises);
      }
      setQuotes(results);
      setQuotesLoading(false);
    }

    fetchQuotes();
  }, [watchlist]);

  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update search results
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length > 0) {
      const results = searchStocks(query);
      const filtered = results.filter(s => !watchlist.includes(s.symbol));

      const cleanQuery = query.toUpperCase();
      const alreadyInWatchlist = watchlist.includes(cleanQuery);
      const exactMatchInStocks = ALL_STOCKS.some(s => s.symbol === cleanQuery);

      const listToShow = [...filtered];
      if (cleanQuery.length >= 2 && !alreadyInWatchlist && !exactMatchInStocks) {
        listToShow.push({
          symbol: cleanQuery,
          name: `Add "${cleanQuery}" as custom stock`,
          sector: 'general',
        });
      }

      setSearchResults(listToShow);
      setShowDropdown(true);
    } else {
      setSearchResults([]);
      setShowDropdown(false);
    }
  }, [searchQuery, watchlist]);

  const addStock = (symbol: string) => {
    const cleanSymbol = symbol.toUpperCase();
    if (!watchlist.includes(cleanSymbol)) {
      toggleWatchlist(cleanSymbol);
    }
    setSearchQuery('');
    setShowDropdown(false);
  };

  const removeStock = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleWatchlist(symbol);
  };

  const sectorIcons: Record<string, string> = {
    energy: '⛽', power: '⚡', auto: '🚗', gold: '🥇', ev: '🔋',
    banking: '🏦', it: '💻', pharma: '💊', defense: '🛡️',
    metals: '⛏️', fmcg: '🛒', realestate: '🏗️',
  };

  const popularSuggestions = [
    { symbol: 'RELIANCE', name: 'Reliance Industries' },
    { symbol: 'TATAMOTORS', name: 'Tata Motors' },
    { symbol: 'SBIN', name: 'State Bank of India' },
    { symbol: 'INFY', name: 'Infosys' },
    { symbol: 'HAL', name: 'Hindustan Aeronautics' },
  ];

  // Sort watchlist
  const sortedWatchlist = [...watchlist].sort((a, b) => {
    if (sortBy === 'change') {
      const aChange = quotes.get(a)?.changePercent || 0;
      const bChange = quotes.get(b)?.changePercent || 0;
      return bChange - aChange;
    }
    if (sortBy === 'price') {
      const aPrice = quotes.get(a)?.price || 0;
      const bPrice = quotes.get(b)?.price || 0;
      return bPrice - aPrice;
    }
    return 0;
  });

  // Portfolio summary
  const allChanges = Array.from(quotes.values()).map(q => q.changePercent);
  const avgChange = allChanges.length > 0 ? allChanges.reduce((s, c) => s + c, 0) / allChanges.length : 0;
  const gainers = allChanges.filter(c => c > 0).length;
  const losers = allChanges.filter(c => c < 0).length;
  const bullishPredictions = Array.from(quotes.values()).filter(q => q.prediction?.direction === 'bullish').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">⭐ My Watchlist</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Live prices, AI predictions & sentiment for your stocks
          </p>
        </div>

        {/* Add Stock Search Input */}
        <div className="relative w-full md:w-80" ref={dropdownRef}>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
            }}>
            <span>🔍</span>
            <input
              type="text"
              placeholder="Add stock to watchlist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery && setShowDropdown(true)}
              className="bg-transparent outline-none text-sm w-full"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

          {/* Autocomplete Dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50 shadow-2xl max-h-64 overflow-y-auto"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
              }}>
              {searchResults.map((stock) => (
                <div
                  key={stock.symbol}
                  onClick={() => addStock(stock.symbol)}
                  className="flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div>
                    <span className="text-xs font-bold" style={{ color: 'var(--accent-blue)' }}>
                      {stock.symbol}
                    </span>
                    <span className="text-[10px] ml-2" style={{ color: 'var(--text-secondary)' }}>
                      {stock.name}
                    </span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded capitalize"
                    style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
                    {sectorIcons[stock.sector] || '📈'} {stock.sector}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary Strip */}
      {watchlist.length > 0 && quotes.size > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 animate-fade-in-up">
          <div className="glass-card-static rounded-xl p-3.5">
            <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Avg Change</p>
            <p className="text-xl font-black" style={{ color: avgChange >= 0 ? '#00d68f' : '#ff4d6a' }}>
              {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
            </p>
          </div>
          <div className="glass-card-static rounded-xl p-3.5">
            <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Gainers / Losers</p>
            <p className="text-xl font-black">
              <span style={{ color: '#00d68f' }}>{gainers}</span>
              <span className="text-xs mx-1" style={{ color: 'var(--text-muted)' }}>/</span>
              <span style={{ color: '#ff4d6a' }}>{losers}</span>
            </p>
          </div>
          <div className="glass-card-static rounded-xl p-3.5">
            <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>AI Bullish</p>
            <p className="text-xl font-black" style={{ color: '#00d68f' }}>{bullishPredictions}/{quotes.size}</p>
          </div>
          <div className="glass-card-static rounded-xl p-3.5">
            <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Stocks Tracked</p>
            <p className="text-xl font-black text-white">{watchlist.length}</p>
          </div>
        </div>
      )}

      {/* Sort Controls */}
      {watchlist.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          {(['default', 'change', 'price'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className="text-[10px] px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer capitalize"
              style={{
                background: sortBy === s ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
                color: sortBy === s ? '#60a5fa' : 'var(--text-muted)',
                border: `1px solid ${sortBy === s ? 'rgba(59,130,246,0.3)' : 'var(--border-subtle)'}`,
              }}>
              {s === 'default' ? 'Added Order' : s === 'change' ? 'By Change %' : 'By Price'}
            </button>
          ))}
        </div>
      )}

      {/* Watchlist Table */}
      {watchlist.length > 0 ? (
        <div className="rounded-xl overflow-hidden shadow-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Stock</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>Price</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Change</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>Sector</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>AI Signal</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedWatchlist.map((symbol) => {
                const stock = getStockBySymbol(symbol);
                const sectorName = stock?.sector || 'N/A';
                const quote = quotes.get(symbol);
                const change = quote?.changePercent || 0;
                const pred = quote?.prediction;

                return (
                  <tr key={symbol}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td className="px-4 py-3.5">
                      <Link href={`/stock/${symbol}`}>
                        <div>
                          <p className="text-sm font-bold hover:underline" style={{ color: 'var(--accent-blue)' }}>
                            {symbol}
                          </p>
                          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {stock?.name || symbol}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                      {quote ? (
                        <span className="text-sm font-bold text-white">
                          ₹{quote.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {quotesLoading ? '...' : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {quote ? (
                        <div>
                          <span className="text-sm font-bold" style={{ color: change >= 0 ? '#00d68f' : '#ff4d6a' }}>
                            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                          </span>
                          <p className="text-[10px]" style={{ color: change >= 0 ? '#00d68f' : '#ff4d6a' }}>
                            {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {quotesLoading ? '...' : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center hidden md:table-cell">
                      <span className="text-[10px] px-2 py-0.5 rounded-full capitalize font-medium"
                        style={{ background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)' }}>
                        {sectorIcons[sectorName] || '📈'} {sectorName}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center hidden md:table-cell">
                      {pred ? (
                        <span className="text-[10px] px-2.5 py-1 rounded-full font-bold"
                          style={{
                            background: pred.direction === 'bullish' ? 'rgba(0,214,143,0.15)' : 'rgba(255,77,106,0.15)',
                            color: pred.direction === 'bullish' ? '#00d68f' : '#ff4d6a',
                          }}>
                          {pred.direction === 'bullish' ? '🟢' : '🔴'} {pred.direction.toUpperCase()} {pred.probability}%
                        </span>
                      ) : (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/stock/${symbol}`}
                          className="text-[10px] px-2.5 py-1 rounded-lg font-bold transition-all hover:brightness-125"
                          style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>
                          View
                        </Link>
                        <button
                          onClick={(e) => removeStock(symbol, e)}
                          className="text-[10px] px-2 py-1 rounded-lg font-bold transition-all hover:brightness-125 cursor-pointer"
                          style={{ background: 'rgba(255,77,106,0.1)', color: '#ff4d6a' }}
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
      ) : (
        /* Empty State */
        <div className="rounded-xl p-8 text-center"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <p className="text-4xl mb-3">⭐</p>
          <h2 className="text-base font-bold mb-1 text-white">Your Watchlist is Empty</h2>
          <p className="text-xs mb-6 max-w-sm mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Use the search box above to add your favorite Indian stocks, or add these popular suggestions:
          </p>

          <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
            {popularSuggestions.map((stock) => (
              <button
                key={stock.symbol}
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
          </div>
        </div>
      )}
    </div>
  );
}
