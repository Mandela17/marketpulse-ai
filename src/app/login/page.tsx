'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle, TrendingUp, BarChart3, Shield, Zap } from 'lucide-react';

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const stats = [
    { label: 'Active Users', value: '12,400+', icon: TrendingUp },
    { label: 'Markets Tracked', value: '5,200+', icon: BarChart3 },
    { label: 'AI Accuracy', value: '94.7%', icon: Zap },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      position: 'relative' as const,
      overflow: 'hidden',
    }}>
      {/* ─── Left Panel — Brand Showcase ─── */}
      <div
        className="hidden lg:flex"
        style={{
          width: '48%',
          minHeight: '100vh',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(160deg, rgba(15, 23, 42, 0.95) 0%, rgba(6, 9, 20, 0.98) 50%, rgba(15, 10, 40, 0.95) 100%)',
        }}
      >
        {/* Animated mesh gradient orbs */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <div
            className="animate-float animate-morph"
            style={{
              position: 'absolute',
              top: '5%', left: '10%',
              width: '400px', height: '400px',
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.18) 0%, rgba(59, 130, 246, 0.04) 40%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            className="animate-float-reverse animate-morph"
            style={{
              position: 'absolute',
              bottom: '10%', right: '5%',
              width: '350px', height: '350px',
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.03) 40%, transparent 70%)',
              filter: 'blur(60px)',
              animationDelay: '2s',
            }}
          />
          <div
            className="animate-float animate-morph"
            style={{
              position: 'absolute',
              top: '50%', left: '40%',
              width: '300px', height: '300px',
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%)',
              filter: 'blur(60px)',
              animationDelay: '4s',
            }}
          />

          {/* Grid pattern overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
                linear-gradient(rgba(59, 130, 246, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(59, 130, 246, 0.03) 1px, transparent 1px)
              `,
              backgroundSize: '48px 48px',
              maskImage: 'radial-gradient(ellipse at 50% 50%, black 30%, transparent 80%)',
              WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 30%, transparent 80%)',
            }}
          />

          {/* Decorative border line on right */}
          <div style={{
            position: 'absolute',
            right: 0,
            top: '10%',
            bottom: '10%',
            width: '1px',
            background: 'linear-gradient(to bottom, transparent, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2), transparent)',
          }} />
        </div>

        {/* Content */}
        <div style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
          padding: '0 56px',
        }}>
          {/* Logo + badge */}
          <div
            className="animate-fade-in-up"
            style={{
              animationDelay: '0.1s',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.5s ease',
            }}
          >
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '32px',
            }}>
              <div
                className="animate-pulse-glow"
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  background: 'var(--gradient-brand)',
                  boxShadow: '0 8px 32px rgba(59, 130, 246, 0.35)',
                }}
              >
                🧠
              </div>
              <span style={{
                padding: '4px 12px',
                borderRadius: '100px',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.05em',
                background: 'rgba(16, 185, 129, 0.12)',
                color: 'var(--accent-green)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
              }}>
                ● LIVE
              </span>
            </div>
          </div>

          {/* Headline */}
          <h2
            className="animate-fade-in-up"
            style={{
              fontSize: '42px',
              fontWeight: 800,
              color: '#fff',
              lineHeight: 1.15,
              animationDelay: '0.2s',
              letterSpacing: '-0.02em',
            }}
          >
            AI-powered
            <br />
            <span className="gradient-text" style={{ fontSize: '44px' }}>market intelligence</span>
          </h2>

          {/* Subheading */}
          <p
            className="animate-fade-in-up"
            style={{
              marginTop: '20px',
              fontSize: '15px',
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
              maxWidth: '420px',
              animationDelay: '0.3s',
            }}
          >
            Track sector sentiments, analyze news with AI, and get real-time market insights for Indian stocks.
          </p>

          {/* Feature pills */}
          <div
            className="animate-fade-in-up"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              marginTop: '28px',
              animationDelay: '0.4s',
            }}
          >
            {['Sentiment Analysis', 'Live News Feed', 'Sector Tracking', 'AI Predictions'].map((feature) => (
              <span
                key={feature}
                style={{
                  padding: '8px 16px',
                  borderRadius: '100px',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.15)',
                  color: 'var(--accent-blue)',
                  transition: 'all 0.3s ease',
                }}
              >
                {feature}
              </span>
            ))}
          </div>

          {/* Stats row */}
          <div
            className="animate-fade-in-up"
            style={{
              display: 'flex',
              gap: '24px',
              marginTop: '40px',
              padding: '20px 24px',
              borderRadius: '16px',
              background: 'rgba(15, 20, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              backdropFilter: 'blur(12px)',
              animationDelay: '0.5s',
            }}
          >
            {stats.map((stat, i) => (
              <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: i === 0 ? 'var(--accent-blue-dim)' : i === 1 ? 'var(--accent-purple-dim)' : 'var(--accent-green-dim)',
                }}>
                  <stat.icon size={16} style={{ color: i === 0 ? 'var(--accent-blue)' : i === 1 ? 'var(--accent-purple)' : 'var(--accent-green)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{stat.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.02em' }}>{stat.label}</div>
                </div>
                {i < stats.length - 1 && (
                  <div style={{ width: '1px', height: '32px', background: 'var(--border-color)', marginLeft: '12px' }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          className="animate-fade-in"
          style={{
            position: 'relative',
            zIndex: 10,
            padding: '0 56px',
            paddingBottom: '28px',
            animationDelay: '0.6s',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <Shield size={14} style={{ color: 'var(--text-disabled)' }} />
          <p style={{ fontSize: '11px', color: 'var(--text-disabled)' }}>
            © {new Date().getFullYear()} MarketPulse AI · Enterprise-grade security · SOC 2 compliant
          </p>
        </div>
      </div>

      {/* ─── Right Panel — Login Form ─── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          position: 'relative',
        }}
      >
        {/* Subtle background gradient for right panel */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 70% 20%, rgba(59, 130, 246, 0.04) 0%, transparent 60%), radial-gradient(ellipse at 30% 80%, rgba(139, 92, 246, 0.03) 0%, transparent 60%)',
          pointerEvents: 'none',
        }} />

        {/* Mobile background accents */}
        <div className="lg:hidden" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <div
            className="animate-float animate-morph"
            style={{
              position: 'absolute',
              top: '-10%', right: '-10%',
              width: '300px', height: '300px',
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            className="animate-float-reverse"
            style={{
              position: 'absolute',
              bottom: '-10%', left: '-10%',
              width: '250px', height: '250px',
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
        </div>

        <div style={{ width: '100%', maxWidth: '440px', position: 'relative', zIndex: 10 }}>
          {/* Mobile brand header */}
          <div className="lg:hidden" style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div
              className="animate-pulse-glow animate-fade-in-up"
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                margin: '0 auto 20px',
                background: 'var(--gradient-brand)',
                boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)',
              }}
            >
              🧠
            </div>
            <h1 className="gradient-text animate-fade-in-up" style={{ fontSize: '24px', fontWeight: 700, animationDelay: '0.1s' }}>
              MarketPulse AI
            </h1>
            <p className="animate-fade-in-up" style={{ fontSize: '13px', marginTop: '4px', color: 'var(--text-muted)', animationDelay: '0.15s' }}>
              Sign in to access your dashboard
            </p>
          </div>

          {/* Desktop form header */}
          <div className="hidden lg:block" style={{ marginBottom: '36px' }}>
            <h2
              className="animate-fade-in-up"
              style={{
                fontSize: '30px',
                fontWeight: 700,
                color: '#fff',
                letterSpacing: '-0.01em',
                animationDelay: '0.15s',
              }}
            >
              Welcome back
            </h2>
            <p
              className="animate-fade-in-up"
              style={{
                marginTop: '8px',
                fontSize: '14px',
                color: 'var(--text-secondary)',
                animationDelay: '0.2s',
              }}
            >
              Sign in to access advanced features and sync your watchlist
            </p>
          </div>

          {/* Form Card */}
          <form
            onSubmit={handleSubmit}
            className={`animate-fade-in-up ${hasError ? 'animate-shake' : ''}`}
            style={{
              animationDelay: '0.25s',
              borderRadius: '20px',
              padding: '32px',
              background: 'rgba(15, 20, 42, 0.55)',
              backdropFilter: 'blur(20px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
              border: errorMsg
                ? '1px solid rgba(244, 63, 94, 0.3)'
                : '1px solid var(--border-color)',
              boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.02)',
              transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
            }}
          >
            {/* Error Banner */}
            {errorMsg && (
              <div
                className="animate-fade-in-up"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  marginBottom: '24px',
                  background: 'var(--accent-red-dim)',
                  border: '1px solid rgba(244, 63, 94, 0.15)',
                }}
              >
                <AlertCircle size={16} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
                <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--accent-red)' }}>{errorMsg}</p>
              </div>
            )}

            {/* Success Banner */}
            {successMsg && (
              <div
                className="animate-fade-in-up"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  marginBottom: '24px',
                  background: 'var(--accent-green-dim)',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                }}
              >
                <CheckCircle size={16} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
                <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--accent-green)' }}>{successMsg}</p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Email */}
              <div className="animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                <label style={{
                  display: 'block',
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: '10px',
                  color: 'var(--text-muted)',
                }}>
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
                      background: 'rgba(10, 14, 28, 0.7)',
                      border: '1px solid var(--border-color)',
                      outline: 'none',
                      transition: 'all 0.25s ease',
                    }}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="animate-fade-in-up" style={{ animationDelay: '0.35s' }}>
                <label style={{
                  display: 'block',
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: '10px',
                  color: 'var(--text-muted)',
                }}>
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
                      background: 'rgba(10, 14, 28, 0.7)',
                      border: '1px solid var(--border-color)',
                      outline: 'none',
                      transition: 'all 0.25s ease',
                    }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '16px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      transition: 'color 0.25s ease',
                    }}
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
                paddingTop: '15px',
                paddingBottom: '15px',
                borderRadius: '12px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                transition: 'all 0.3s ease',
                fontSize: '14px',
                letterSpacing: '0.02em',
                background: loading ? 'rgba(59, 130, 246, 0.6)' : 'var(--gradient-brand)',
                boxShadow: loading ? 'none' : '0 4px 24px rgba(59, 130, 246, 0.3), 0 1px 3px rgba(0,0,0,0.2)',
                animationDelay: '0.4s',
              }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                  <span style={{
                    width: '18px',
                    height: '18px',
                    border: '2px solid rgba(255,255,255,0.25)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    display: 'inline-block',
                  }} className="animate-spin" />
                  Signing In...
                </span>
              ) : (
                'Sign In'
              )}
            </button>

            {/* Security badge */}
            <div
              className="animate-fade-in"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                marginTop: '16px',
                animationDelay: '0.45s',
              }}
            >
              <Shield size={12} style={{ color: 'var(--text-disabled)' }} />
              <span style={{ fontSize: '10px', color: 'var(--text-disabled)', letterSpacing: '0.03em' }}>
                Encrypted & secure connection
              </span>
            </div>
          </form>

          {/* Footer */}
          <p
            className="animate-fade-in"
            style={{
              textAlign: 'center',
              fontSize: '13px',
              marginTop: '32px',
              color: 'var(--text-secondary)',
              animationDelay: '0.5s',
            }}
          >
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              style={{
                fontWeight: 700,
                color: 'var(--accent-blue)',
                textDecoration: 'none',
                transition: 'color 0.2s ease',
              }}
            >
              Sign Up
            </Link>
          </p>

          <p
            className="lg:hidden animate-fade-in"
            style={{
              textAlign: 'center',
              fontSize: '11px',
              marginTop: '16px',
              color: 'var(--text-disabled)',
              animationDelay: '0.55s',
            }}
          >
            © {new Date().getFullYear()} MarketPulse AI
          </p>
        </div>
      </div>
    </div>
  );
}
