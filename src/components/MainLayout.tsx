'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import AuthGuard from '@/components/AuthGuard';
import { Menu } from 'lucide-react';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Get current page name for mobile header
  const pageNames: Record<string, string> = {
    '/': 'Dashboard',
    '/news': 'News Feed',
    '/predictions': 'AI Predictions',
    '/sectors': 'Sectors',
    '/watchlist': 'Watchlist',
    '/broker': 'Broker API',
    '/search': 'Search',
  };
  const currentPageName = pageNames[pathname] || 'MarketPulse';

  return (
    <AuthGuard>
      {!isAuthPage && (
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}
      <main
        style={{
          flex: 1,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: 'var(--bg-primary)',
        }}
      >
        {/* Mobile / Tablet Top Header */}
        {!isAuthPage && (
          <header
            className="lg:hidden"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              height: 'var(--header-height)',
              background: 'rgba(6, 9, 20, 0.85)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderBottom: '1px solid var(--border-subtle)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                id="mobile-menu-toggle"
                onClick={() => setSidebarOpen(true)}
                style={{ padding: '8px', marginLeft: '-8px', borderRadius: '8px', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <Menu size={20} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{ width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', background: 'var(--gradient-brand)' }}
                >
                  🧠
                </div>
                <span style={{ color: 'white', fontWeight: 600, fontSize: '14px', letterSpacing: '0.025em' }}>{currentPageName}</span>
              </div>
            </div>
          </header>
        )}

        {/* Page content */}
        <div style={{
          flex: 1,
          padding: isAuthPage ? '0' : '24px',
          paddingBottom: isAuthPage ? '0' : '32px',
        }}>
          {children}
        </div>
      </main>
    </AuthGuard>
  );
}
