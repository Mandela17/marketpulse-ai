'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ALL_STOCKS, searchStocks, getStockBySymbol } from '@/lib/sectorData';
import { getSentimentColor, getSentimentLabel, SectorData } from '@/lib/types';
import { DEMO_SECTORS } from '@/lib/mockData';

const DEFAULT_WATCHLIST = [
  'RELIANCE', 'TATAMOTORS', 'ADANIGREEN', 'HAL', 'TITAN',
  'HDFCBANK', 'TCS', 'NTPC', 'OLECTRA', 'MARUTI',
];

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string; sector: string }[]>([]);
  const [sectors, setSectors] = useState<SectorData[]>(DEMO_SECTORS);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load watchlist from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('marketpulse_watchlist');
    if (saved) {
      try {
        setWatchlist(JSON.parse(saved));
      } catch (e) {
        setWatchlist(DEFAULT_WATCHLIST);
      }
    } else {
      setWatchlist(DEFAULT_WATCHLIST);
      localStorage.setItem('marketpulse_watchlist', JSON.stringify(DEFAULT_WATCHLIST));
    }

    // Fetch live sentiments
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

  // Save watchlist to localStorage whenever it changes
  const saveWatchlist = (newList: string[]) => {
    setWatchlist(newList);
    localStorage.setItem('marketpulse_watchlist', JSON.stringify(newList));
  };

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
      const updated = [...watchlist, cleanSymbol];
      saveWatchlist(updated);
    }
    setSearchQuery('');
    setShowDropdown(false);
  };

  const removeStock = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const updated = watchlist.filter(s => s !== symbol);
    saveWatchlist(updated);
  };

  const sectorIcons: Record<string, string> = {
    energy: '⛽', power: '⚡', auto: '🚗', gold: '🥇', ev: '🔋',
    banking: '🏦', it: '💻', pharma: '💊', defense: '🛡️',
    metals: '⛏️', fmcg: '🛒', realestate: '🏗️',
  };

  // Popular stocks to suggest if watchlist is empty
  const popularSuggestions = [
    { symbol: 'RELIANCE', name: 'Reliance Industries' },
    { symbol: 'TATAMOTORS', name: 'Tata Motors' },
    { symbol: 'SBIN', name: 'State Bank of India' },
    { symbol: 'INFY', name: 'Infosys' },
    { symbol: 'HAL', name: 'Hindustan Aeronautics' },
  ];

  return (
    <div className="p-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            ⭐ My Watchlist
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Track customized sentiment for your favorite stocks
          </p>
        </div>

        {/* Add Stock Search Input */}
        <div className="relative w-full md:w-80" ref={dropdownRef}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
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
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-50 shadow-2xl"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
              }}>
              {searchResults.map((stock) => (
                <div
                  key={stock.symbol}
                  onClick={() => addStock(stock.symbol)}
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-opacity-80 transition-colors"
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
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

      {/* Watchlist Table */}
      {watchlist.length > 0 ? (
        <div className="rounded-xl overflow-hidden shadow-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Stock</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Sector</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Sentiment</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Label</th>
                <th className="text-right px-6 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {watchlist.map((symbol) => {
                const stock = getStockBySymbol(symbol);
                const sectorName = stock?.sector || 'N/A';
                const sector = sectors.find(s => s.id === sectorName);
                
                // Deterministic sentiment calculation based on sector sentiment + symbol offset
                const hash = symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                const baseSentiment = sector?.sentiment ?? 50;
                const score = Math.max(10, Math.min(90, baseSentiment + ((hash % 20) - 10)));
                const color = getSentimentColor(score);

                return (
                  <tr key={symbol}
                    className="transition-colors border-b"
                    style={{ borderBottom: '1px solid var(--border-color)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td className="px-4 py-4">
                      <Link href={`/stock/${symbol}`}>
                        <div>
                          <p className="text-sm font-bold hover:underline" style={{ color: 'var(--accent-blue)' }}>
                            {symbol}
                          </p>
                          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {stock?.name || 'Unknown Company'}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-xs px-2 py-0.5 rounded-full capitalize font-medium"
                        style={{ background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)' }}>
                        {sectorIcons[sectorName] || '📈'} {sectorName}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm font-bold" style={{ color }}>
                        {score}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-xs font-semibold" style={{ color }}>
                        {getSentimentLabel(score)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/stock/${symbol}`}
                          className="text-[10px] px-2.5 py-1 rounded font-semibold transition-all hover:opacity-90"
                          style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)' }}>
                          Analyze
                        </Link>
                        <button
                          onClick={(e) => removeStock(symbol, e)}
                          title="Remove from Watchlist"
                          className="text-[10px] px-2 py-1 rounded font-semibold transition-all hover:bg-opacity-25"
                          style={{ background: 'rgba(255, 77, 106, 0.1)', color: 'var(--accent-red)' }}
                        >
                          Remove
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
          <h2 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Your Watchlist is Empty
          </h2>
          <p className="text-xs mb-6 max-w-sm mx-auto animate-pulse" style={{ color: 'var(--text-secondary)' }}>
            Use the search box above to add your favorite Indian stocks, or add these popular suggestions:
          </p>

          <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
            {popularSuggestions.map((stock) => (
              <button
                key={stock.symbol}
                onClick={() => addStock(stock.symbol)}
                className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-all hover:opacity-80"
                style={{
                  background: 'var(--bg-primary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              >
                + {stock.symbol} ({stock.name})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
