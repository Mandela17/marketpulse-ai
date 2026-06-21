'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/news', label: 'News Feed', icon: '📰' },
  { href: '/sectors', label: 'Sectors', icon: '📈' },
  { href: '/watchlist', label: 'Watchlist', icon: '⭐' },
];

const hotSectors = [
  { id: 'energy', label: 'Energy & Oil', icon: '⛽' },
  { id: 'power', label: 'Power', icon: '⚡' },
  { id: 'auto', label: 'Auto', icon: '🚗' },
  { id: 'gold', label: 'Gold', icon: '🥇' },
  { id: 'ev', label: 'EV', icon: '🔋' },
  { id: 'defense', label: 'Defense', icon: '🛡️' },
  { id: 'banking', label: 'Banking', icon: '🏦' },
  { id: 'it', label: 'IT', icon: '💻' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 flex flex-col z-40"
      style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }}>
      
      {/* Logo */}
      <div className="p-5 flex items-center gap-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
          style={{ background: 'linear-gradient(135deg, var(--gradient-start), var(--gradient-end))' }}>
          🧠
        </div>
        <div>
          <h1 className="text-base font-bold gradient-text">MarketPulse</h1>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>AI Sentiment Engine</p>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <Link href="/search">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
            style={{ 
              background: 'var(--bg-card)', 
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
            }}>
            🔍 <span>Search stocks...</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="px-3 mt-1">
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider" 
          style={{ color: 'var(--text-muted)' }}>
          Navigation
        </p>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mb-0.5 transition-all cursor-pointer ${
                  isActive ? 'font-semibold' : ''
                }`}
                style={{
                  background: isActive ? 'var(--accent-blue-dim)' : 'transparent',
                  color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--bg-card)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Hot Sectors */}
      <div className="px-3 mt-5 flex-1 overflow-y-auto">
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider" 
          style={{ color: 'var(--text-muted)' }}>
          Hot Sectors
        </p>
        {hotSectors.map((sector) => (
          <Link key={sector.id} href={`/sector/${sector.id}`}>
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-0.5 transition-all cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span className="text-base">{sector.icon}</span>
              {sector.label}
            </div>
          </Link>
        ))}
      </div>

      {/* Market Status Footer */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" 
            style={{ background: 'var(--accent-red)', animation: 'pulse-glow 2s infinite' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Market Closed
          </span>
        </div>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Last updated: {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </aside>
  );
}
