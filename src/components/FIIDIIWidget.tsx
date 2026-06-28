'use client';

import { useEffect, useState } from 'react';
import { FIIDIIFlow } from '@/lib/fiiDiiData';

interface FIIDIIData {
  today: FIIDIIFlow | null;
  recent: FIIDIIFlow[];
}

export default function FIIDIIWidget() {
  const [data, setData] = useState<FIIDIIData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/fii-dii')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="glass-card-static rounded-2xl p-5">
        <h3 className="text-sm font-bold mb-4 text-white flex items-center gap-2">
          🏛️ FII / DII Flows
        </h3>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
        </div>
      </div>
    );
  }

  const today = data?.today;
  const recent = data?.recent || [];

  // Calculate streak
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

  const maxFlow = recent.length > 0
    ? Math.max(...recent.map(f => Math.max(Math.abs(f.fiiNet), Math.abs(f.diiNet))), 1)
    : 1;

  return (
    <div className="glass-card-static rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          🏛️ FII / DII Flows
        </h3>
        {today && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
            style={{
              background: today.fiiNet >= 0 ? 'rgba(0,214,143,0.15)' : 'rgba(255,77,106,0.15)',
              color: today.fiiNet >= 0 ? '#00d68f' : '#ff4d6a',
            }}>
            {today.fiiNet >= 0 ? '🟢 FII BUYING' : '🔴 FII SELLING'}
          </span>
        )}
      </div>

      {/* Today's Flow */}
      {today ? (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* FII */}
          <div className="p-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              FII / FPI
            </p>
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

          {/* DII */}
          <div className="p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              DII
            </p>
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
      ) : (
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          FII/DII data not available for today
        </p>
      )}

      {/* Streak Indicator */}
      {fiiStreak !== 0 && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg"
          style={{ background: fiiStreak > 0 ? 'rgba(0,214,143,0.06)' : 'rgba(255,77,106,0.06)' }}>
          <span className="text-xs font-bold" style={{ color: fiiStreak > 0 ? '#00d68f' : '#ff4d6a' }}>
            {fiiStreak > 0 ? '🔥' : '❄️'} FII {fiiStreak > 0 ? 'buying' : 'selling'} streak: {Math.abs(fiiStreak)} days
          </span>
        </div>
      )}

      {/* Mini Bar Chart — Last 7 days */}
      {recent.length > 0 && (
        <div>
          <p className="text-[10px] uppercase font-bold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Last {Math.min(7, recent.length)} Days Net Flow (₹ Cr)
          </p>
          <div className="space-y-1.5">
            {recent.slice(0, 7).reverse().map((flow, i) => {
              const fiiPct = (Math.abs(flow.fiiNet) / maxFlow) * 100;
              const diiPct = (Math.abs(flow.diiNet) / maxFlow) * 100;
              const dayLabel = new Date(flow.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });

              return (
                <div key={flow.date} className="flex items-center gap-2" style={{ animationDelay: `${i * 50}ms` }}>
                  <span className="text-[9px] w-12 shrink-0 text-right" style={{ color: 'var(--text-muted)' }}>
                    {dayLabel}
                  </span>
                  <div className="flex-1 flex gap-1 items-center">
                    {/* FII bar */}
                    <div className="flex-1 h-3.5 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <div
                        className="h-full rounded-sm transition-all duration-500"
                        style={{
                          width: `${Math.max(fiiPct, 3)}%`,
                          background: flow.fiiNet >= 0
                            ? 'linear-gradient(90deg, #00d68f, #34d399)'
                            : 'linear-gradient(90deg, #ff4d6a, #f87171)',
                        }}
                      />
                    </div>
                    <span className="text-[9px] font-bold w-14 text-right shrink-0"
                      style={{ color: flow.fiiNet >= 0 ? '#00d68f' : '#ff4d6a' }}>
                      {flow.fiiNet >= 0 ? '+' : ''}{(flow.fiiNet / 1000).toFixed(1)}k
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
              <span className="w-2 h-2 rounded-sm" style={{ background: '#3b82f6' }} /> FII
            </span>
            <span className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
              <span className="w-2 h-2 rounded-sm" style={{ background: '#8b5cf6' }} /> DII
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
