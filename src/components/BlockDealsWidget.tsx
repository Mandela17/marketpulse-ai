'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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

interface BlockDealsWidgetProps {
  symbol?: string;
  limit?: number;
}

export default function BlockDealsWidget({ symbol, limit = 10 }: BlockDealsWidgetProps) {
  const [deals, setDeals] = useState<BlockDeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDeals() {
      try {
        const url = symbol 
          ? `/api/block-deals?symbol=${symbol}&limit=${limit}&_t=${Date.now()}`
          : `/api/block-deals?limit=${limit}&_t=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        if (data.success) {
          setDeals(data.deals || []);
        }
      } catch (err) {
        console.error('[BlockDeals] Fetch failed:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchDeals();
  }, [symbol, limit]);

  if (loading) {
    return (
      <div className="glass-card-static rounded-2xl p-5 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-40 rounded" style={{ background: 'var(--border-color)' }} />
          <div className="h-4 w-12 rounded" style={{ background: 'var(--border-color)' }} />
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-white/5">
              <div className="space-y-1.5">
                <div className="h-3 w-16 rounded" style={{ background: 'var(--border-color)' }} />
                <div className="h-2 w-32 rounded" style={{ background: 'var(--border-color)' }} />
              </div>
              <div className="h-4 w-20 rounded" style={{ background: 'var(--border-color)' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card-static rounded-2xl p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🏛️</span>
          <h3 className="text-sm font-bold text-white">
            {symbol ? `${symbol} Dark Pool Deals` : 'Institutional Block Deals'}
          </h3>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase"
          style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
          Smart Money
        </span>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[380px] pr-1 space-y-2 no-scrollbar">
        {deals.length > 0 ? (
          deals.map((deal) => {
            const isUltra = deal.dealType === 'Ultra Block';
            const isBuy = deal.action === 'BUY';
            const timeStr = new Date(deal.timestamp).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            });
            const dateStr = new Date(deal.timestamp).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
            });

            return (
              <div key={deal.id}
                className="p-3 rounded-xl transition-all border border-white/[0.02] hover:border-white/10"
                style={{ background: 'rgba(255,255,255,0.01)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {!symbol && (
                      <Link href={`/stock/${deal.symbol}`} className="text-xs font-black text-white hover:text-blue-400">
                        {deal.symbol}
                      </Link>
                    )}
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
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    {dateStr}, {timeStr}
                  </span>
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
                  <div className="flex justify-between text-[9px] text-white/40">
                    <span>Shares: {deal.quantity.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No recent block deals recorded</p>
          </div>
        )}
      </div>
    </div>
  );
}
