'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

export default function LoginPage() {
  const { signIn, user } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (user) {
    router.push('/');
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      setHasError(true);
      setTimeout(() => setHasError(false), 500);
      return;
    }

    setLoading(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        setErrorMsg(error.message || 'Failed to sign in. Please check your credentials.');
        setHasError(true);
        setTimeout(() => setHasError(false), 500);
      } else {
        setSuccessMsg('Signed in successfully! Redirecting...');
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 1200);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
      setHasError(true);
      setTimeout(() => setHasError(false), 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)', display: 'flex' }}>
      {/* ─── Left Panel — Brand Showcase (hidden on mobile) ─── */}
      <div
        className="hidden lg:flex"
        style={{ width: '45%', minHeight: '100vh', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}
      >
        {/* Animated mesh gradient */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute animate-float animate-morph"
            style={{
              top: '10%', left: '15%',
              width: '350px', height: '350px',
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            className="absolute animate-float-reverse animate-morph"
            style={{
              bottom: '15%', right: '10%',
              width: '300px', height: '300px',
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%)',
              filter: 'blur(60px)',
              animationDelay: '3s',
            }}
          />
          <div
            className="absolute animate-float animate-morph"
            style={{
              top: '55%', left: '50%',
              width: '250px', height: '250px',
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.06) 0%, transparent 70%)',
              filter: 'blur(60px)',
              animationDelay: '5s',
            }}
          />
          {/* Grid pattern */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(rgba(59, 130, 246, 0.025) 1px, transparent 1px),
                linear-gradient(90deg, rgba(59, 130, 246, 0.025) 1px, transparent 1px)
              `,
              backgroundSize: '48px 48px',
            }}
          />
        </div>

        {/* Content */}
        <div className="relative" style={{ zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, padding: '0 48px', paddingLeft: '48px', paddingRight: '48px' }}>
          <div className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-8 animate-pulse-glow"
              style={{ background: 'var(--gradient-brand)', boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)' }}
            >
              🧠
            </div>
          </div>

          <h2
            className="text-4xl xl:text-5xl font-extrabold text-white leading-tight animate-fade-in-up"
            style={{ animationDelay: '0.2s' }}
          >
            AI-powered
            <br />
            <span className="gradient-text">market intelligence</span>
          </h2>

          <p
            className="mt-5 text-base leading-relaxed animate-fade-in-up"
            style={{ color: 'var(--text-secondary)', maxWidth: '420px', animationDelay: '0.3s' }}
          >
            Track sector sentiments, analyze news with AI, and get real-time market insights for Indian stocks.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2.5 mt-8 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            {['Sentiment Analysis', 'Live News Feed', 'Sector Tracking', 'AI Predictions'].map((feature) => (
              <span
                key={feature}
                className="px-3.5 py-2 rounded-full text-xs font-medium"
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.15)',
                  color: 'var(--accent-blue)',
                }}
              >
                {feature}
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative animate-fade-in" style={{ zIndex: 10, padding: '0 48px', paddingBottom: '32px', animationDelay: '0.6s' }}>
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>
            © {new Date().getFullYear()} MarketPulse AI · Indian Stock Market Intelligence
          </p>
        </div>
      </div>

      {/* ─── Right Panel — Login Form ─── */}
      <div
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', position: 'relative', background: 'rgba(10, 14, 26, 0.5)' }}
      >
        {/* Mobile background accents */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none lg:hidden">
          <div
            className="absolute animate-float animate-morph"
            style={{
              top: '-10%', right: '-10%',
              width: '300px', height: '300px',
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.06) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            className="absolute animate-float-reverse"
            style={{
              bottom: '-10%', left: '-10%',
              width: '250px', height: '250px',
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
        </div>

        <div style={{ width: '100%', maxWidth: '448px', position: 'relative', zIndex: 10 }}>
          {/* Mobile brand header */}
          <div className="text-center mb-10 lg:hidden animate-fade-in-up">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-5 animate-pulse-glow"
              style={{ background: 'var(--gradient-brand)', boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)' }}
            >
              🧠
            </div>
            <h1 className="text-2xl font-bold gradient-text">MarketPulse AI</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Sign in to access your dashboard</p>
          </div>

          {/* Desktop form header */}
          <div className="hidden lg:block mb-10 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            <h2 className="text-3xl font-bold text-white">Welcome back</h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Sign in to access advanced features and sync your watchlist
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className={`glass-card-static rounded-2xl p-7 sm:p-8 animate-fade-in-up ${hasError ? 'animate-shake' : ''}`}
            style={{
              animationDelay: '0.2s',
              border: errorMsg
                ? '1px solid rgba(244, 63, 94, 0.3)'
                : '1px solid var(--border-color)',
              transition: 'border-color 0.3s ease',
            }}
          >
            {/* Error Banner */}
            {errorMsg && (
              <div
                className="flex items-center gap-3 rounded-xl px-4 py-3 mb-6 animate-fade-in-up"
                style={{
                  background: 'var(--accent-red-dim)',
                  border: '1px solid rgba(244, 63, 94, 0.15)',
                }}
              >
                <AlertCircle size={16} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
                <p className="text-xs font-medium" style={{ color: 'var(--accent-red)' }}>{errorMsg}</p>
              </div>
            )}

            {/* Success Banner */}
            {successMsg && (
              <div
                className="flex items-center gap-3 rounded-xl px-4 py-3 mb-6 animate-fade-in-up"
                style={{
                  background: 'var(--accent-green-dim)',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                }}
              >
                <CheckCircle size={16} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
                <p className="text-xs font-medium" style={{ color: 'var(--accent-green)' }}>{successMsg}</p>
              </div>
            )}

            <div className="flex flex-col gap-5">
              {/* Email */}
              <div className="animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-muted)' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      width: '100%',
                      borderRadius: '12px',
                      paddingLeft: '48px',
                      paddingRight: '16px',
                      paddingTop: '14px',
                      paddingBottom: '14px',
                      fontSize: '14px',
                      color: 'white',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      outline: 'none',
                      transition: 'all 0.2s ease',
                    }}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-muted)' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      width: '100%',
                      borderRadius: '12px',
                      paddingLeft: '48px',
                      paddingRight: '48px',
                      paddingTop: '14px',
                      paddingBottom: '14px',
                      fontSize: '14px',
                      color: 'white',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      outline: 'none',
                      transition: 'all 0.2s ease',
                    }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', transition: 'color 0.25s ease' }}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="btn-shine animate-fade-in-up"
              style={{
                width: '100%',
                marginTop: '28px',
                color: 'white',
                fontWeight: 600,
                paddingTop: '14px',
                paddingBottom: '14px',
                borderRadius: '12px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                transition: 'all 0.3s ease',
                fontSize: '14px',
                background: loading ? 'rgba(59, 130, 246, 0.6)' : 'var(--gradient-brand)',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(59, 130, 246, 0.25)',
                animationDelay: '0.35s',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2.5">
                  <span className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.25)', borderTopColor: 'white' }} />
                  Signing In...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs mt-8 animate-fade-in" style={{ color: 'var(--text-secondary)', animationDelay: '0.4s' }}>
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-bold hover:underline" style={{ color: 'var(--accent-blue)' }}>
              Sign Up
            </Link>
          </p>

          <p className="text-center text-xs mt-4 lg:hidden animate-fade-in" style={{ color: 'var(--text-disabled)', animationDelay: '0.5s' }}>
            © {new Date().getFullYear()} MarketPulse AI
          </p>
        </div>
      </div>
    </div>
  );
}
