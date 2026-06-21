'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { searchStocks, ALL_STOCKS } from '@/lib/sectorData';

export default function StockSearch({ onClose }: { onClose?: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ symbol: string; name: string; sector: string }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const cleanQuery = query.trim().toUpperCase();
    if (cleanQuery.length >= 1) {
      const dbResults = searchStocks(cleanQuery);
      const exactMatch = ALL_STOCKS.some(s => s.symbol === cleanQuery);

      const listToShow = [...dbResults];
      if (cleanQuery.length >= 2 && !exactMatch) {
        listToShow.push({
          symbol: cleanQuery,
          name: `Go to details for "${cleanQuery}"`,
          sector: 'general',
        });
      }

      setResults(listToShow);
      setSelectedIndex(0);
    } else {
      setResults([]);
    }
  }, [query]);

  const handleSelect = (symbol: string) => {
    router.push(`/stock/${symbol}`);
    onClose?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex].symbol);
    } else if (e.key === 'Escape') {
      onClose?.();
    }
  };

  const sectorIcons: Record<string, string> = {
    energy: '⛽', power: '⚡', auto: '🚗', gold: '🥇', ev: '🔋',
    banking: '🏦', it: '💻', pharma: '💊', defense: '🛡️',
    metals: '⛏️', fmcg: '🛒', realestate: '🏗️',
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Search Input */}
      <div className="relative">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--accent-blue)',
            boxShadow: '0 0 20px rgba(91, 140, 255, 0.15)',
          }}>
          <span className="text-lg">🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search any stock... (e.g., RELIANCE, TATA, HDFC)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="text-sm px-2 py-0.5 rounded hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}>
              ✕
            </button>
          )}
        </div>

        {/* Results dropdown */}
        {results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-50 glass-card"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}>
            {results.map((stock, i) => (
              <div
                key={stock.symbol}
                onClick={() => handleSelect(stock.symbol)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                style={{
                  background: i === selectedIndex ? 'var(--bg-card-hover)' : 'transparent',
                  borderBottom: i < results.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="text-base">{sectorIcons[stock.sector] || '📈'}</span>
                <div className="flex-1">
                  <span className="text-sm font-semibold" style={{ color: 'var(--accent-blue)' }}>
                    {stock.symbol}
                  </span>
                  <span className="text-xs ml-2" style={{ color: 'var(--text-secondary)' }}>
                    {stock.name}
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full capitalize"
                  style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
                  {stock.sector}
                </span>
              </div>
            ))}
          </div>
        )}

        {query.length >= 1 && results.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 rounded-xl p-4 text-center"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
            }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No stocks found for &quot;{query}&quot;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
