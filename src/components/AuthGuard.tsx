'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, userStatus, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const isApiRoute = pathname.startsWith('/api/');

  useEffect(() => {
    if (loading) return;

    if (!user && !isAuthPage) {
      router.push('/login');
    } else if (user && isAuthPage) {
      router.push('/');
    }
  }, [user, loading, isAuthPage, router]);

  // Premium loading splash
  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute animate-float animate-morph"
            style={{
              top: '-15%', left: '-10%',
              width: '500px', height: '500px',
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.06) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            className="absolute animate-float-reverse animate-morph"
            style={{
              bottom: '-15%', right: '-10%',
              width: '400px', height: '400px',
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 70%)',
              filter: 'blur(60px)',
              animationDelay: '2s',
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-6 animate-fade-in-up">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl animate-pulse-glow" style={{ margin: '-4px' }} />
            <div
              className="relative w-16 h-16 rounded-2xl flex items-center justify-center text-2xl"
              style={{
                background: 'var(--gradient-brand)',
                boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)',
              }}
            >
              🧠
            </div>
            <div
              className="absolute inset-0 rounded-2xl border-2 animate-pulse-ring"
              style={{ borderColor: 'rgba(59, 130, 246, 0.3)' }}
            />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold gradient-text">MarketPulse AI</h1>
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase mt-1" style={{ color: 'var(--text-muted)' }}>
              Sentiment Intelligence
            </p>
          </div>
          <div className="relative w-7 h-7">
            <div
              className="absolute inset-0 rounded-full border-2 animate-spin"
              style={{ borderColor: 'rgba(59, 130, 246, 0.15)', borderTopColor: 'var(--accent-blue)' }}
            />
          </div>
          <p className="text-[10px] font-medium tracking-wider uppercase animate-pulse" style={{ color: 'var(--text-disabled)' }}>
            Initializing Session...
          </p>
        </div>
      </div>
    );
  }

  if (!user && !isAuthPage) {
    return null;
  }

  if (user && isAuthPage) {
    return null;
  }

  // ─── Access Control Gate ───────────────────────────────────────────
  // Block users who are pending approval or revoked
  if (user && !isAuthPage && userStatus !== 'approved' && userStatus !== 'loading') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute animate-float animate-morph"
            style={{
              top: '-15%', left: '-10%',
              width: '500px', height: '500px',
              background: 'radial-gradient(circle, rgba(255, 77, 106, 0.06) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-6 animate-fade-in-up max-w-md text-center px-6">
          {/* Status Icon */}
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl"
            style={{
              background: userStatus === 'pending'
                ? 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.15))'
                : 'linear-gradient(135deg, rgba(255,77,106,0.15), rgba(239,68,68,0.15))',
              border: `1px solid ${userStatus === 'pending' ? 'rgba(251,191,36,0.2)' : 'rgba(255,77,106,0.2)'}`,
            }}
          >
            {userStatus === 'pending' ? '⏳' : '🚫'}
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {userStatus === 'pending' ? 'Access Pending' : 'Access Revoked'}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {userStatus === 'pending'
                ? 'Your account is awaiting admin approval. You will be notified once access is granted.'
                : 'Your access has been revoked by an administrator. Please contact support if you believe this is an error.'}
            </p>
          </div>

          <div className="glass-card-static rounded-xl p-4 w-full" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Account</span>
              <span className="font-bold text-white">{user.email}</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-2">
              <span style={{ color: 'var(--text-muted)' }}>Status</span>
              <span className="font-bold px-2 py-0.5 rounded-full text-[10px]"
                style={{
                  background: userStatus === 'pending' ? 'rgba(251,191,36,0.15)' : 'rgba(255,77,106,0.15)',
                  color: userStatus === 'pending' ? '#fbbf24' : '#ff4d6a',
                }}>
                {userStatus === 'pending' ? '⏳ PENDING APPROVAL' : '🚫 REVOKED'}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={async () => {
                await signOut();
                window.location.href = '/login';
              }}
              className="text-xs px-5 py-2.5 rounded-xl font-bold cursor-pointer transition-all hover:brightness-110"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
            >
              Sign Out
            </button>
            <button
              onClick={() => window.location.reload()}
              className="text-xs px-5 py-2.5 rounded-xl font-bold cursor-pointer transition-all hover:brightness-110"
              style={{ background: 'var(--gradient-brand)', color: 'white' }}
            >
              Check Again
            </button>
          </div>

          <p className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>
            Contact the administrator for faster access.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
