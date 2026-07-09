'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { LayoutDashboard, Newspaper, TrendingUp, Star, Plug, ChevronRight, LogOut, X, Grid3x3, Search, Briefcase, Scale, Shield, GraduationCap, Target, FileText } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/heatmap', label: 'Heatmap', icon: Grid3x3 },
  { href: '/screener', label: 'Screener', icon: Search },
  { href: '/strategies', label: 'Strategy Hub', icon: Target },
  { href: '/paper-trading', label: 'Paper Trading', icon: FileText },
  { href: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { href: '/compare', label: 'Compare', icon: Scale },
  { href: '/news', label: 'News Feed', icon: Newspaper },
  { href: '/predictions', label: 'AI Predictions', icon: TrendingUp },
  { href: '/learning', label: 'Trading Academy', icon: GraduationCap },
  { href: '/sectors', label: 'Sectors', icon: TrendingUp },
  { href: '/watchlist', label: 'Watchlist', icon: Star },
  { href: '/broker', label: 'Broker API', icon: Plug },
];

const adminItems = [
  { href: '/admin', label: 'Admin Panel', icon: Shield },
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

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Checks if Indian stock market (NSE/BSE) is currently open.
 * Market hours: Mon-Fri, 9:15 AM - 3:30 PM IST
 * Does not account for market holidays.
 */
function isMarketOpen(): boolean {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600000);

  const day = ist.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // 9:15 AM = 555 min, 3:30 PM = 930 min
  return totalMinutes >= 555 && totalMinutes <= 930;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, loading, isAdmin } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    setMarketOpen(isMarketOpen());

    // Re-check market status every minute
    const interval = setInterval(() => {
      setMarketOpen(isMarketOpen());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    onClose();
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
    router.refresh();
  };

  const userInitials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'U';
  const userDisplayName = user?.email ? user.email.split('@')[0] : 'User';

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden animate-fade-in"
          style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50
          transform transition-transform duration-300 ease-out
          lg:translate-x-0 lg:static
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{
          width: 'var(--sidebar-width)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-subtle)',
          backdropFilter: 'blur(25px) saturate(180%)',
          WebkitBackdropFilter: 'blur(25px) saturate(180%)',
        }}
      >
        {/* Top accent bar */}
        <div
          style={{ height: '2px', width: '100%', flexShrink: 0, background: 'var(--gradient-brand)' }}
        />

        {/* Logo Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            flexShrink: 0,
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                flexShrink: 0,
                background: 'var(--gradient-brand)',
                boxShadow: '0 4px 16px rgba(59, 130, 246, 0.25)',
              }}
            >
              🧠
            </div>
            <div>
              <h1 style={{ fontSize: '14px', fontWeight: 700 }} className="gradient-text">MarketPulse</h1>
              <p style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                AI Sentiment Engine
              </p>
            </div>
          </div>
          {/* Close button on mobile */}
          <button
            onClick={onClose}
            className="lg:hidden"
            style={{ padding: '6px', borderRadius: '8px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 16px', flexShrink: 0 }}>
          <Link href="/search">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '12px',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
            >
              🔍 <span>Search stocks...</span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '0 12px', marginTop: '4px', flexShrink: 0 }}>
          <p style={{
            padding: '0 12px',
            marginBottom: '8px',
            fontSize: '9px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: 'var(--text-muted)',
          }}>
            Navigation
          </p>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    marginBottom: '2px',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    fontWeight: isActive ? 600 : 400,
                    background: isActive ? 'var(--accent-blue-dim)' : 'transparent',
                    color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    border: isActive ? '1px solid rgba(59, 130, 246, 0.15)' : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {/* Active left accent */}
                  {isActive && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '3px',
                        height: '20px',
                        borderRadius: '0 4px 4px 0',
                        background: 'var(--accent-blue)',
                      }}
                    />
                  )}
                  <item.icon size={17} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  {isActive && (
                    <ChevronRight size={13} style={{ marginLeft: 'auto', opacity: 0.4, flexShrink: 0 }} />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Admin Navigation - only visible to admins */}
        {isAdmin && (
          <nav style={{ padding: '0 12px', marginTop: '12px', flexShrink: 0 }}>
            <p style={{
              padding: '0 12px',
              marginBottom: '8px',
              fontSize: '9px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: '#a855f7',
            }}>
              🛡️ Admin
            </p>
            {adminItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '9px 14px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: isActive ? 600 : 500,
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.2s ease',
                      color: isActive ? '#a855f7' : 'var(--text-secondary)',
                      background: isActive ? 'rgba(168, 85, 247, 0.08)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'rgba(168, 85, 247, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <item.icon size={17} style={{ flexShrink: 0 }} />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        )}

        {/* Hot Sectors */}
        <div style={{ padding: '0 12px', marginTop: '16px', flex: 1, overflowY: 'auto' }} className="no-scrollbar">
          <p style={{
            padding: '0 12px',
            marginBottom: '8px',
            fontSize: '9px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: 'var(--text-muted)',
          }}>
            Hot Sectors
          </p>
          {hotSectors.map((sector) => (
            <Link key={sector.id} href={`/sector/${sector.id}`}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 14px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  marginBottom: '2px',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: '14px' }}>{sector.icon}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sector.label}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* User Footer */}
        <div style={{ flexShrink: 0, padding: '16px', borderTop: '1px solid var(--border-subtle)' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0' }}>
              <div className="animate-spin"
                style={{ width: '16px', height: '16px', border: '2px solid rgba(59, 130, 246, 0.15)', borderTopColor: 'var(--accent-blue)', borderRadius: '50%' }} />
            </div>
          ) : user ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'white',
                    flexShrink: 0,
                    background: 'var(--gradient-brand)',
                  }}
                >
                  {userInitials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{userDisplayName}</p>
                  <p style={{ fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{user.email}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                style={{
                  padding: '8px',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                  color: 'var(--accent-red)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-red-dim)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                title="Sign Out"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <Link href="/login" style={{ display: 'block', width: '100%' }}>
              <div
                className="btn-shine"
                style={{
                  width: '100%',
                  padding: '10px 0',
                  borderRadius: '12px',
                  textAlign: 'center',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'var(--gradient-brand)',
                  boxShadow: '0 4px 16px rgba(59, 130, 246, 0.2)',
                }}
              >
                Sign In / Join
              </div>
            </Link>
          )}
        </div>

        {/* Market Status */}
        <div style={{ padding: '0 16px 16px', flexShrink: 0 }}>
          <div
            style={{
              borderRadius: '12px',
              padding: '12px',
              transition: 'all 0.2s ease',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: marketOpen ? 'var(--accent-green)' : 'var(--accent-red)',
                  animation: marketOpen ? 'pulseGlow 2s infinite' : 'none',
                  boxShadow: marketOpen ? '0 0 6px var(--accent-green)' : 'none',
                }}
              />
              <span style={{ fontSize: '10px', fontWeight: 500, color: marketOpen ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                {mounted ? (marketOpen ? 'Market Open' : 'Market Closed') : '—'}
              </span>
            </div>
            <p style={{ fontSize: '9px', marginTop: '4px', color: 'var(--text-disabled)' }}>
              Last updated: {mounted ? new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--'}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
