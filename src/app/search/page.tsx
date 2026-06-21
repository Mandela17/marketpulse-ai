'use client';

import StockSearch from '@/components/StockSearch';
import { useRouter } from 'next/navigation';

export default function SearchPage() {
  const router = useRouter();

  return (
    <div className="p-6 min-h-[80vh] flex flex-col items-center justify-center">
      <div className="text-center mb-8 animate-slide-up">
        <h1 className="text-3xl font-bold mb-2 gradient-text">Search Stocks</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Get AI-powered sentiment analysis for any NSE/BSE stock
        </p>
      </div>

      <div className="w-full max-w-xl animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <StockSearch onClose={() => router.push('/')} />
      </div>

      {/* Popular searches */}
      <div className="mt-8 text-center animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Popular searches</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {['RELIANCE', 'TATAMOTORS', 'HDFCBANK', 'ADANIGREEN', 'HAL', 'TITAN', 'TCS', 'NTPC'].map((sym) => (
            <button key={sym}
              onClick={() => router.push(`/stock/${sym}`)}
              className="text-xs px-3 py-1.5 rounded-full transition-all cursor-pointer"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-blue)';
                e.currentTarget.style.color = 'var(--accent-blue)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}>
              {sym}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
