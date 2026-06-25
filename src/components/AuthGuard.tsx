'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAuthPage = pathname === '/login' || pathname === '/signup';

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
        {/* Animated background orbs */}
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

        {/* Splash content */}
        <div className="relative z-10 flex flex-col items-center gap-6 animate-fade-in-up">
          {/* Logo */}
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

          {/* Brand text */}
          <div className="text-center">
            <h1 className="text-xl font-bold gradient-text">MarketPulse AI</h1>
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase mt-1" style={{ color: 'var(--text-muted)' }}>
              Sentiment Intelligence
            </p>
          </div>

          {/* Spinner */}
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

  return <>{children}</>;
}
