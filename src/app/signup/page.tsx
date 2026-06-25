'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle, ShieldCheck, Shield, Sparkles, Star, Rocket } from 'lucide-react';

export default function SignupPage() {
  const { signUp, user } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

    if (!email || !password || !confirmPassword) {
      setErrorMsg('Please fill in all fields.');
      setHasError(true);
      setTimeout(() => setHasError(false), 500);
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      setHasError(true);
      setTimeout(() => setHasError(false), 500);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      setHasError(true);
      setTimeout(() => setHasError(false), 500);
      return;
    }

    setLoading(true);

    try {
      const { error } = await signUp(email, password);
      if (error) {
        setErrorMsg(error.message || 'Failed to sign up.');
        setHasError(true);
        setTimeout(() => setHasError(false), 500);
      } else {
        setSuccessMsg('Account created successfully! Check your email for verification, or sign in now.');
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
      setHasError(true);
      setTimeout(() => setHasError(false), 500);
    } finally {
      setLoading(false);
    }
  };

  const perks = [
    { icon: Sparkles, title: 'AI-Powered Insights', desc: 'Deep analysis of market trends and sector sentiments' },
    { icon: Star, title: 'Custom Watchlists', desc: 'Save and sync your personalized stock watchlists' },
    { icon: Rocket, title: 'Real-time Alerts', desc: 'Get notified on breaking news and price movements' },
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
          background: 'linear-gradient(160deg, rgba(15, 10, 40, 0.95) 0%, rgba(6, 9, 20, 0.98) 50%, rgba(15, 23, 42, 0.95) 100%)',
        }}
      >
        {/* Animated mesh gradient orbs */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <div
            className="animate-float animate-morph"
            style={{
              position: 'absolute',
              top: '8%', left: '15%',
              width: '380px', height: '380px',
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.18) 0%, rgba(139, 92, 246, 0.04) 40%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            className="animate-float-reverse animate-morph"
            style={{
              position: 'absolute',
              bottom: '12%', right: '8%',
              width: '320px', height: '320px',
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.14) 0%, rgba(59, 130, 246, 0.03) 40%, transparent 70%)',
              filter: 'blur(60px)',
              animationDelay: '2s',
            }}
          />
          <div
            className="animate-float animate-morph"
            style={{
              position: 'absolute',
              top: '55%', left: '45%',
              width: '280px', height: '280px',
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.07) 0%, transparent 70%)',
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
                linear-gradient(rgba(139, 92, 246, 0.025) 1px, transparent 1px),
                linear-gradient(90deg, rgba(139, 92, 246, 0.025) 1px, transparent 1px)
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
            background: 'linear-gradient(to bottom, transparent, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2), transparent)',
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
                background: 'rgba(139, 92, 246, 0.12)',
                color: 'var(--accent-purple)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
              }}>
                FREE FOREVER
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
            Join the
            <br />
            <span className="gradient-text" style={{ fontSize: '44px' }}>smart investors</span>
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
            Create your free account to save watchlists, get personalized alerts, and access AI-powered market insights.
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
            {['Free Forever', 'Cloud Sync', 'AI Insights', 'Custom Watchlists'].map((feature) => (
              <span
                key={feature}
                style={{
                  padding: '8px 16px',
                  borderRadius: '100px',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: 'rgba(139, 92, 246, 0.08)',
                  border: '1px solid rgba(139, 92, 246, 0.15)',
                  color: 'var(--accent-purple)',
                  transition: 'all 0.3s ease',
                }}
              >
                {feature}
              </span>
            ))}
          </div>

          {/* Perks list */}
          <div
            className="animate-fade-in-up"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              marginTop: '36px',
              animationDelay: '0.5s',
            }}
          >
            {perks.map((perk) => (
              <div
                key={perk.title}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  padding: '16px 18px',
                  borderRadius: '14px',
                  background: 'rgba(15, 20, 42, 0.5)',
                  border: '1px solid var(--border-subtle)',
                  backdropFilter: 'blur(8px)',
                  transition: 'all 0.3s ease',
                }}
              >
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--accent-purple-dim)',
                  flexShrink: 0,
                }}>
                  <perk.icon size={16} style={{ color: 'var(--accent-purple)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '2px' }}>{perk.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{perk.desc}</div>
                </div>
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
            © {new Date().getFullYear()} MarketPulse AI · Your data is encrypted and never shared
          </p>
        </div>
      </div>

      {/* ─── Right Panel — Signup Form ─── */}
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
          background: 'radial-gradient(ellipse at 30% 20%, rgba(139, 92, 246, 0.04) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(59, 130, 246, 0.03) 0%, transparent 60%)',
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
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
        </div>

        <div style={{ width: '100%', maxWidth: '440px', position: 'relative', zIndex: 10 }}>
          {/* Mobile brand header */}
          <div className="lg:hidden" style={{ textAlign: 'center', marginBottom: '36px' }}>
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
              Create your free account
            </p>
          </div>

          {/* Desktop form header */}
          <div className="hidden lg:block" style={{ marginBottom: '32px' }}>
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
              Create Account
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
              Join to track and sync your stock watchlists
            </p>
          </div>

          {/* Form Card */}
          <form
            onSubmit={handleSubmit}
            className={`animate-fade-in-up ${hasError ? 'animate-shake' : ''}`}
            style={{
              animationDelay: '0.25s',
              borderRadius: '20px',
              padding: '28px 32px',
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
                  marginBottom: '20px',
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
                  marginBottom: '20px',
                  background: 'var(--accent-green-dim)',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                }}
              >
                <CheckCircle size={16} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
                <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--accent-green)' }}>{successMsg}</p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Email */}
              <div className="animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                <label style={{
                  display: 'block',
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: '8px',
                  color: 'var(--text-muted)',
                }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    id="signup-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      width: '100%',
                      borderRadius: '12px',
                      paddingLeft: '48px',
                      paddingRight: '16px',
                      paddingTop: '13px',
                      paddingBottom: '13px',
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
                  marginBottom: '8px',
                  color: 'var(--text-muted)',
                }}>
                  Password (min 6 chars)
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      width: '100%',
                      borderRadius: '12px',
                      paddingLeft: '48px',
                      paddingRight: '48px',
                      paddingTop: '13px',
                      paddingBottom: '13px',
                      fontSize: '14px',
                      color: 'white',
                      background: 'rgba(10, 14, 28, 0.7)',
                      border: '1px solid var(--border-color)',
                      outline: 'none',
                      transition: 'all 0.25s ease',
                    }}
                    placeholder="••••••••"
                    autoComplete="new-password"
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

              {/* Confirm Password */}
              <div className="animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                <label style={{
                  display: 'block',
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: '8px',
                  color: 'var(--text-muted)',
                }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <ShieldCheck size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    id="signup-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{
                      width: '100%',
                      borderRadius: '12px',
                      paddingLeft: '48px',
                      paddingRight: '16px',
                      paddingTop: '13px',
                      paddingBottom: '13px',
                      fontSize: '14px',
                      color: 'white',
                      background: 'rgba(10, 14, 28, 0.7)',
                      border: '1px solid var(--border-color)',
                      outline: 'none',
                      transition: 'all 0.25s ease',
                    }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              id="signup-submit"
              type="submit"
              disabled={loading}
              className="btn-shine animate-fade-in-up"
              style={{
                width: '100%',
                marginTop: '24px',
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
                animationDelay: '0.45s',
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
                  Creating Account...
                </span>
              ) : (
                'Create Account'
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
                marginTop: '14px',
                animationDelay: '0.5s',
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
              marginTop: '28px',
              color: 'var(--text-secondary)',
              animationDelay: '0.55s',
            }}
          >
            Already have an account?{' '}
            <Link
              href="/login"
              style={{
                fontWeight: 700,
                color: 'var(--accent-blue)',
                textDecoration: 'none',
                transition: 'color 0.2s ease',
              }}
            >
              Sign In
            </Link>
          </p>

          <p
            className="lg:hidden animate-fade-in"
            style={{
              textAlign: 'center',
              fontSize: '11px',
              marginTop: '16px',
              color: 'var(--text-disabled)',
              animationDelay: '0.6s',
            }}
          >
            © {new Date().getFullYear()} MarketPulse AI
          </p>
        </div>
      </div>
    </div>
  );
}
